import { MAX_AGENT_SERVER_REPLAY_EVENTS } from './protocol.mjs';
export const MAX_REPLAY_BYTES = 8 * 1024 * 1024;
export class ReplayWindow {
  constructor({ maxBytes = MAX_REPLAY_BYTES, maxEvents = MAX_AGENT_SERVER_REPLAY_EVENTS } = {}) {
    this.maxBytes = maxBytes; this.maxEvents = maxEvents; this.entries = []; this.sizes = []; this.bytes = 0;
  }
  append(entry) {
    let size = Buffer.byteLength(JSON.stringify(entry));
    if (size > this.maxBytes) {
      entry = { sequence: entry.sequence, occurredAt: entry.occurredAt, requestContext: entry.requestContext,
        event: { type: 'zyra_server_event_omitted', originalType: entry.event?.type, reason: 'replay-limit' } };
      size = Buffer.byteLength(JSON.stringify(entry));
    }
    this.entries.push(entry); this.sizes.push(size); this.bytes += size;
    while (this.entries.length > this.maxEvents || this.bytes > this.maxBytes) {
      this.entries.shift(); this.bytes -= this.sizes.shift();
    }
    return entry;
  }
  reset(entries = []) { this.entries = []; this.sizes = []; this.bytes = 0; for (const entry of entries) this.append(entry); }
}
