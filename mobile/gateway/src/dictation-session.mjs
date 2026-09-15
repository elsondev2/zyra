import { VoiceRecovery } from './voice-recovery.mjs';
import { assert } from './errors.mjs';

export const DICTATION_METHODS = new Set(['dictation.status', 'dictation.begin', 'dictation.chunk', 'dictation.finish', 'dictation.cancel']);

/** An ephemeral upload owned by one attached chat on one authenticated socket.
 * It returns draft text only: no live Voice lease, message ingestion or journal. */
export class MobileDictationSession {
  constructor(api) { this.api = api; this.upload = new VoiceRecovery(api?.transcribe); this.session = null; this.attachment = null; this.closed = false; }
  get busy() { return !!this.upload.upload; }
  async dispatch(method, params, chat) {
    assert(!this.closed && this.api, 'Update Zyra on this PC to use dictation.');
    if (method === 'dictation.status') return this.api.state();
    if (method === 'dictation.begin') {
      assert(!this.busy, 'A recording is still being processed.');
      const result = this.upload.begin({ ...params, providerItemId: params.recoveryId });
      this.session = chat.canonicalChatId; this.attachment = params.session;
      return result;
    }
    assert(this.session === chat.canonicalChatId, 'This chat does not own the recording.');
    if (method === 'dictation.chunk') return this.upload.chunk(params);
    if (method === 'dictation.cancel') return this.upload.cancel(params);
    assert(method === 'dictation.finish', 'Unsupported dictation action.');
    const result = await this.upload.finish(params);
    return { text: result.text };
  }
  detach(attachment) {
    if (this.attachment === attachment && this.upload.upload) this.upload.cancel({ recoveryId: this.upload.upload.id });
  }
  close() { this.closed = true; this.upload.close(); }
}
