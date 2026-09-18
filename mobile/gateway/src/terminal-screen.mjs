import xterm from '@xterm/headless';
import serialize from '@xterm/addon-serialize';
const { Terminal } = xterm, { SerializeAddon } = serialize;
export class TerminalScreen {
  constructor(cols = 100, rows = 28, flow = () => {}) {
    this.terminal = new Terminal({ cols, rows, scrollback: 1000, allowProposedApi: true });
    this.serializer = new SerializeAddon(); this.terminal.loadAddon(this.serializer);
    this.waiters = new Set();
    this.sequence = 0; this.applied = 0; this.pendingBytes = 0; this.flow = flow; this.paused = false; this.disposed = false;
  }
  write(data) {
    if (this.disposed) return this.sequence;
    const bytes = Buffer.byteLength(data), sequence = ++this.sequence;
    this.pendingBytes += bytes;
    if (!this.paused && this.pendingBytes > 256 * 1024) { this.paused = true; this.flow(true); }
    this.terminal.write(data, () => {
      this.applied = sequence; this.pendingBytes -= bytes;
      if (this.paused && this.pendingBytes < 64 * 1024) { this.paused = false; this.flow(false); }
    });
    return sequence;
  }
  resize(cols, rows) { if (!this.disposed) this.terminal.write("", () => { if (!this.disposed) this.terminal.resize(cols, rows); }); }
  snapshot() {
    if (this.disposed) return Promise.reject(new Error('Terminal is closed.'));
    return new Promise((resolve, reject) => {
      this.waiters.add(reject);
      this.terminal.write('', () => {
      this.waiters.delete(reject);
      if (this.disposed) { reject(new Error("Terminal is closed.")); return; }
      let scrollback = 500, data = this.serializer.serialize({ scrollback });
      while (Buffer.byteLength(data) > 256 * 1024 && scrollback > 0) { scrollback = Math.floor(scrollback / 2); data = this.serializer.serialize({ scrollback }); }
      resolve({ cols: this.terminal.cols, rows: this.terminal.rows, sequence: this.applied, data });
    }); });
  }
  clear() { if (!this.disposed) this.terminal.write("", () => { if (!this.disposed) this.terminal.clear(); }); }
  dispose() { if (this.disposed) return; this.disposed = true; for (const reject of this.waiters) reject(new Error("Terminal is closed.")); this.waiters.clear(); this.terminal.dispose(); if (this.paused) this.flow(false); }
}
