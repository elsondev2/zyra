import { createHash } from 'node:crypto';
import { ZyraAgentServerClient } from '../agent-server/client.mjs';

export const EXTERNAL_TOOL_METHODS = ['tools.status', 'tools.open', 'tools.control', 'tools.close'];

export class ZyraExternalToolsClient {
  constructor(options = {}) {
    this.client = options.client || new ZyraAgentServerClient({ ...options, surface: options.surface || 'pi',
      displayName: options.displayName || 'Pi', autoStart: false, verifyRuntimeRevision: false,
      requiredMethods: EXTERNAL_TOOL_METHODS });
    this.project = options.project || process.cwd();
    this.sourceSessionId = options.sourceSessionId || `pi-${process.pid}`;
    this.session = null;
    this.opening = null;
    this.generation = 0;
    this.client.on('disconnect', () => { this.generation++; this.session = null; });
  }

  async status() { return this.client.request('tools.status', {}, { timeoutMs: 5_000 }); }

  async ensureSession() {
    if (this.session) return this.session;
    if (this.opening) return this.opening;
    const generation = this.generation;
    const sourceSessionId = `pi-${createHash('sha256').update(String(this.sourceSessionId)).digest('hex').slice(0, 32)}`;
    this.opening = this.client.request('tools.open', { project: this.project, sourceSessionId }, { timeoutMs: 15_000 }).then(async session => {
      if (generation !== this.generation) {
        await this.client.request('tools.close', { toolSessionId: session.toolSessionId }, { timeoutMs: 5_000 }).catch(() => {});
        throw Object.assign(new Error('The Pi tool turn ended during connection.'), { code: 'CONTROL_CANCELLED' });
      }
      return this.session = session;
    }).finally(() => { this.opening = null; });
    return this.opening;
  }

  async request(operation, options = {}) {
    if (options.signal?.aborted) throw Object.assign(new Error('Tool call cancelled.'), { code: 'CONTROL_CANCELLED' });
    const session = await this.ensureSession();
    if (options.signal?.aborted) { await this.endTurn(); throw Object.assign(new Error('Tool call cancelled.'), { code: 'CONTROL_CANCELLED' }); }
    const timeoutMs = Math.max(100, Math.min(600_000, Number(options.timeoutMs) || 15_000));
    let rejectAbort;
    const cancelled = new Promise((_, reject) => { rejectAbort = reject; });
    const abort = () => {
      void this.endTurn();
      rejectAbort(Object.assign(new Error('Tool call cancelled.'), { code: 'CONTROL_CANCELLED' }));
    };
    options.signal?.addEventListener('abort', abort, { once: true });
    try {
      return await Promise.race([this.client.request('tools.control', { toolSessionId: session.toolSessionId, operation, timeoutMs }, { timeoutMs: timeoutMs + 2_000 }), cancelled]);
    } finally { options.signal?.removeEventListener('abort', abort); }
  }

  async endTurn() {
    this.generation++;
    const session = this.session;
    this.session = null;
    if (session && this.client.socket?.writable) {
      await this.client.request('tools.close', { toolSessionId: session.toolSessionId }, { timeoutMs: 5_000 }).catch(() => {});
    }
  }

  async close() { await this.endTurn(); this.client.close(); }
}
