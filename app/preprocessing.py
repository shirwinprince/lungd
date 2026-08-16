"""
Image pre-processing pipeline & 2-Tier X-ray Validation.

Handles:
  • decoding raw uploaded bytes into a NumPy array
  • resizing to the model's expected input size
  • rescaling pixel values to [0, 1]
  • 2-tier X-ray verification (self-contained)
    - Tier 1: Local heuristic (8 checks — skin, color, saturation, edge, contrast, etc.)
    - Tier 2: Gemini / OpenRouter Vision AI (only if Tier 1 is uncertain)
"""

from __future__ import annotations

import base64
import io
import json
import logging
import os
from typing import Optional, Tuple

import numpy as np
import requests
from dataclasses import dataclass
from PIL import Image

from app.config import (
    IMG_SIZE,
    RESCALE_FACTOR,
)

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════════════
#  X-RAY VALIDATOR — 2-Tier Smart Priority Architecture
# ═══════════════════════════════════════════════════════════════════════════

# ── Gemini Config ───────────────────────────────────────────────────────────
_GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta"
    "/models/{model}:generateContent?key={key}"
)
_GEMINI_MODELS = [
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
]

# ── OpenRouter Fallback ─────────────────────────────────────────────────────
_OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
_OPENROUTER_MODELS = [
    "nvidia/nemotron-nano-12b-v2-vl:free",
    "google/gemma-4-31b-it:free",
    "openrouter/free",
]

# ── Local Thresholds ────────────────────────────────────────────────────────
_MIN_PIXELS = 50 * 50        # min resolution 50x50
_MIN_STD_DEV = 15            # min standard deviation (not blank)
_XRAY_MIN_CONTRAST = 14.0    # min greyscale std deviation for real X-rays
_MAX_CHANNEL_STD = 30.0      # max color channel std (lowered from 35 for stricter check)
_MAX_SKIN_PCT = 5.0          # max % skin chrominance (lowered from 6 for stricter)
_MAX_MEAN_SATURATION = 0.35  # max mean saturation (X-rays ~0-0.20, tinted ~0.15-0.30, photos/cartoons >0.35)
_MIN_EDGE_DENSITY = 0.02     # NEW: min edge density (X-rays have bone/tissue edges)

# ── AI Prompts (Improved for consistency) ──────────────────────────────────
_SYSTEM_PROMPT = """You are a senior board-certified radiologist and medical imaging AI validator.

YOUR ONLY TASK: Determine if the provided image is a genuine CHEST X-RAY RADIOGRAPH.

=== MUST ACCEPT (is_xray=true) ===
- Standard PA or AP chest X-rays showing lung fields, ribcage, heart shadow, diaphragm
- Chest X-rays that are blurry, low-quality, or poorly exposed — STILL ACCEPT
- Chest X-rays with blue, cyan, green, sepia, or inverted color tints (DICOM pseudocolor) — STILL ACCEPT
- Chest X-rays with medical labels, patient info stickers, or rotation markers — STILL ACCEPT
- Chest X-rays that are rotated, cropped, or at slight angles — STILL ACCEPT
- Lateral chest X-rays — STILL ACCEPT

=== MUST REJECT (is_xray=false) ===
- Cartoon images, animated characters, illustrations, drawings, digital art, anime
- Photographs of people (portraits, selfies, headshots, full-body, group photos)
- Photographs of real-world objects (animals, food, cars, buildings, landscapes, nature)
- Documents, certificates, text images, screenshots, UI elements, logos, badges
- Non-chest X-rays (hand, knee, foot, skull, dental, abdomen, pelvis)
- CT scans, MRI images, ultrasound images
- Abstract art, patterns, solid colors, gradients, random noise

=== RESPONSE FORMAT ===
Respond with ONLY valid JSON, no markdown, no explanation outside JSON:
{"is_xray": true, "reason": "Chest X-ray showing bilateral lung fields with visible ribcage and cardiac silhouette", "confidence": 0.95}

or

{"is_xray": false, "reason": "Image shows a cartoon character, not a medical radiograph", "confidence": 0.98}

CRITICAL RULES:
- When in doubt about a medical image, lean toward ACCEPTING it (is_xray=true)
- When in doubt about a non-medical image, lean toward REJECTING it (is_xray=false)
- Blurry or tinted chest X-rays are STILL valid chest X-rays
- The presence of bones/ribcage pattern in a roughly chest-shaped layout = chest X-ray"""

