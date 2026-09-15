import { mkdirSync, openSync, writeFileSync, closeSync, readFileSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
export function acquireHostLock(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, 'host.lock');
  const identity = JSON.stringify({ pid: process.pid, nonce: randomUUID() });
  let fd;
  try { fd = openSync(file, 'wx', 0o600); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let existing;
    try { existing = JSON.parse(readFileSync(file, 'utf8')); } catch { throw new Error('Mobile host lock is incomplete. Check that no other mobile host is running before removing host.lock.'); }
    if (!Number.isSafeInteger(existing.pid) || existing.pid <= 0) throw new Error('Invalid mobile host lock.');
    try { process.kill(existing.pid, 0); throw new Error('Mobile access is already running for this profile.'); }
    catch (probe) { if (probe.code !== 'ESRCH') throw probe; }
    // Compare again before removing a dead process lock. A new contender must still win exclusive creation.
    if (readFileSync(file, 'utf8') !== JSON.stringify(existing)) throw new Error('Mobile host ownership changed. Try again.');
    unlinkSync(file); fd = openSync(file, 'wx', 0o600);
  }
  try { writeFileSync(fd, identity); } finally { closeSync(fd); }
  return () => {
    try { if (readFileSync(file, 'utf8') === identity) unlinkSync(file); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  };
}
