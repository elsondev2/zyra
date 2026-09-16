import { stat } from 'node:fs/promises';
import { MODEL_PRESENTATION_VERSION } from './chat-model.mjs';
import { scanModelPresentation } from './chat-model-scan.mjs';

/** Only visible legacy chats are queued; one paced reader and no message-body copies. */
export class ChatModelBackfill {
  constructor({ get, commit, flush = () => {}, scan = scanModelPresentation }) {
    this.get = get; this.commit = commit; this.scan = scan; this.pending = new Set(); this.active = null; this.abort = null; this.running = null;
    this.flush = flush;
  }
  enqueue(ids) {
    for (const id of ids) {
      const record = this.get(id);
      if (record && record.modelPresentationVersion !== MODEL_PRESENTATION_VERSION && id !== this.active && this.pending.size < 128) this.pending.add(id);
    }
    if (!this.running && this.pending.size) this.running = this.drain().finally(() => { this.running = null; if (this.pending.size) this.enqueue([]); });
  }
  async drain() {
    const controller = new AbortController(); this.abort = controller;
    let committed = 0, lastFlush = Date.now();
    while (this.pending.size && !controller.signal.aborted) {
      const id = this.pending.values().next().value; this.pending.delete(id); this.active = id;
      const record = this.get(id);
      if (!record || record.modelPresentationVersion === MODEL_PRESENTATION_VERSION) continue;
      const expected = { path: record.sessionPath, size: record.fileSize, modified: record.fileMtimeMs };
      try {
        const before = await stat(expected.path);
        if (before.size !== expected.size || before.mtimeMs !== expected.modified) continue;
        const result = await this.scan(expected.path, record.entryOffsets, { signal: controller.signal });
        const current = this.get(id), after = await stat(expected.path);
        if (!controller.signal.aborted && current && current.sessionPath === expected.path && current.fileSize === expected.size &&
            current.fileMtimeMs === expected.modified && after.size === expected.size && after.mtimeMs === expected.modified &&
            current.modelPresentationVersion !== MODEL_PRESENTATION_VERSION) {
          this.commit(id, result); committed++;
          if (committed >= 16 || Date.now() - lastFlush >= 1000) { this.flush(); committed = 0; lastFlush = Date.now(); }
        }
      } catch { /* Missing, replaced or cancelled chat: leave its model unknown; a later request can retry. */ }
      finally { this.active = null; }
    }
    this.flush();
    this.active = null;
    if (this.abort === controller) this.abort = null;
  }
  close() { this.pending.clear(); this.abort?.abort(); }
  async idle() { await this.running; }
}