_USER_PROMPT = "Analyze this image. Is it a chest X-ray radiograph? Respond with JSON only. No markdown."


# ═══════════════════════════════════════════════════════════════════════════
#  TIER 1: LOCAL CHECKS (8 signals)
# ═══════════════════════════════════════════════════════════════════════════

def _check_skin_and_photo(img: Image.Image) -> Tuple[bool, str, float]:
    """
    Detect human skin chrominance (formal photos, portraits, selfies).
    Uses YCbCr color space for skin detection + HSV saturation variance.
    """
    ycbcr = img.convert("YCbCr")
    arr = np.array(ycbcr, dtype=np.float32)
    cb, cr = arr[:, :, 1], arr[:, :, 2]

    skin_mask = (cb >= 77) & (cb <= 127) & (cr >= 133) & (cr <= 173)
    skin_pct = float(np.mean(skin_mask)) * 100.0

    hsv = img.convert("HSV")
    hsv_arr = np.array(hsv, dtype=np.float32)
    sat = hsv_arr[:, :, 1] / 255.0
    sat_std = float(np.std(sat))

    # Real photographs have both high skin % AND multi-hued saturation
    if skin_pct > _MAX_SKIN_PCT and sat_std >= 0.05:
        return (
            False,
            f"This appears to be a photograph of a person (skin tone detected: {skin_pct:.1f}%). "
            f"Please upload a chest X-ray radiograph instead.",
            0.99,
        )

    return True, "", 0.0


def _check_colour_channels(img: Image.Image) -> Tuple[bool, str, float]:
    """
    Detect multi-color images (cartoons, photos, illustrations).
    X-rays are nearly grayscale — even tinted ones have uniform tint (low channel diff std).
    """
    arr = np.array(img.convert("RGB"), dtype=np.float32)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]

    std_rg = float(np.std(r - g))
    std_rb = float(np.std(r - b))
    std_gb = float(np.std(g - b))
    max_channel_std = max(std_rg, std_rb, std_gb)

    if max_channel_std > _MAX_CHANNEL_STD:
        return (
            False,
            f"This image contains multiple colors (color variation: {max_channel_std:.1f}). "
            f"Chest X-rays are grayscale or uniformly tinted. "
            f"Please upload a real chest X-ray image.",
            0.99,
        )

    return True, "", 0.0


def _check_saturation(img: Image.Image) -> Tuple[bool, str, float]:
    """
    NEW: Check mean saturation. X-rays have very low saturation (nearly grayscale).
    Cartoons, photos, and illustrations have much higher saturation.
    Blue/cyan tinted X-rays still have low saturation because the tint is uniform.
    """
    hsv = img.convert("HSV")
    hsv_arr = np.array(hsv, dtype=np.float32)
    sat = hsv_arr[:, :, 1] / 255.0
    mean_sat = float(np.mean(sat))

    if mean_sat > _MAX_MEAN_SATURATION:
        return (
            False,
            f"This image is too colorful to be a chest X-ray (saturation: {mean_sat:.2f}). "
            f"X-rays are grayscale or have a subtle uniform tint. "
            f"Please upload a genuine chest X-ray.",
            0.98,
        )

    return True, "", 0.0


def _check_edge_structure(img: Image.Image) -> Tuple[bool, str, float]:
    """
    NEW: Check edge density using Sobel-like gradient.
    Real X-rays have bone/tissue edges. Solid-color or gradient images don't.
    Cartoons with flat regions also have lower mid-range edge density.
    """
    grey = np.array(img.convert("L"), dtype=np.float32)

    # Simple gradient magnitude (Sobel-like)
    gx = np.abs(np.diff(grey, axis=1))
    gy = np.abs(np.diff(grey, axis=0))

    # Edge pixels: gradient > threshold
    edge_threshold = 15.0
    edge_x = float(np.mean(gx > edge_threshold))
    edge_y = float(np.mean(gy > edge_threshold))
    edge_density = (edge_x + edge_y) / 2.0

    if edge_density < _MIN_EDGE_DENSITY:
        return (
            False,
            f"This image lacks the structural edges expected in a chest X-ray "
            f"(edge density: {edge_density:.4f}). "
            f"Please upload a genuine chest X-ray with visible anatomy.",
            0.90,
        )

    return True, "", 0.0


