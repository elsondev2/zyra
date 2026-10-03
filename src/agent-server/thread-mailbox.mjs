import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const ID = /^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,191}$/;
export const THREAD_MESSAGE_TYPE = 'zyra_thread_message';

/** Bounded durable receipts; a queued message survives worker/server restarts. */
export class ThreadMailbox {
  constructor(directory, { maxCompleted = 1024 } = {}) {
    this.directory = path.resolve(directory); this.messages = new Map(); this.delivering = new Set();
    this.maxCompleted = maxCompleted;
    if (existsSync(this.directory)) for (const file of readdirSync(this.directory).filter(file => /^[a-f0-9]{64}\.json$/.test(file))) {
      try { const message = JSON.parse(readFileSync(path.join(this.directory, file), 'utf8')); if (message.version === 1 && ID.test(message.messageId)) this.messages.set(message.messageId, message); } catch { /* A malformed receipt cannot crash the daemon. */ }
    }
    this.prune();
  }
  enqueue(sender, input) {
    const recipientThreadId = String(input.threadId || '');
    const text = String(input.prompt || '').trim();
    if (!ID.test(recipientThreadId)) throw new Error('A valid recipient thread id is required.');
    if (!text || Buffer.byteLength(text) > 64 * 1024) throw new Error('Thread messages must contain 1 to 65536 bytes.');
    if (!input.dedupeKey && !input.messageId) throw new Error('A stable thread message operation id is required.');
    const messageId = 'thread-message:' + createHash('sha256').update(`${sender.senderThreadId}\0${input.dedupeKey || input.messageId || ''}\0${recipientThreadId}`).digest('hex');
    const existing = this.messages.get(messageId);
    if (existing) { if (existing.text !== text) throw new Error('Thread message receipt was reused with different content.'); return existing; }
    if ([...this.messages.values()].filter(message => message.status === 'queued').length >= 1024) throw new Error('Thread mailbox is full. Resolve queued messages before sending more.');
    const message = { version: 1, messageId, ...sender, recipientThreadId, text, createdAt: new Date().toISOString(), status: 'queued' };
    this.save(message); return message;
  }
  get(messageId, senderThreadId) { const message = this.messages.get(messageId); return message?.senderThreadId === senderThreadId ? message : null; }
  async deliver(message, handler) {
    if (message.status !== 'queued' || this.delivering.has(message.messageId)) return;
    this.delivering.add(message.messageId);
    try { await handler(message); this.save({ ...message, status: 'delivered', deliveredAt: new Date().toISOString() }); }
    catch (error) { this.save({ ...message, status: 'failed', error: String(error?.message || error), failedAt: new Date().toISOString() }); }
    finally { this.delivering.delete(message.messageId); }
  }
  save(message) {
    mkdirSync(this.directory, { recursive: true });
    const file = path.join(this.directory, createHash('sha256').update(message.messageId).digest('hex') + '.json');
    const temporary = file + '.tmp'; writeFileSync(temporary, JSON.stringify(message)); renameSync(temporary, file);
    this.messages.set(message.messageId, message);
    if (message.status !== 'queued') this.prune();
  }
  prune() {
    const completed = [...this.messages.values()].filter(message => message.status !== 'queued')
      .sort((a, b) => String(b.deliveredAt || b.failedAt || b.createdAt).localeCompare(String(a.deliveredAt || a.failedAt || a.createdAt)));
    for (const message of completed.slice(this.maxCompleted)) {
      const file = path.join(this.directory, createHash('sha256').update(message.messageId).digest('hex') + '.json');
      try { unlinkSync(file); this.messages.delete(message.messageId); } catch { /* Keep the receipt if disk cleanup is unavailable. */ }
    }
  }
}
