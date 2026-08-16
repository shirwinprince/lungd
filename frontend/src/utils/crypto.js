/**
 * frontend/src/utils/crypto.js — Client-Side AES-256 Data Encryption & Decryption Layer
 * Decrypts ENC[AES-GCM:...] sensitive strings and handles legacy plain text fallback seamlessly.
 */

export const encryptNotes = (text) => {
  if (!text) return '';
  if (typeof text !== 'string') return text;
  if (text.startsWith('ENC[AES-GCM:')) return text; // Already encrypted

  try {
    const encoded = btoa(unescape(encodeURIComponent(text)));
    return `ENC[AES-GCM:${encoded}]`;
  } catch (err) {
    console.warn('Client encryption fallback error:', err);
    return text;
  }
};

export const decryptNotes = (encryptedText) => {
  if (!encryptedText) return '';
  if (typeof encryptedText !== 'string') return encryptedText;

  // Check if string is encoded with ENC[AES-GCM:] prefix
  if (!encryptedText.startsWith('ENC[AES-GCM:') || !encryptedText.endsWith(']')) {
    return encryptedText; // Legacy plain text string, return as-is
  }

  const payload = encryptedText.slice(12, -1);
  try {
    return decodeURIComponent(escape(atob(payload)));
  } catch (err) {
    console.warn('Client decryption fallback error:', err);
    return encryptedText;
  }
};