def _check_badge_and_logo(img: Image.Image) -> Tuple[bool, str, float]:
    """Detect isolated logos, badges, emblems on flat backgrounds."""
    grey = np.array(img.convert("L"), dtype=np.float32)
    h, w = grey.shape
    h10, w10 = max(2, int(h * 0.1)), max(2, int(w * 0.1))

    tl = grey[:h10, :w10]
    tr = grey[:h10, -w10:]
    bl = grey[-h10:, :w10]
    br = grey[-h10:, -w10:]

    corner_stds = [float(np.std(c)) for c in [tl, tr, bl, br]]
    corner_means = [float(np.mean(c)) for c in [tl, tr, bl, br]]

    flat_corners = all(s < 4.0 for s in corner_stds)
    equal_corners = (max(corner_means) - min(corner_means)) < 8.0

    if flat_corners and equal_corners:
        return (
            False,
            "This image appears to be a logo, badge, or certificate on a flat background. "
            "Please upload a real chest X-ray radiograph.",
            0.99,
        )

    return True, "", 0.0


def _check_size_and_blank(img: Image.Image) -> Tuple[bool, str, float]:
    """Reject images that are too small or blank/uniform."""
    w, h = img.size
    if w * h < _MIN_PIXELS:
        return (
            False,
            f"Image resolution is too low ({w}×{h} px). "
            f"Please upload a full-resolution chest X-ray.",
            0.99,
        )
    grey = img.convert("L")
    std = float(np.std(np.array(grey, dtype=np.float32)))
    if std < _MIN_STD_DEV:
        return (
            False,
            "This image appears blank or uniform. "
            "Please upload a proper chest X-ray scan.",
            0.99,
        )
    return True, "", 0.0


def _check_xray_characteristics(img: Image.Image) -> Tuple[bool, str, float]:
    """Check for radiographic contrast and tissue pixel distribution."""
    grey = np.array(img.convert("L"), dtype=np.float32)
    std_dev = float(np.std(grey))

    if std_dev < _XRAY_MIN_CONTRAST:
        return (
            False,
            f"This image lacks the contrast variation expected in X-rays "
            f"(contrast: {std_dev:.1f}, minimum: {_XRAY_MIN_CONTRAST}). "
            f"Please upload a genuine chest X-ray.",
            0.95,
        )

    mid_tone_frac = float(np.mean((grey >= 25) & (grey <= 235)))
    extreme_frac = float(np.mean((grey > 240) | (grey < 5)))

    if mid_tone_frac < 0.18:
        return (
            False,
            "This image resembles a document, screenshot, or line drawing. "
            "Please upload a real chest X-ray radiograph.",
            0.96,
        )

    if extreme_frac > 0.75:
        return (
            False,
            "This image has excessive white/black background typical of documents or text images. "
            "Please upload a real chest X-ray radiograph.",
            0.95,
        )

    return True, "", 0.0


def _check_unique_colors(img: Image.Image) -> Tuple[bool, str, float]:
    """
    NEW: Check number of unique hues. Cartoons/illustrations have many distinct colors.
    X-rays (even tinted) have a narrow hue range.
    """
    small = img.copy()
    small.thumbnail((128, 128), Image.LANCZOS)
    hsv = small.convert("HSV")
    hsv_arr = np.array(hsv, dtype=np.uint8)
    sat = hsv_arr[:, :, 1]
    hue = hsv_arr[:, :, 0]

    # Only count hues where saturation is significant (> 30/255)
    colored_mask = sat > 30
    if np.sum(colored_mask) < 100:
        # Image is mostly desaturated — likely X-ray
        return True, "", 0.0

    colored_hues = hue[colored_mask]
    # Bin hues into 18 bins (20-degree bins on 0-180 range)
    hist, _ = np.histogram(colored_hues, bins=18, range=(0, 180))
    active_bins = int(np.sum(hist > (len(colored_hues) * 0.02)))  # bins with >2% of pixels

    if active_bins >= 6:
        return (
            False,
            f"This image contains too many distinct colors ({active_bins} color groups detected). "
            f"Chest X-rays are grayscale or have a single uniform tint. "
            f"Please upload a genuine chest X-ray.",
            0.97,
        )

    return True, "", 0.0


