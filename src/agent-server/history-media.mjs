import { createHash } from 'node:crypto';
import { detectPromptImageMimeType as detectImageMimeType } from '../prompt-images.mjs';
const MAX_IMAGE = 20 * 1024 * 1024;
// Additive mobile projection: the original session JSONL and Desktop shapes stay canonical.
export function projectHistoryMedia(entry, entryIndex) {
  const source = { entryIndex, entryId: String(entry?.id || '') };
  function visit(value, path = []) {
    if (!value || typeof value !== 'object') return value;
    if (value.type === 'image' && typeof value.data === 'string') {
      if (value.data.length > Math.ceil(MAX_IMAGE / 3) * 4) return { type: 'image', unavailable: 'This image exceeds the mobile 20 MB limit.' };
      const bytes = Buffer.from(value.data, 'base64'), mimeType = detectImageMimeType(bytes);
      if (!mimeType || bytes.length > MAX_IMAGE) return { type: 'image', unavailable: 'This image format cannot be opened.' };
      return { type: 'image', mimeType, mediaRef: { version: 1, mimeType, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), source: { ...source, path } } };
    }
    if (Array.isArray(value)) return value.map((item, index) => visit(item, [...path, index]));
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, visit(item, [...path, key])]));
  }
  return visit(entry);
}
