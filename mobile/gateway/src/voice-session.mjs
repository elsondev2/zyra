import { assert } from './errors.mjs';
import { VoiceRecovery } from './voice-recovery.mjs';
import { MobileDictationSession, DICTATION_METHODS } from './dictation-session.mjs';

/** One transport connection owns one Voice lease. Provider media uses WebRTC;
 * signaling, transcript/control events and bounded missing-transcript recovery
 * uploads cross this gateway. */
export class MobileVoiceSession {
  constructor(api, receive) {
    this.api = api; this.receive = receive; this.closed = false; this.session = null; this.attachment = null;
    this.identity = null; this.binding = null; this.starting = null; this.stopping = null; this.ingestQueue = Promise.resolve(); this.pendingBatches = 0;
    this.abort = new AbortController();
    this.recovery = null;
    this.dictation = new MobileDictationSession(api.dictation);
    this.supportsDictation = !!api.dictation;
    this.unsubscribe = api.subscribe(event => {
      if (this.binding && ['adapterSessionId', 'realtimeSessionId', 'realtimeSessionGeneration'].some(key => event[key] != null && event[key] !== this.binding[key])) return;
      if (!this.closed && this.session) receive({ session: this.session, event: this.binding && ['session.closed', 'session.error'].includes(event.type) ? { ...this.binding, ...event } : event });
    });
  }
  async dispatch(method, params, chat) {
    assert(!this.closed, 'Reconnect to this PC before starting Voice.');
    const session = chat.canonicalChatId;
    if (DICTATION_METHODS.has(method)) {
      assert(!this.session, 'End Voice before using dictation.');
      return this.dictation.dispatch(method, params, chat);
    }
    if (method === 'voice.status') return { state: this.starting ? 'starting' : this.identity ? 'connected' : 'idle', session: this.session };
    if (method === 'voice.start') {
      assert(!this.dictation.busy, 'Finish or cancel dictation before starting Voice.');
      assert(!this.session && !this.starting && !this.stopping, 'Voice is already active on this phone.');
      assert(typeof params.sdp === 'string' && params.sdp.startsWith('v=0') && Buffer.byteLength(params.sdp) <= 96 * 1024, 'Invalid Voice connection offer.');
      assert(params.voice === undefined || ['arbor','breeze','cove','ember','juniper','maple','sol','spruce','vale'].includes(params.voice), 'Choose a supported voice.');
      this.session = session;
      this.attachment = params.session || session;
      const pending = Promise.resolve().then(() => this.api.start(session, { sdp: params.sdp, voice: params.voice }, this.abort.signal));
      this.starting = pending;
      try {
        const result = await pending;
        assert(!this.closed && !this.abort.signal.aborted, 'Voice startup was cancelled.');
        assert(typeof result.adapterSessionId === 'string' && typeof result.sdp === 'string', 'The PC did not establish a Voice connection.');
        this.identity = result.adapterSessionId;
        this.binding = { adapterSessionId: result.adapterSessionId, realtimeSessionId: result.realtimeSessionId, realtimeSessionGeneration: result.realtimeSessionGeneration };
        this.recovery = new VoiceRecovery(this.api.transcribe);
        return { ...result, recoveryAvailable: typeof this.api.transcribe === 'function' };
      } catch (error) { await this.api.stop().catch(() => {}); this.session = null; this.attachment = null; throw error; }
      finally { if (this.starting === pending) this.starting = null; }
    }
    assert(this.session === session, 'This chat does not own the phone’s Voice session.');
    if (method === 'voice.stop') {
      this.abort.abort();
      await this.stop(); this.abort = new AbortController();
      return { success: true };
    }
    assert(this.identity && params.adapterSessionId === this.identity, 'This Voice connection has ended.');
    if (method.startsWith('voice.recovery.')) {
      assert(this.recovery, 'Voice recovery is unavailable.');
      const action = method.slice('voice.recovery.'.length);
      assert(['begin', 'chunk', 'finish', 'cancel'].includes(action), 'Unsupported Voice recovery action.');
      return this.recovery[action](params);
    }
    if (method === 'voice.ingest') {
      assert(Array.isArray(params.events) && params.events.length > 0 && params.events.length <= 32 &&
        Buffer.byteLength(JSON.stringify(params.events)) <= 64 * 1024 && params.events.every(event => event && typeof event === 'object' && !Array.isArray(event) && typeof event.type === 'string'), 'Invalid Voice event batch.');
      assert(this.pendingBatches < 2, 'Voice events are arriving too quickly.');
      this.pendingBatches++;
      const identity = this.identity;
      const run = async () => {
        for (const event of params.events) {
          assert(!this.closed && this.identity === identity && !this.abort.signal.aborted, 'Voice has ended.');
          await this.api.ingest(identity, event);
        }
        return { success: true };
      };
      const pending = this.ingestQueue.then(run, run);
      this.ingestQueue = pending.catch(() => {});
      try { return await pending; } finally { this.pendingBatches--; }
    }
    assert(method === 'voice.message', 'Unsupported Voice action.');
    assert(typeof params.text === 'string' && params.text.trim().length > 0 && params.text.length <= 8000 &&
      typeof params.clientMessageId === 'string' && /^[a-zA-Z0-9:._-]{1,100}$/.test(params.clientMessageId), 'Write a shorter Voice message.');
    // Use the owning PC's clock, like its canonical route. A phone clock ahead
    // of the host would otherwise fail Desktop's created-at validation.
    return this.api.message({ text: params.text, clientMessageId: params.clientMessageId, clientMessageCreatedAt: new Date().toISOString() });
  }
  stop() {
    if (this.stopping) return this.stopping;
    this.recovery?.close(); this.recovery = null;
    const pendingStart = this.starting;
    this.stopping = (async () => {
      await this.api.stop();
      if (pendingStart) { await pendingStart.catch(() => {}); await this.api.stop(); }
      this.identity = null; this.binding = null; this.session = null; this.attachment = null;
    })().finally(() => { this.stopping = null; });
    return this.stopping;
  }
  async close() {
    if (this.closed) return this.stopping;
    this.closed = true; this.abort.abort(); this.unsubscribe();
    this.dictation.close();
    // The adapter's owner check prevents a late old connection stopping a new one.
    if (this.session || this.starting) await this.stop();
  }
  async detach(attachment) {
    this.dictation.detach(attachment);
    if (this.attachment !== attachment) return;
    this.abort.abort();
    await this.stop();
    if (!this.closed) this.abort = new AbortController();
  }
}