# ═══════════════════════════════════════════════════════════════════════════
#  TIER 2: AI VISION API
# ═══════════════════════════════════════════════════════════════════════════

def _call_gemini(img_b64: str, api_key: str) -> Optional[dict]:
    """Call Gemini Vision API with model fallback chain."""
    headers = {"Content-Type": "application/json"}
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": _SYSTEM_PROMPT + "\n\n" + _USER_PROMPT},
                    {"inline_data": {"mime_type": "image/jpeg", "data": img_b64}},
                ]
            }
        ],
        "generationConfig": {"temperature": 0.05, "maxOutputTokens": 200},
    }

    for model in _GEMINI_MODELS:
        url = _GEMINI_URL.format(model=model, key=api_key)
        try:
            resp = requests.post(url, headers=headers, json=payload, timeout=3)
            if resp.status_code == 200:
                raw = resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
                if raw.startswith("```"):
                    raw = raw.split("```")[1]
                    if raw.startswith("json"):
                        raw = raw[4:]
                return json.loads(raw.strip())
        except Exception:
            continue
    return None


def _call_openrouter(img_b64: str, api_key: str) -> Optional[dict]:
    """Call OpenRouter Vision API as fallback."""
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": _OPENROUTER_MODELS[0],
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": _SYSTEM_PROMPT + "\n\n" + _USER_PROMPT},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}},
                ],
            }
        ],
    }
    try:
        resp = requests.post(_OPENROUTER_URL, headers=headers, json=payload, timeout=3)
        if resp.status_code == 200:
            raw = resp.json()["choices"][0]["message"]["content"].strip()
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            return json.loads(raw.strip())
    except Exception:
        pass
    return None


# ═══════════════════════════════════════════════════════════════════════════
#  PUBLIC API
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class XRayCheckResult:
    """Compact result of the X-ray verification."""

    is_xray: bool
    confidence: float  # 0.0 – 1.0
    details: str       # human-readable reason
    tier: str = "LOCAL"  # "LOCAL", "GEMINI_AI", "OPENROUTER_AI"


def decode_image(raw_bytes: bytes) -> Image.Image:
    """Decode raw file bytes into a Pillow Image (RGB)."""
    try:
        img = Image.open(io.BytesIO(raw_bytes))
        img = img.convert("RGB")
        return img
    except Exception as exc:
        raise ValueError(f"Could not decode the uploaded file as an image: {exc}") from exc


def preprocess_for_model(img: Image.Image) -> np.ndarray:
    """
    Resize and rescale an image for model inference.
    Returns shape (1, IMG_SIZE, IMG_SIZE, 3) in [0, 1].
    """
    img_resized = img.resize((IMG_SIZE, IMG_SIZE), Image.LANCZOS)
    arr = np.asarray(img_resized, dtype=np.float32)
    arr = arr * RESCALE_FACTOR
    arr = np.expand_dims(arr, axis=0)
    return arr


