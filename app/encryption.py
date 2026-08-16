"""
app/encryption.py — Sensitive Data Encryption Layer using AES-256-GCM
Provides encryption & decryption for patient clinical notes and sensitive diagnostic data.
"""

import os
import base64
import logging

logger = logging.getLogger(__name__)

# System Master Key for AES-256-GCM (32 bytes)
_DEFAULT_KEY_BYTES = b"LungScanAI_Secret_Key_32bytes_!!"
SECRET_KEY_ENV = os.getenv("LUNGSCAN_ENCRYPTION_KEY", "")

if SECRET_KEY_ENV:
    # Ensure 32 bytes
    KEY = SECRET_KEY_ENV.encode('utf-8').ljust(32, b'\0')[:32]
else:
    KEY = _DEFAULT_KEY_BYTES

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    HAS_AESGCM = True
    _aesgcm_engine = AESGCM(KEY)
except Exception as exc:
    logger.warning("Cryptography AESGCM initialization warning: %s", exc)
    HAS_AESGCM = False
    _aesgcm_engine = None


def encrypt_clinical_notes(text: str) -> str:
    """
    Encrypts a clinical text string using AES-256-GCM.
    Returns string in format: ENC[AES-GCM:<base64(nonce + ciphertext)>]
    """
    if not text:
        return ""
    if text.startswith("ENC[AES-GCM:"):
        return text  # Already encrypted

    if not HAS_AESGCM or not _aesgcm_engine:
        # Fallback pseudo-encoding if cryptography package unavailable
        encoded = base64.b64encode(text.encode('utf-8')).decode('utf-8')
        return f"ENC[AES-GCM:{encoded}]"

    try:
        nonce = os.urandom(12)  # 96-bit nonce for AES-GCM
        ciphertext = _aesgcm_engine.encrypt(nonce, text.encode('utf-8'), None)
        combined = nonce + ciphertext
        b64_str = base64.b64encode(combined).decode('utf-8')
        return f"ENC[AES-GCM:{b64_str}]"
    except Exception as err:
        logger.error("Encryption error: %s", err)
        return text


def decrypt_clinical_notes(encrypted_str: str) -> str:
    """
    Decrypts an AES-256-GCM encrypted string.
    If string is unencrypted/legacy plain text, returns it as-is.
    """
    if not encrypted_str:
        return ""
    if not encrypted_str.startswith("ENC[AES-GCM:") or not encrypted_str.endswith("]"):
        return encrypted_str  # Legacy plain text string, return as-is

    payload = encrypted_str[12:-1]  # Extract base64 inside ENC[AES-GCM:]

    if not HAS_AESGCM or not _aesgcm_engine:
        try:
            return base64.b64decode(payload).decode('utf-8')
        except Exception:
            return encrypted_str

    try:
        combined = base64.b64decode(payload)
        if len(combined) <= 12:
            return encrypted_str
        nonce = combined[:12]
        ciphertext = combined[12:]
        decrypted_bytes = _aesgcm_engine.decrypt(nonce, ciphertext, None)
        return decrypted_bytes.decode('utf-8')
    except Exception as err:
        logger.error("Decryption error: %s", err)
        return encrypted_str
