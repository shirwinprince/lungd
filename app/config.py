"""
Configuration module for the Lung Disease Detection API.

Centralises all constants and settings in one place so that every other
module can import them without duplicating magic numbers or strings.
"""

from pathlib import Path

# ── Paths ────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent       # project root
MODEL_PATH = BASE_DIR / "Models" / "densenet121_best.keras"

# ── Image pre-processing ────────────────────────────────────────────────
IMG_SIZE: int = 299                 # height & width the model expects
RESCALE_FACTOR: float = 1.0 / 255  # pixel normalisation to [0, 1]

# ── Class labels (order must match training generator) ───────────────────
CLASS_NAMES: list[str] = [
    "Bacterial Pneumonia",   # index 0
    "Corona Virus Disease",  # index 1
    "Normal",                # index 2
    "Tuberculosis",          # index 3
    "Viral Pneumonia",       # index 4
]
NUM_CLASSES: int = len(CLASS_NAMES)

# ── Model metadata (reported on /model-info) ────────────────────────────
MODEL_INFO = {
    "model_name": "DenseNet121 (Transfer Learning)",
    "framework": "TensorFlow / Keras",
    "input_shape": [IMG_SIZE, IMG_SIZE, 3],
    "num_classes": NUM_CLASSES,
    "classes": CLASS_NAMES,
    "preprocessing": f"Resize to {IMG_SIZE}×{IMG_SIZE}, rescale to [0, 1]",
    "training_accuracy": 0.8378,   # best val accuracy from training
    "test_accuracy": 0.8435,       # test set accuracy
    "architecture_summary": [
        "DenseNet121 (ImageNet, frozen → partially unfrozen)",
        "GlobalAveragePooling2D",
        "BatchNormalization",
        "Dense(512, ReLU) → Dropout(0.4)",
        "Dense(256, ReLU) → Dropout(0.3)",
        "Dense(5, Softmax)",
    ],
    "total_parameters": 7_699_013,
}

# ── X-ray verification ───────────────────────────────────────────────────
# Heuristic thresholds are defined in preprocessing.py (Tier-1).
# Tier-2 uses the GEMINI_API_KEY environment variable (optional).


# ── Accepted upload MIME types ───────────────────────────────────────────
ALLOWED_CONTENT_TYPES: set[str] = {
    "image/jpeg",
    "image/png",
    "image/bmp",
    "image/tiff",
    "image/webp",
}

# ── API metadata ─────────────────────────────────────────────────────────
API_TITLE = "Lung Disease Detection API"
API_DESCRIPTION = (
    "Production-ready REST API for multi-class lung disease detection "
    "from chest X-ray images using a DenseNet121 model trained with "
    "transfer learning."
)
API_VERSION = "1.0.0"
