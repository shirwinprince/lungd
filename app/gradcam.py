"""
app/gradcam.py — Grad-CAM Heatmap Generator for LungScan AI

Generates Gradient-weighted Class Activation Maps (Grad-CAM) to visualise
which regions of a chest X-ray the DenseNet121 model focused on when making
its classification decision.

Handles nested Keras sub-models (DenseNet121 used as a layer inside a
larger Functional model) by splitting the forward pass into base-model
feature extraction + head-layer application.

Reference:  Selvaraju et al., "Grad-CAM: Visual Explanations from Deep
            Networks via Gradient-based Localization", ICCV 2017.
"""

from __future__ import annotations

import base64
import io
import logging
from typing import Optional

import numpy as np
import tensorflow as tf
from PIL import Image

from app.config import IMG_SIZE

logger = logging.getLogger(__name__)

# ── Candidate layer names for the last conv layer in DenseNet121 ──────────
_CANDIDATE_LAYERS = [
    "conv5_block16_2_conv",   # last 3×3 conv in final dense block
    "conv5_block16_concat",   # concat output of final dense block
]


def _find_conv_layer_and_base(model: tf.keras.Model):
    """
    Walk the model to find the target convolutional layer.

    Returns
    -------
    (conv_layer, base_model, is_nested)
        conv_layer:  the Keras layer object
        base_model:  the (sub-)model that contains it
        is_nested:   True if the conv layer lives inside a sub-model
    """
    # 1. Try candidate names in nested sub-models first
    for layer in model.layers:
        if isinstance(layer, tf.keras.Model):
            for name in _CANDIDATE_LAYERS:
                try:
                    conv = layer.get_layer(name)
                    logger.info("Grad-CAM: found '%s' in sub-model '%s'", name, layer.name)
                    return conv, layer, True
                except ValueError:
                    continue
            # Fallback: last Conv2D in the sub-model
            last_conv = None
            for sub_layer in layer.layers:
                if isinstance(sub_layer, tf.keras.layers.Conv2D):
                    last_conv = sub_layer
            if last_conv:
                logger.info("Grad-CAM: using fallback last Conv2D '%s' in sub-model '%s'", last_conv.name, layer.name)
                return last_conv, layer, True

    # 2. Try candidate names in top-level model
    for name in _CANDIDATE_LAYERS:
        try:
            conv = model.get_layer(name)
            logger.info("Grad-CAM: found '%s' in top-level model", name)
            return conv, model, False
        except ValueError:
            continue

    # 3. Fallback: last Conv2D in top-level model
    last_conv = None
    for layer in model.layers:
        if isinstance(layer, tf.keras.layers.Conv2D):
            last_conv = layer
    if last_conv:
        logger.info("Grad-CAM: using fallback last Conv2D '%s' in top-level model", last_conv.name)
        return last_conv, model, False

    raise RuntimeError("Could not find any Conv2D layer for Grad-CAM.")


