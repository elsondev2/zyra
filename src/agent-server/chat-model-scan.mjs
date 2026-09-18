import { parser } from 'stream-json/parser.js';
import { finished } from 'node:stream/promises';
import { open } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { newModelPresentation, applyEntryModel } from './chat-model.mjs';

const ROOT_FIELDS = new Set(['type', 'id', 'parentId', 'provider', 'modelId', 'message']);
const MESSAGE_FIELDS = new Set(['role', 'model', 'provider']);
const MODEL_FIELDS = new Set(['id', 'modelId', 'provider']);
const CHUNK_BYTES = 64 * 1024;

/** Collect only model/branch metadata. Message bodies, keys and numbers are never packed. */
export class ModelMetadataTokens {
  constructor() { this.value = {}; this.frames = []; this.skip = 0; this.mode = ''; this.text = ''; this.overflow = false; this.maxRetainedChars = 0; }
  field() {
    const frame = this.frames.at(-1);
    const allowed = frame?.path === '' ? ROOT_FIELDS : frame?.path === 'message' ? MESSAGE_FIELDS : frame?.path === 'model' ? MODEL_FIELDS : null;
    return allowed?.has(frame.key) ? [frame.object, frame.key] : null;
  }
  set(value) { const field = this.field(); if (field) field[0][field[1]] = value; }
  accept({ name, value }) {
    if (this.skip) {
      if (name === 'startObject' || name === 'startArray') this.skip++;
      else if (name === 'endObject' || name === 'endArray') this.skip--;
      return;
    }
    if (name === 'startObject') {
      const parent = this.frames.at(-1);
      if (!parent) this.frames.push({ path: '', key: null, object: this.value });
      else if (parent.path === '' && parent.key === 'message') {
        this.value.message = {}; this.frames.push({ path: 'message', key: null, object: this.value.message });
      } else if (parent.path === 'message' && parent.key === 'model') {
        parent.object.model = {}; this.frames.push({ path: 'model', key: null, object: parent.object.model });
      } else { this.set(null); this.skip = 1; }
    } else if (name === 'startArray') { this.set(null); this.skip = 1; }
    else if (name === 'endObject') this.frames.pop();
    else if (name === 'startKey' || name === 'startString') {
      this.mode = name === 'startKey' ? 'key' : this.field() ? 'value' : '';
      this.text = ''; this.overflow = false;
    } else if (name === 'stringChunk' && this.mode) {
      if (!this.overflow && this.text.length + value.length <= 512) this.text += value;
      else { this.overflow = true; this.text = ''; }
      this.maxRetainedChars = Math.max(this.maxRetainedChars, this.text.length);
    } else if (name === 'endKey') {
      if (this.frames.length) this.frames.at(-1).key = this.overflow ? null : this.text;
      this.mode = ''; this.text = '';
    } else if (name === 'endString') {
      if (this.mode === 'value') this.set(this.overflow ? null : this.text);
      this.mode = ''; this.text = '';
    } else if (name === 'nullValue' || name === 'trueValue' || name === 'falseValue' || name === 'startNumber') this.set(null);
  }
}

export async function scanModelPresentation(file, offsets, { signal, wait = () => delay(8), progress } = {}) {
  const handle = await open(file, 'r');
  const result = newModelPresentation();
  const buffer = Buffer.allocUnsafe(CHUNK_BYTES);
  let sinceYield = 0, bytes = 0, maxRetainedChars = 0;
  try {
    for (const [offset, length] of offsets) {
      signal?.throwIfAborted();
      if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0) throw new Error('Invalid model metadata offset.');
      const selected = new ModelMetadataTokens();
      const tokens = parser.asStream({ packValues: false, streamValues: true });
      let failure;
      const completed = finished(tokens).catch(error => { failure = error; });
      tokens.on('data', token => { try { selected.accept(token); } catch (error) { tokens.destroy(error); } });
      try {
        for (let position = 0; position < length;) {
          signal?.throwIfAborted();
          const chunk = await handle.read(buffer, 0, Math.min(CHUNK_BYTES, length - position), offset + position);
          if (!chunk.bytesRead) throw new Error('Chat changed during model indexing.');
          await new Promise((resolve, reject) => tokens.write(buffer.subarray(0, chunk.bytesRead), error => error ? reject(error) : resolve()));
          if (failure) throw failure;
          position += chunk.bytesRead; bytes += chunk.bytesRead; sinceYield += chunk.bytesRead;
          if (sinceYield >= CHUNK_BYTES) { sinceYield = 0; await wait(); }
        }
        tokens.end(); await completed;
        if (failure) throw failure;
        applyEntryModel(result, selected.value);
        maxRetainedChars = Math.max(maxRetainedChars, selected.maxRetainedChars);
      } finally { tokens.destroy(); await completed; }
    }
    signal?.throwIfAborted();
    progress?.({ bytes, chunkBytes: CHUNK_BYTES, maxRetainedChars });
    return result;
  } finally { await handle.close(); }
}