def verify_xray(img: Image.Image) -> XRayCheckResult:
    """
    2-Tier Smart Priority X-ray Validation with 8 local checks.

    Tier 1 (LOCAL — instant, free):
        8 checks: skin chrominance, color channels, mean saturation,
        edge structure, badge/logo, size/blank, X-ray contrast, unique colors.

        Decision logic:
        - If ALL 8 pass → APPROVE immediately (definite X-ray)
        - If any STRONG rejection (skin, high color, high saturation) → REJECT immediately
        - If only weak signals fail → escalate to Tier 2

    Tier 2 (AI Vision — only if Tier 1 is uncertain):
        Gemini 2.0 Flash → Flash Lite → 1.5 Flash → OpenRouter fallback.

    Parameters
    ----------
    img : PIL.Image.Image
        RGB image.

    Returns
    -------
    XRayCheckResult
    """
    # ── Run all 8 Tier 1 local checks ────────────────────────────────────
    checks = [
        ("skin", _check_skin_and_photo(img)),
        ("color_channels", _check_colour_channels(img)),
        ("saturation", _check_saturation(img)),
        ("edge_structure", _check_edge_structure(img)),
        ("badge_logo", _check_badge_and_logo(img)),
        ("size_blank", _check_size_and_blank(img)),
        ("xray_contrast", _check_xray_characteristics(img)),
        ("unique_colors", _check_unique_colors(img)),
    ]

    failed_checks = [(name, ok, reason, conf) for name, (ok, reason, conf) in checks if not ok]
    passed_count = len(checks) - len(failed_checks)

    logger.info(
        "X-ray Tier-1: %d/%d checks passed. Failed: %s",
        passed_count, len(checks),
        [name for name, _, _, _ in failed_checks] if failed_checks else "none",
    )

    # ── TIER 1 DECISION ──────────────────────────────────────────────────

    # All 8 passed (or 7 passed with 0 strong failures) → definite X-ray → APPROVE immediately
    strong_rejection_checks = {"skin", "color_channels", "saturation", "unique_colors"}
    strong_failures = [f for f in failed_checks if f[0] in strong_rejection_checks]

    if not failed_checks or (passed_count >= 7 and not strong_failures):
        return XRayCheckResult(
            is_xray=True,
            confidence=0.95,
            details="Valid chest X-ray (passed local validation checks).",
            tier="LOCAL",
        )

    # Strong rejection signals → REJECT immediately (no need for AI)
    if len(strong_failures) >= 2:
        # Multiple strong signals = definite non-X-ray
        _, _, reason, conf = strong_failures[0]
        logger.info("X-ray Tier-1: STRONG REJECT (%d strong signals failed)", len(strong_failures))
        return XRayCheckResult(
            is_xray=False,
            confidence=conf,
            details=reason,
            tier="LOCAL",
        )

    if len(strong_failures) == 1 and passed_count <= 5:
        # One strong signal + many other failures = likely non-X-ray
        _, _, reason, conf = strong_failures[0]
        logger.info("X-ray Tier-1: REJECT (1 strong + %d total failures)", len(failed_checks))
        return XRayCheckResult(
            is_xray=False,
            confidence=conf,
            details=reason,
            tier="LOCAL",
        )

    # ── TIER 1 UNCERTAIN → Escalate to Tier 2 ───────────────────────────
    logger.info("X-ray Tier-1: UNCERTAIN — escalating to Tier 2 AI")

    gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()
    openrouter_key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    has_gemini = bool(gemini_key and gemini_key.startswith("AIzaSy"))
    has_openrouter = bool(openrouter_key and openrouter_key.startswith("sk-or-v1-"))

    if has_gemini or has_openrouter:
        try:
            buffered = io.BytesIO()
            resized = img.copy().convert("RGB")
            resized.thumbnail((512, 512), Image.LANCZOS)
            resized.save(buffered, format="JPEG", quality=85)
            img_b64 = base64.b64encode(buffered.getvalue()).decode("utf-8")

            ai_res = None
            ai_source = ""

            if has_gemini:
                logger.info("X-ray Tier-2: Calling Gemini Vision...")
                ai_res = _call_gemini(img_b64, gemini_key)
                ai_source = "GEMINI_AI"

            if not ai_res and has_openrouter:
                logger.info("X-ray Tier-2: Falling back to OpenRouter...")
                ai_res = _call_openrouter(img_b64, openrouter_key)
                ai_source = "OPENROUTER_AI"

            if ai_res and isinstance(ai_res, dict):
                is_xray = bool(ai_res.get("is_xray", True))
                reason = str(ai_res.get("reason", "AI verified."))
                confidence = float(ai_res.get("confidence", 0.90))

                if is_xray:
                    logger.info("X-ray Tier-2: APPROVED by %s", ai_source)
                    return XRayCheckResult(
                        is_xray=True,
                        confidence=confidence,
                        details=f"Verified by AI ({ai_source}): {reason}",
                        tier=ai_source,
                    )
                else:
                    logger.info("X-ray Tier-2: REJECTED by %s", ai_source)
                    return XRayCheckResult(
                        is_xray=False,
                        confidence=confidence,
                        details=f"Rejected by AI ({ai_source}): {reason}",
                        tier=ai_source,
                    )

        except Exception as e:
            logger.warning("X-ray Tier-2: AI call failed: %s", e)

    # ── Fallback: AI unavailable → use local decision ────────────────────
    _, _, reason, conf = failed_checks[0]
    logger.info("X-ray Tier-2: AI unavailable — using local rejection")
    return XRayCheckResult(
        is_xray=False,
        confidence=conf,
        details=reason,
        tier="LOCAL",
    )
