import { randomUUID } from 'node:crypto';

/** Worker-only RPC. The server derives the sender from this worker's session. */
export class ThreadBridgeClient {
  constructor(send) { this.send = send; this.pending = new Map(); this.disposed = false; }
  request(input, agentRunId) {
    if (this.disposed) return Promise.reject(new Error('Thread messaging disconnected.'));
    if (this.pending.size >= 128) return Promise.reject(new Error('Too many pending thread operations. Wait for existing receipts.'));
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error('Thread messaging timed out.')); }, 30_000);
      timer.unref?.();
      this.pending.set(requestId, { resolve, reject, timer });
      try { this.send({ type: 'threads.request', requestId, input, ...(agentRunId ? { agentRunId } : {}) }); }
      catch (error) { clearTimeout(timer); this.pending.delete(requestId); reject(error); }
    });
  }
  forAgent(agentRunId) { return { request: input => this.request(input, agentRunId) }; }
  handleResponse(message) {
    const pending = this.pending.get(message.requestId);
    if (!pending) return;
    clearTimeout(pending.timer); this.pending.delete(message.requestId);
    if (message.ok) pending.resolve(message.result);
    else pending.reject(new Error(message.error || 'Thread messaging failed.'));
  }
  dispose() {
    this.disposed = true;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('Thread messaging disconnected.')); }
    this.pending.clear();
  }
}
