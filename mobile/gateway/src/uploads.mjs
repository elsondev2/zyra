import { textAttachment, TEXT_ATTACHMENT_BYTES, TEXT_ATTACHMENT_TOTAL } from './text-attachments.mjs';
import { detectPromptImageMimeType as imageMime } from '../../../src/prompt-images.mjs';
export { imageMime };
import { mkdir, open, readFile, rename, stat, readdir, unlink, statfs } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { assert, fault } from './errors.mjs';
export const UPLOAD_CHUNK_BYTES = 48 * 1024;
export const UPLOAD_FILE_BYTES = 20 * 1024 * 1024;
const QUOTA = 128 * 1024 * 1024, LIFETIME = 24 * 60 * 60 * 1000;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
/** Acknowledged offsets are fsynced. Repeating an identical byte range is safe, never append-twice. */
export class UploadStore {
  constructor(directory, { now = Date.now, quota = QUOTA } = {}) {
    this.directory = path.join(directory, 'uploads'); this.now = now; this.quota = quota; this.queue = Promise.resolve();
  }
  lock(action) { const result = this.queue.then(action, action); this.queue = result.catch(() => {}); return result; }
  paths(id) { assert(typeof id === 'string' && UUID.test(id), 'Invalid upload identifier.'); return { metadata: path.join(this.directory, id + '.json'), bytes: path.join(this.directory, id + '.part') }; }
  async save(value) {
    const file = this.paths(value.id).metadata, handle = await open(file + '.tmp', 'w', 0o600);
    try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); } finally { await handle.close(); }
    await rename(file + '.tmp', file);
  }
  async load(owner, chat, id) {
    const files = this.paths(id); let value;
    try { value = JSON.parse(await readFile(files.metadata, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') throw fault('UPLOAD_EXPIRED', 'This upload expired. Attach the file again.'); throw error; }
    assert(value.owner === owner && value.chat === chat, 'This upload belongs to another device or chat.');
    if (value.expiresAt <= this.now()) throw fault('UPLOAD_EXPIRED', 'This upload expired. Attach the file again.');
    return value;
  }
  async inventory() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    let reserved = 0, count = 0;
    const names = await readdir(this.directory), known = new Set(names);
    for (const name of names) {
      const orphan = name.endsWith('.part') && UUID.test(name.slice(0, -5)) && !known.has(name.slice(0, -5) + '.json');
      const temporary = name.endsWith('.json.tmp') && UUID.test(name.slice(0, -9));
      if (orphan || temporary) await unlink(path.join(this.directory, name));
    }
    for (const name of names) {
      if (!name.endsWith('.json') || !UUID.test(name.slice(0, -5))) continue;
      const files = this.paths(name.slice(0, -5));
      const value = JSON.parse(await readFile(files.metadata, 'utf8'));
      if (value.expiresAt <= this.now()) { await unlink(files.bytes).catch(error => { if (error.code !== 'ENOENT') throw error; }); await unlink(files.metadata); }
      else { reserved += value.size; count++; }
    }
    return { reserved, count };
  }
  async begin(owner, chat, params) { return this.lock(async () => {
    const id = params.uploadId, files = this.paths(id);
    assert(Number.isSafeInteger(params.size) && params.size >= 0 && params.size <= UPLOAD_FILE_BYTES, 'Attach files up to 20 MB.');
    assert(typeof params.sha256 === 'string' && /^[a-f0-9]{64}$/.test(params.sha256), 'File checksum is required.');
    assert(typeof params.name === 'string' && params.name.length > 0 && params.name.length <= 180 && !/[\u0000-\u001f]/.test(params.name), 'Invalid attachment name.');
    const inventory = await this.inventory();
    let prior;
    try { prior = await this.load(owner, chat, id); } catch (error) { if (error.code !== 'UPLOAD_EXPIRED') throw error; }
    if (prior) {
      assert(prior.size === params.size && prior.sha256 === params.sha256 && prior.name === params.name, 'This upload identifier already refers to a different file.');
      return this.describe(prior);
    }
    assert(inventory.count < 64 && inventory.reserved + params.size <= this.quota, 'Pending attachment storage is full. Remove an unused upload or try later.');
    const space = await statfs(this.directory);
    assert(space.bavail * space.bsize > params.size + 256 * 1024 * 1024, 'The PC needs more free space before receiving this file.');
    const handle = await open(files.bytes, 'wx', 0o600);
    try { await handle.sync(); } finally { await handle.close(); }
    const value = { version: 1, id, owner, chat, name: params.name, size: params.size, sha256: params.sha256, expiresAt: this.now() + LIFETIME, ready: false };
    try { await this.save(value); } catch (error) { await unlink(files.bytes); throw error; }
    return this.describe(value);
  }); }
  async describe(value) { const current = await stat(this.paths(value.id).bytes); return { uploadId: value.id, offset: current.size, size: value.size, ready: value.ready, name: value.name, mimeType: value.mimeType || null, expiresAt: value.expiresAt }; }
  async status(owner, chat, id) { return this.lock(async () => this.describe(await this.load(owner, chat, id))); }
  async chunk(owner, chat, params) { return this.lock(async () => {
    const value = await this.load(owner, chat, params.uploadId);
    assert(typeof params.base64 === 'string' && params.base64.length <= UPLOAD_CHUNK_BYTES / 3 * 4, 'Upload chunk is too large.');
    const bytes = Buffer.from(params.base64, 'base64');
    assert(bytes.length > 0 && bytes.toString('base64') === params.base64, 'Invalid attachment bytes.');
    const offset = params.offset;
    assert(Number.isSafeInteger(offset) && offset >= 0 && offset + bytes.length <= value.size, 'Invalid upload offset.');
    const handle = await open(this.paths(value.id).bytes, 'r+');
    try {
      const current = (await handle.stat()).size;
      assert(offset <= current, 'Upload a contiguous file range.');
      const overlap = Math.min(bytes.length, current - offset);
      if (overlap) {
        const existing = Buffer.alloc(overlap); const { bytesRead } = await handle.read(existing, 0, overlap, offset);
        assert(bytesRead === overlap && existing.equals(bytes.subarray(0, overlap)), 'Repeated upload bytes do not match.');
      }
      if (overlap < bytes.length) {
        assert(!value.ready, 'This upload is already finalized.');
        let written = overlap;
        while (written < bytes.length) { const result = await handle.write(bytes, written, bytes.length - written, offset + written); assert(result.bytesWritten > 0, 'File write failed.'); written += result.bytesWritten; }
        await handle.sync();
      }
      return { offset: Math.max(current, offset + bytes.length), size: value.size };
    } finally { await handle.close(); }
  }); }
  async finish(owner, chat, id) { return this.lock(async () => {
    const value = await this.load(owner, chat, id), file = this.paths(id).bytes;
    assert((await stat(file)).size === value.size, 'Finish uploading the file first.');
    if (!value.ready) {
      const hash = createHash('sha256'); for await (const chunk of createReadStream(file)) hash.update(chunk);
      assert(hash.digest('hex') === value.sha256, 'Attachment checksum failed. Upload the file again.');
      const handle = await open(file, 'r');
      try { const header = Buffer.alloc(12); const { bytesRead } = await handle.read(header, 0, header.length, 0); value.mimeType = imageMime(header.subarray(0, bytesRead)); } finally { await handle.close(); }
      if (!value.mimeType && value.size <= TEXT_ATTACHMENT_BYTES) {
        try { textAttachment(value.name, await readFile(file)); value.mimeType = "text/plain"; } catch { /* Keep unsupported uploads un-sendable; old clients receive the existing null MIME result. */ }
      }
      value.ready = true; await this.save(value);
    }
    return this.describe(value);
  }); }
  async cancel(owner, chat, id) { return this.lock(async () => {
    await this.load(owner, chat, id); const files = this.paths(id);
    await unlink(files.bytes).catch(error => { if (error.code !== 'ENOENT') throw error; }); await unlink(files.metadata);
    return { removed: true };
  }); }
  async images(owner, chat, identifiers) { return this.lock(async () => {
    assert(Array.isArray(identifiers) && identifiers.length <= 12 && new Set(identifiers).size === identifiers.length, 'Attach at most 12 distinct images.');
    const values = []; let total = 0;
    for (const id of identifiers) {
      const value = await this.load(owner, chat, id);
      assert(value.ready && value.mimeType?.startsWith('image/'), 'Finish uploading a supported image before sending.');
      total += value.size; assert(total <= 40 * 1024 * 1024, 'Images in one message must total at most 40 MB.'); values.push(value);
    }
    const images = [];
    for (const value of values) {
      const bytes = await readFile(this.paths(value.id).bytes);
      assert(bytes.length === value.size && digest(bytes) === value.sha256, 'The attachment changed. Upload it again.');
      images.push({ type: 'image', mimeType: value.mimeType, data: bytes.toString('base64') });
    }
    return images;
  }); }
  async files(owner, chat, identifiers) { return this.lock(async () => {
    assert(Array.isArray(identifiers) && identifiers.length <= 12 && new Set(identifiers).size === identifiers.length, 'Attach at most 12 distinct files.');
    const files = []; let total = 0;
    for (const id of identifiers) {
      const value = await this.load(owner, chat, id);
      assert(value.ready && value.mimeType === 'text/plain', 'Finish uploading a supported text file before sending.');
      total += value.size; assert(total <= TEXT_ATTACHMENT_TOTAL, 'Text attachments in one message can total up to 1 MB.');
      const bytes = await readFile(this.paths(value.id).bytes);
      assert(bytes.length === value.size && digest(bytes) === value.sha256, 'The attachment changed. Upload it again.');
      files.push({ name: value.name, size: value.size, content: textAttachment(value.name, bytes) });
    }
    return files;
  }); }

}
