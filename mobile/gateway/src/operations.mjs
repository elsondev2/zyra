import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync, openSync, closeSync, fsyncSync, appendFileSync, truncateSync } from 'node:fs';
import path from 'node:path';
import { fault } from './errors.mjs';

const RETENTION_MS = 24 * 60 * 60 * 1000;
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
// Intent is durable before dispatch. Expired IDs can never become fresh side effects.
export class OperationLedger {
  constructor(directory, limit = 10000, now = Date.now) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.file = path.join(directory, 'operations.jsonl'); this.writes = 0; this.limit = limit; this.now = now; this.running = new Map();
    this.records = new Map();
    try {
      const bytes = readFileSync(this.file);
      const end = bytes.lastIndexOf(10) + 1;
      for (const line of bytes.subarray(0, end).toString('utf8').split('\n').filter(Boolean)) {
        const [key, record] = JSON.parse(line); this.records.set(key, record);
      }
      // A torn final append cannot prove completion. Keep its preceding durable intent.
      if (end < bytes.length) truncateSync(this.file, end);
    }
    catch (error) { if (error.code !== 'ENOENT') throw error; this.records = new Map(); }
  }
  persist(key, record) {
    const fd = openSync(this.file, 'a', 0o600);
    try { appendFileSync(fd, JSON.stringify([key, record]) + '\n'); fsyncSync(fd); }
    finally { closeSync(fd); }
    this.records.set(key, record);
    if (++this.writes >= 2048) this.compact();
  }
  compact() {
    const temporary = this.file + '.tmp';
    const fd = openSync(temporary, 'w', 0o600);
    try {
      for (const record of this.records) appendFileSync(fd, JSON.stringify(record) + '\n');
      fsyncSync(fd);
    } finally { closeSync(fd); }
    renameSync(temporary, this.file); this.writes = 0;
  }
  status(deviceId, id) {
    const key = `${deviceId}:${id}`, record = this.records.get(key);
    return record ? { state: record.state === 'done' ? 'completed' : this.running.has(key) ? 'running' : 'uncertain', at: record.at } : { state: 'unknown' };
  }
  async run(deviceId, id, input, action) {
    const created = Number(String(id).split(':')[0]);
    if (!Number.isSafeInteger(created) || created < this.now() - RETENTION_MS) throw fault('OPERATION_EXPIRED', 'This request has expired. Review the session before making a new request.');
    if (created > this.now() + 300000) throw fault('CLOCK_SKEW', 'Your phone and PC clocks disagree. Correct the clock and reconnect.');
    const key = `${deviceId}:${id}`;
    const hash = createHash('sha256').update(JSON.stringify(canonical(input))).digest('hex');
    const prior = this.records.get(key);
    if (prior) {
      if (prior.hash !== hash) throw fault('OPERATION_CONFLICT', 'This request ID was already used for a different action.');
      if (this.running.has(key)) return this.running.get(key);
      if (prior.state === 'done') return prior.result;
      throw fault('OUTCOME_UNKNOWN', 'This action may already have run. Refresh the session before deciding what to do.');
    }
    for (const [oldKey, record] of this.records) if (record.created < this.now() - RETENTION_MS && !this.running.has(oldKey)) this.records.delete(oldKey);
    if (this.records.size >= this.limit) throw fault('RECEIPT_STORE_FULL', 'Too many actions were submitted in the last day. Try again later.');
    this.persist(key, { hash, created, state: 'dispatched', at: this.now() });
    const promise = Promise.resolve().then(action).then(result => {
      const receipt = Buffer.byteLength(JSON.stringify(result ?? null)) <= 4096 ? result : { completed: true, refreshRequired: true };
      this.persist(key, { hash, created, state: 'done', result: receipt, at: this.now() });
      return result;
    }).finally(() => this.running.delete(key));
    this.running.set(key, promise); return promise;
  }
}
