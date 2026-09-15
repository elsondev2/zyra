import { MAX_FRAME_BYTES } from './projection.mjs';
/** Coalesce text briefly; keep bulk terminal traffic below the control-message buffer reserve. */
export class MobileOutbound {
  constructor(socket, { delay = 50 } = {}) {
    this.socket = socket; this.delay = delay; this.pending = null; this.timer = null;
    this.stalledTerminals = new Set(); this.recoveryTimer = null;
  }
  raw(value) {
    if (this.socket.readyState !== 1) return;
    if (this.socket.bufferedAmount > 512 * 1024) { this.socket.close(1013, 'Reconnect to recover missed activity.'); return; }
    const json = JSON.stringify(value);
    if (Buffer.byteLength(json) > MAX_FRAME_BYTES) { this.socket.close(1009, 'Response exceeds mobile frame budget'); return; }
    this.socket.send(json);
  }
  send(value) {
    if (value.type === 'terminal.event' && value.event?.type === 'output') {
      if (this.stalledTerminals.has(value.terminalId) || this.socket.bufferedAmount > 128 * 1024 || Buffer.byteLength(JSON.stringify(value)) > 64 * 1024) {
        this.stalledTerminals.add(value.terminalId); this.scheduleRecovery(); return;
      }
    }
    const delta = value.type === 'session.event' && ['text_delta', 'thinking_delta'].includes(value.event?.type);
    if (!delta) { this.flush(); this.raw(value); return; }
    const old = this.pending;
    if (old && old.sessionKey === value.sessionKey && old.sequence + 1 === value.sequence
      && old.event.type === value.event.type && old.event.contentIndex === value.event.contentIndex
      && old.requestContext?.turnId === value.requestContext?.turnId
      && Buffer.byteLength(old.event.delta || '') + Buffer.byteLength(value.event.delta || '') < 8192) {
      this.pending = { ...value, firstSequence: old.firstSequence ?? old.sequence,
        deltaLengths: [...(old.deltaLengths || [(old.event.delta || "").length]), (value.event.delta || "").length],
        event: { ...value.event, delta: (old.event.delta || '') + (value.event.delta || '') } };
    } else { this.flush(); this.pending = value; }
    if (!this.timer) { this.timer = setTimeout(() => this.flush(), this.delay); this.timer.unref?.(); }
  }
  flush() {
    clearTimeout(this.timer); this.timer = null;
    if (this.pending) { const value = this.pending; this.pending = null; this.raw(value); }
  }
  scheduleRecovery() {
    if (this.recoveryTimer) return;
    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = null;
      if (this.socket.readyState !== 1) { this.stalledTerminals.clear(); return; }
      if (this.socket.bufferedAmount > 64 * 1024) { this.scheduleRecovery(); return; }
      for (const terminalId of this.stalledTerminals) this.send({ type: 'terminal.event', terminalId, event: { type: 'resync' } });
      this.stalledTerminals.clear();
    }, 250); this.recoveryTimer.unref?.();
  }
  close() { clearTimeout(this.timer); clearTimeout(this.recoveryTimer); this.pending = null; this.stalledTerminals.clear(); }
}
