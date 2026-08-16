"""
Model-loading utilities.

Loads the Keras model **once** at application startup, validates it against
the expected configuration, and exposes it as a module-level singleton.
"""

from __future__ import annotations

import json
import logging
import tempfile
import zipfile
from pathlib import Path
from typing import Optional

import tensorflow as tf

from app.config import MODEL_PATH, NUM_CLASSES

logger = logging.getLogger(__name__)

# Module-level singleton — set by `load_model()`.
_model: Optional[tf.keras.Model] = None


def _strip_unsupported_keys(obj: object) -> None:
    """Recursively remove keys (e.g. ``quantization_config``) that
    newer Keras versions write but older ones cannot deserialise."""
    KEYS_TO_STRIP = {"quantization_config"}
    if isinstance(obj, dict):
        for key in KEYS_TO_STRIP:
            obj.pop(key, None)
        for v in obj.values():
            _strip_unsupported_keys(v)
    elif isinstance(obj, list):
        for item in obj:
            _strip_unsupported_keys(item)


def _load_model_patched(model_path) -> tf.keras.Model:
    """Open the ``.keras`` ZIP, strip unsupported keys from
    ``config.json``, write a patched temp copy, and load it."""
    import tempfile as _tmp
    patched_dir = _tmp.mkdtemp()
    patched_file = Path(patched_dir) / "model_patched.keras"
    with zipfile.ZipFile(model_path, "r") as zin, \
         zipfile.ZipFile(patched_file, "w") as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename.endswith("config.json"):
                config = json.loads(data)
                _strip_unsupported_keys(config)
                data = json.dumps(config).encode("utf-8")
            zout.writestr(item, data)
    return tf.keras.models.load_model(str(patched_file), compile=False)

def load_model() -> tf.keras.Model:
    """
    Load the DenseNet121 model from disk and cache it.

    Returns
    -------
    tf.keras.Model
        The loaded (and validated) Keras model.

    Raises
    ------
    FileNotFoundError
        If the model file does not exist at the configured path.
    ValueError
        If the loaded model's output shape does not match NUM_CLASSES.
    """
    global _model  # noqa: PLW0603

    if _model is not None:
        logger.info("Model already loaded — returning cached instance.")
        return _model

    if not MODEL_PATH.exists():
        raise FileNotFoundError(
            f"Model file not found at {MODEL_PATH}. "
            "Please ensure the trained model is placed correctly."
        )

    logger.info("Loading model from %s …", MODEL_PATH)

    # ── Attempt 1: plain load ────────────────────────────────────────
    try:
        _model = tf.keras.models.load_model(str(MODEL_PATH), compile=False)
        logger.info("Model loaded (direct).")
    except (TypeError, Exception) as exc:
        logger.warning("Direct load failed (%s). Trying patched load …", exc)
        # ── Attempt 2: patch config.json inside the .keras ZIP ───────
        _model = _load_model_patched(MODEL_PATH)
        logger.info("Model loaded (patched).")

    # Sanity-check: output layer must have NUM_CLASSES units.
    output_units = _model.output_shape[-1]
    if output_units != NUM_CLASSES:
        raise ValueError(
            f"Model output has {output_units} units, "
            f"but config specifies {NUM_CLASSES} classes."
        )

    return _model


def get_model() -> tf.keras.Model:
    """
    Return the cached model.  Must be called *after* `load_model()`.

    Raises
    ------
    RuntimeError
        If called before the model has been loaded.
    """
    if _model is None:
        raise RuntimeError(
            "Model has not been loaded yet. Call load_model() first."
        )
    return _model
