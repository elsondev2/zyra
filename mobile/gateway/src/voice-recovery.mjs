import { createHash } from 'node:crypto';
import { assert } from './errors.mjs';

const MAX_AUDIO_BYTES = 120 * 24000 * 2 + 44;
const GLOBAL_BYTES = 24 * 1024 * 1024;
let reservedBytes = 0;

/** One ephemeral, sequential WAV upload per Voice lease. Never touches disk or
 * the command journal. Cancellation also aborts an in-flight transcription. */
export class VoiceRecovery {
  constructor(transcribe) { this.transcribe = transcribe; this.upload = null; this.closed = false; }
  begin(params) {
    assert(!this.closed && !this.upload && typeof this.transcribe === 'function', 'Voice recovery is busy or unavailable.');
    assert(typeof params.recoveryId === 'string' && /^[a-zA-Z0-9:._-]{1,100}$/.test(params.recoveryId), 'Invalid Voice recovery identity.');
    assert(typeof params.providerItemId === 'string' && params.providerItemId.trim().length > 0 && params.providerItemId.length <= 512, 'Invalid Voice message identity.');
    assert(Number.isSafeInteger(params.bytes) && params.bytes >= 12044 && params.bytes <= MAX_AUDIO_BYTES, 'Voice recovery supports speech from 250 ms to 120 seconds.');
    assert(Number.isFinite(params.durationMs) && params.durationMs >= 250 && params.durationMs <= 120000 && Math.abs(params.bytes - 44 - params.durationMs * 48) <= 48, 'Invalid Voice recording duration.');
    assert(typeof params.sha256 === 'string' && /^[a-f0-9]{64}$/.test(params.sha256), 'Invalid Voice recording checksum.');
    assert(reservedBytes + params.bytes <= GLOBAL_BYTES, 'Voice recovery is busy. Try again shortly.');
    const upload = { id: params.recoveryId, providerItemId: params.providerItemId, bytes: params.bytes, durationMs: params.durationMs,
      sha256: params.sha256, buffer: Buffer.alloc(params.bytes), offset: 0, abort: new AbortController(), running: false, timer: null, released: false };
    this.upload = upload; reservedBytes += upload.bytes; this.touch(upload);
    return { recoveryId: upload.id };
  }
  current(params) {
    const upload = this.upload;
    assert(!this.closed && upload && upload.id === params.recoveryId && !upload.abort.signal.aborted, 'This Voice recovery has ended.');
    return upload;
  }
  touch(upload) {
    clearTimeout(upload.timer);
    upload.timer = setTimeout(() => this.cancel({ recoveryId: upload.id }), 30000);
    upload.timer.unref?.();
  }
  chunk(params) {
    const upload = this.current(params);
    assert(!upload.running && params.offset === upload.offset, 'Voice recording chunks must arrive in order.');
    assert(typeof params.data === 'string' && params.data.length <= 65536 && /^[A-Za-z0-9+/]+={0,2}$/.test(params.data), 'Invalid Voice recording chunk.');
    const data = Buffer.from(params.data, 'base64');
    assert(data.length > 0 && data.length <= 48 * 1024 && data.toString('base64') === params.data && upload.offset + data.length <= upload.bytes, 'Invalid Voice recording chunk.');
    data.copy(upload.buffer, upload.offset); upload.offset += data.length; data.fill(0); this.touch(upload);
    return { offset: upload.offset };
  }
  async finish(params) {
    const upload = this.current(params);
    assert(!upload.running && upload.offset === upload.bytes, 'The Voice recording is incomplete.');
    assert(createHash('sha256').update(upload.buffer).digest('hex') === upload.sha256, 'The Voice recording checksum did not match.');
    upload.running = true; clearTimeout(upload.timer);
    try {
      const input = { audioBase64: upload.buffer.toString('base64'), mimeType: 'audio/wav', sampleRateHz: 24000, durationMs: upload.durationMs };
      upload.buffer.fill(0); upload.buffer = null;
      const text = await this.transcribe(input, upload.abort.signal);
      assert(!this.closed && this.upload === upload && !upload.abort.signal.aborted, 'This Voice recovery has ended.');
      assert(typeof text === 'string' && text.trim().length > 0 && text.length <= 100000, 'The recovered transcript is unavailable.');
      assert(Buffer.byteLength(JSON.stringify({ type: 'zyra.input_audio_transcription.completed', item_id: upload.providerItemId, role: 'user', transcript: text.trim() })) <= 60 * 1024, 'The recovered transcript exceeds the Voice event limit.');
      return { providerItemId: upload.providerItemId, text: text.trim() };
    } finally { this.release(upload); }
  }
  cancel(params) {
    const upload = this.upload;
    if (!upload || upload.id !== params.recoveryId) return { cancelled: true };
    upload.abort.abort(new Error('Voice recovery was cancelled.'));
    clearTimeout(upload.timer); upload.buffer?.fill(0); upload.buffer = null;
    // Keep the reservation until the provider request settles, preventing a
    // cancel/start loop from creating unbounded in-flight recordings.
    if (!upload.running) this.release(upload);
    return { cancelled: true };
  }
  release(upload) {
    if (upload.released) return;
    upload.released = true; clearTimeout(upload.timer); upload.buffer?.fill(0); upload.buffer = null;
    reservedBytes -= upload.bytes;
    if (this.upload === upload) this.upload = null;
  }
  close() { this.closed = true; if (this.upload) this.cancel({ recoveryId: this.upload.id }); }
}
