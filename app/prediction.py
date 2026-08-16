"""
Prediction service.

Orchestrates the full inference pipeline:
  raw bytes  →  decode  →  verify X-ray  →  preprocess  →  model.predict  →  Grad-CAM  →  result
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Dict, Optional

import numpy as np

from app.config import CLASS_NAMES
from app.model_loader import get_model
from app.preprocessing import (
    XRayCheckResult,
    decode_image,
    preprocess_for_model,
    verify_xray,
)

logger = logging.getLogger(__name__)


@dataclass
class PredictionResult:
    """Structured prediction output returned to the API layer."""

    predicted_class: str
    confidence: float
    probabilities: Dict[str, float]
    is_xray: bool
    xray_confidence: float
    xray_details: str = ""  # human-readable validation reason
    gradcam_image: Optional[str] = None  # base64-encoded heatmap overlay


def predict(raw_bytes: bytes) -> PredictionResult:
    """
    Run the full prediction pipeline on raw image bytes.

    Parameters
    ----------
    raw_bytes : bytes
        Raw content of the uploaded image file.

    Returns
    -------
    PredictionResult
        Contains the top predicted class, its confidence, per-class
        probabilities, X-ray verification flags, and Grad-CAM heatmap.

    Raises
    ------
    ValueError
        Propagated from `decode_image` if the file is not a valid image.
    """
    # 1. Decode
    img = decode_image(raw_bytes)
    logger.info("Image decoded — size %s, mode %s", img.size, img.mode)

    # 2. X-ray verification
    xray_check: XRayCheckResult = verify_xray(img)
    logger.info(
        "X-ray check: is_xray=%s, confidence=%.4f",
        xray_check.is_xray,
        xray_check.confidence,
    )

    # 3. Preprocess
    input_tensor = preprocess_for_model(img)

    # 4. Inference
    model = get_model()
    preds: np.ndarray = model.predict(input_tensor, verbose=0)
    probs = preds[0]  # shape (NUM_CLASSES,)

    # 5. Build result
    top_idx = int(np.argmax(probs))
    probabilities = {
        name: round(float(prob), 6) for name, prob in zip(CLASS_NAMES, probs)
    }

    # 6. Generate Grad-CAM heatmap
    gradcam_b64 = None
    try:
        from app.gradcam import generate_gradcam, create_heatmap_overlay

        heatmap = generate_gradcam(model, input_tensor, top_idx)
        gradcam_b64 = create_heatmap_overlay(img, heatmap, alpha=0.4)
        logger.info("Grad-CAM heatmap generated successfully.")
    except Exception as exc:
        import traceback
        logger.warning(
            "Grad-CAM generation failed (non-fatal): %s\n%s",
            exc, traceback.format_exc(),
        )

    result = PredictionResult(
        predicted_class=CLASS_NAMES[top_idx],
        confidence=round(float(probs[top_idx]), 6),
        probabilities=probabilities,
        is_xray=xray_check.is_xray,
        xray_confidence=xray_check.confidence,
        xray_details=xray_check.details,
        gradcam_image=gradcam_b64,
    )

    logger.info(
        "Prediction: %s (%.4f) | is_xray=%s | gradcam=%s",
        result.predicted_class,
        result.confidence,
        result.is_xray,
        "generated" if gradcam_b64 else "skipped",
    )
    return result
