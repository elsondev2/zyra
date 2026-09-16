import { createHash } from 'node:crypto';
import { assert, fault } from './errors.mjs';
import { detectPromptImageMimeType as detectImageMimeType } from '../../../src/prompt-images.mjs';
const LIMIT = 20 * 1024 * 1024;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
// Canonical history is the durable source. This bounded cache only avoids reading
// and decoding the same image for every chunk; it is never an authorization grant.
export class HistoryMedia {
  constructor({ budget = 32 * 1024 * 1024, now = Date.now } = {}) { this.queue = Promise.resolve(); this.items = new Map(); this.bytes = 0; this.budget = budget; this.now = now; }
  key(owner, chat, sha256) { return JSON.stringify([owner, chat, sha256]); }
  put(owner, chat, bytes) {
    const sha256 = hash(bytes), key = this.key(owner, chat, sha256);
    this.prune();
    if (!this.items.has(key) && bytes.length <= this.budget) {
      while (this.bytes + bytes.length > this.budget) this.drop(this.items.keys().next().value);
      this.items.set(key, { bytes, touched: this.now() }); this.bytes += bytes.length;
    }
    return sha256;
  }
  drop(key) { const item = this.items.get(key); if (item) { this.bytes -= item.bytes.length; this.items.delete(key); } }
  prune() { for (const [key, item] of this.items) if (item.touched + 300000 <= this.now()) this.drop(key); }
  project(owner, chat, value, source = null, path = []) {
    if (!value || typeof value !== 'object') return value;
    if (value.type === 'image' && typeof value.data === 'string') {
      if (value.data.length > Math.ceil(LIMIT / 3) * 4) return { type: 'image', unavailable: 'This image exceeds the mobile 20 MB limit.' };
      const bytes = Buffer.from(value.data, 'base64'), mimeType = detectImageMimeType(bytes);
      if (!mimeType || bytes.length > LIMIT) return { type: 'image', unavailable: 'This image format cannot be opened.' };
      const sha256 = this.put(owner, chat, bytes);
      return { type: 'image', mimeType, mediaRef: { version: 1, sha256, bytes: bytes.length, mimeType, ...(source ? { source: { ...source, path } } : {}) } };
    }
    if (Array.isArray(value)) return value.map((item, index) => this.project(owner, chat, item, source, [...path, index]));
    const entrySource = Number.isSafeInteger(value.historyEntryIndex) ? { entryIndex: value.historyEntryIndex, entryId: String(value.id || '') } : null;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, this.project(owner, chat, item, entrySource || source, entrySource ? [key] : [...path, key])]));
  }
  chunk(owner, chat, ref, offset, client) {
    const next = this.queue.then(() => this.readChunk(owner, chat, ref, offset, client));
    this.queue = next.catch(() => {}); return next;
  }
  async readChunk(owner, chat, ref, offset, client) {
    assert(ref && /^[a-f0-9]{64}$/.test(ref.sha256) && Number.isSafeInteger(ref.bytes) && ref.bytes > 0 && ref.bytes <= LIMIT, 'Invalid image reference.');
    assert(Number.isSafeInteger(offset) && offset >= 0 && offset <= ref.bytes, 'Invalid image offset.');
    this.prune(); const key = this.key(owner, chat, ref.sha256);
    let item = this.items.get(key);
    if (!item) {
      const source = ref.source;
      if (!source) throw fault('MEDIA_EXPIRED', 'Refresh this chat to reopen the saved image.');
      assert(Number.isSafeInteger(source.entryIndex) && source.entryIndex >= 0 && typeof source.entryId === 'string' && Array.isArray(source.path) && source.path.length <= 12, 'Invalid image source.');
      const result = await client.request('catalog.history', { session: chat, before: source.entryIndex + 1, limit: 1, entryLocators: true });
      const entry = result.history?.entries?.find(entry => entry.historyEntryIndex === source.entryIndex && String(entry.id || '') === source.entryId);
      assert(entry, 'This image source changed. Refresh the chat.');
      let part = entry;
      for (const key of source.path) { assert((typeof key === 'string' || Number.isSafeInteger(key)) && part && Object.hasOwn(part, key), 'Invalid image source.'); part = part[key]; }
      assert(part?.type === 'image' && typeof part.data === 'string' && part.data.length <= Math.ceil(LIMIT / 3) * 4, 'This image source changed.');
      const bytes = Buffer.from(part.data, 'base64');
      assert(bytes.length === ref.bytes && hash(bytes) === ref.sha256 && detectImageMimeType(bytes) === ref.mimeType, 'This image source changed. Refresh the chat.');
      this.put(owner, chat, bytes); item = this.items.get(key) || { bytes, touched: this.now() };
    }
    assert(item.bytes.length === ref.bytes, 'Invalid image length.'); item.touched = this.now();
    const next = Math.min(offset + 48 * 1024, item.bytes.length);
    return { base64: item.bytes.subarray(offset, next).toString('base64'), next, total: item.bytes.length, sha256: ref.sha256 };
  }
}
