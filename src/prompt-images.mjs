export const MAX_PROMPT_IMAGES = 12;
export const MAX_PROMPT_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_PROMPT_IMAGE_TOTAL_BYTES = 40 * 1024 * 1024;
export function detectPromptImageMimeType(bytes) {
  const starts = signature => bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte);
  const ascii = (offset, text) => bytes.length >= offset + text.length && [...text].every((char, index) => bytes[offset + index] === char.charCodeAt(0));
  if (starts([137, 80, 78, 71, 13, 10, 26, 10])) return 'image/png';
  if (starts([255, 216, 255])) return 'image/jpeg';
  if (ascii(0, 'GIF87a') || ascii(0, 'GIF89a')) return 'image/gif';
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'image/webp';
  return null;
}
/** Validate prompt, steering and queued images identically without allocating full decoded copies. */
export function normalizePromptImages(value, limits = {}) {
  if (value == null) return undefined;
  if (!Array.isArray(value)) throw new Error('Invalid prompt image payload.');
  if (value.length > MAX_PROMPT_IMAGES) throw new Error('Attach at most 12 images per message.');
  let total = 0;
  const images = value.map((image, index) => {
    if (!image || typeof image !== 'object' || image.type !== 'image' || typeof image.data !== 'string') throw new Error(`Image ${index + 1} is invalid.`);
    const data = image.data.trim(), mimeType = String(image.mimeType || '').toLowerCase();
    if (data.length > Math.ceil((limits.imageBytes ?? MAX_PROMPT_IMAGE_BYTES) / 3) * 4) throw new Error(`Image ${index + 1} is larger than 20 MB.`);
    if (!data || data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data) || Buffer.from(data.slice(-4), 'base64').toString('base64') !== data.slice(-4)) throw new Error(`Image ${index + 1} has invalid base64 data.`);
    const size = Buffer.byteLength(data, 'base64');
    if (size > (limits.imageBytes ?? MAX_PROMPT_IMAGE_BYTES)) throw new Error(`Image ${index + 1} is larger than 20 MB.`);
    total += size;
    if (total > (limits.totalBytes ?? MAX_PROMPT_IMAGE_TOTAL_BYTES)) throw new Error('Images in one message must total at most 40 MB.');
    if (detectPromptImageMimeType(Buffer.from(data.slice(0, 16), 'base64')) !== mimeType) throw new Error(`Image ${index + 1} is not a supported visual input.`);
    return { type: 'image', data, mimeType };
  });
  return images.length ? images : undefined;
}