def generate_gradcam(
    model: tf.keras.Model,
    input_tensor: np.ndarray,
    class_index: int,
) -> np.ndarray:
    """
    Compute the Grad-CAM heatmap for a given class.

    Parameters
    ----------
    model : tf.keras.Model
        The full classification model (may have nested sub-models).
    input_tensor : np.ndarray
        Preprocessed image, shape (1, 299, 299, 3), values in [0, 1].
    class_index : int
        Target class index (0–4).

    Returns
    -------
    np.ndarray
        Heatmap of shape (IMG_SIZE, IMG_SIZE), values in [0, 1].
    """
    conv_layer, base_model, is_nested = _find_conv_layer_and_base(model)

    input_tf = tf.cast(tf.constant(input_tensor), tf.float32)

    if not is_nested:
        # ── SIMPLE CASE: conv layer is in the top-level model ────────────
        grad_model = tf.keras.Model(
            inputs=model.input,
            outputs=[conv_layer.output, model.output],
        )
        with tf.GradientTape() as tape:
            conv_out, preds = grad_model(input_tf)
            tape.watch(conv_out)
            target_score = preds[:, class_index]

        grads = tape.gradient(target_score, conv_out)

    else:
        # ── NESTED CASE: conv layer inside a sub-model (DenseNet121) ─────
        # Build a feature extractor from the base sub-model that outputs
        # both the conv layer activations and the sub-model's final output.
        feature_extractor = tf.keras.Model(
            inputs=base_model.input,
            outputs=[conv_layer.output, base_model.output],
        )

        # Identify the head layers (everything after the base sub-model)
        head_layers = []
        found_base = False
        for layer in model.layers:
            if layer is base_model:
                found_base = True
                continue
            if found_base and not isinstance(layer, tf.keras.layers.InputLayer):
                head_layers.append(layer)

        logger.info(
            "Grad-CAM nested mode: base='%s', conv='%s', head_layers=%d",
            base_model.name, conv_layer.name, len(head_layers),
        )

        with tf.GradientTape() as tape:
            # Forward pass through base model → get conv features + base output
            conv_out, base_out = feature_extractor(input_tf)
            tape.watch(conv_out)

            # Forward pass through head layers (with training=False for
            # Dropout and BatchNormalization to behave correctly)
            x = base_out
            for head_layer in head_layers:
                x = head_layer(x, training=False)

            target_score = x[:, class_index]

        grads = tape.gradient(target_score, conv_out)

    # ── Compute heatmap from gradients + activations ─────────────────────
    if grads is None:
        logger.warning("Grad-CAM: gradients are None — returning blank heatmap")
        return np.zeros((IMG_SIZE, IMG_SIZE), dtype=np.float32)

    # Global average pool gradients → channel weights
    weights = tf.reduce_mean(grads, axis=(0, 1, 2))  # shape: (channels,)

    # Weighted sum of feature maps
    conv_out_squeezed = conv_out[0]  # remove batch dim → (H, W, C)
    heatmap = tf.reduce_sum(conv_out_squeezed * weights, axis=-1)  # → (H, W)

    # ReLU: only keep positive contributions
    heatmap = tf.nn.relu(heatmap)

    # Normalise to [0, 1]
    heatmap_max = tf.reduce_max(heatmap)
    if heatmap_max > 0:
        heatmap = heatmap / heatmap_max

    heatmap_np = heatmap.numpy()

    # Resize to input image size
    heatmap_resized = np.array(
        Image.fromarray((heatmap_np * 255).astype(np.uint8)).resize(
            (IMG_SIZE, IMG_SIZE), Image.LANCZOS
        ),
        dtype=np.float32,
    ) / 255.0

    return heatmap_resized


# ── Jet Colourmap (pure NumPy — no matplotlib dependency) ────────────────

def _jet_colormap(value: np.ndarray) -> np.ndarray:
    """
    Apply a jet-like colourmap to a [0, 1] normalised 2D array.

    Returns RGB uint8 array of shape (*value.shape, 3).
    """
    v = np.clip(value, 0.0, 1.0)
    r = np.clip(1.5 - np.abs(4.0 * v - 3.0), 0.0, 1.0)
    g = np.clip(1.5 - np.abs(4.0 * v - 2.0), 0.0, 1.0)
    b = np.clip(1.5 - np.abs(4.0 * v - 1.0), 0.0, 1.0)
    return (np.stack([r, g, b], axis=-1) * 255).astype(np.uint8)


def create_heatmap_overlay(
    original_img: Image.Image,
    heatmap: np.ndarray,
    alpha: float = 0.4,
) -> str:
    """
    Overlay a Grad-CAM heatmap on the original image.

    Returns a base64-encoded JPEG data URL string.
    """
    # Resize original to match heatmap
    orig_resized = original_img.resize((IMG_SIZE, IMG_SIZE), Image.LANCZOS)
    orig_arr = np.asarray(orig_resized, dtype=np.float32)

    # Apply jet colourmap
    heatmap_coloured = _jet_colormap(heatmap).astype(np.float32)

    # Blend
    blended = (1.0 - alpha) * orig_arr + alpha * heatmap_coloured
    blended = np.clip(blended, 0, 255).astype(np.uint8)

    # Encode as JPEG → base64
    overlay_img = Image.fromarray(blended, mode="RGB")
    buffer = io.BytesIO()
    overlay_img.save(buffer, format="JPEG", quality=90)
    buffer.seek(0)
    b64_str = base64.b64encode(buffer.read()).decode("utf-8")

    return f"data:image/jpeg;base64,{b64_str}"
