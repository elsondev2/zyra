import { closeSync, existsSync, fsyncSync, openSync, writeFileSync } from 'node:fs';

/** Pi delays new files until the first assistant message. A mobile client must
 * discover its canonical chat before it can send that first message or upload.
 * Keep the real header/config entries, without inventing a conversation turn. */
export function ensureSessionDurable(manager) {
  const file = manager?.getSessionFile?.();
  if (!file || manager.isPersisted?.() === false) throw new Error('This chat cannot be saved on the PC.');
  if (manager.flushed === true && existsSync(file)) return;
  const header = manager.getHeader?.(), entries = manager.getEntries?.();
  if (header?.type !== 'session' || header.id !== manager.getSessionId?.() || !Array.isArray(entries)) {
    throw new Error('The canonical chat cannot be saved with this runtime.');
  }
  // Exclusive creation protects another transcript even if a stale manager
  // believes the path is new. Pi's first assistant must append, not create wx.
  const fd = openSync(file, 'wx', 0o600);
  try {
    writeFileSync(fd, [header, ...entries].map(entry => JSON.stringify(entry)).join('\n') + '\n');
    fsyncSync(fd);
    manager.flushed = true;
  } finally { closeSync(fd); }
}
