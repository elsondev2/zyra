import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DeviceStore } from '../src/device-store.mjs';
import { OperationLedger } from '../src/operations.mjs';

function temporary(t) { const dir = mkdtempSync(path.join(os.tmpdir(), 'zyra-mobile-')); t.after(() => rmSync(dir, { recursive: true, force: true })); return dir; }
test('pairing is single-use, expires, stores no bearer secret and revokes immediately', (t) => {
  let now = 10; const dir = temporary(t); const store = new DeviceStore(dir, () => now);
  const pairing = store.createPairing();
  assert.throws(() => store.pair('bad', 'Phone'));
  const device = store.pair(pairing.secret, 'Phone');
  assert.throws(() => store.pair(pairing.secret, 'Another'));
  assert.ok(store.authenticate(device.deviceId, device.token));
  assert.equal(store.authenticate(device.deviceId, 'wrong'), null);
  assert.ok(!readFileSync(store.file, 'utf8').includes(device.token));
  store.revoke(device.deviceId); assert.equal(store.authenticate(device.deviceId, device.token), null);
  const expired = store.createPairing(); now += 120001;
  assert.throws(() => store.pair(expired.secret, 'Phone'));
});
test('concurrent and completed retries dispatch once; changed payload and uncertain restart fail closed', async (t) => {
  const dir = temporary(t); const ledger = new OperationLedger(dir); let calls = 0;
  const action = async () => { calls++; await new Promise(r => setTimeout(r, 10)); return { sent: true }; };
  const input = { prompt: 'hello' };
  const one = Date.now() + ':one', two = Date.now() + ':two';
  await Promise.all([ledger.run('phone', one, input, action), ledger.run('phone', one, input, action)]);
  assert.equal(calls, 1);
  await new OperationLedger(dir).run('phone', one, input, action); assert.equal(calls, 1);
  await assert.rejects(ledger.run('phone', one, { prompt: 'changed' }, action), { code: 'OPERATION_CONFLICT' });
  await assert.rejects(ledger.run('phone', two, input, async () => { throw new Error('transport closed'); }));
  await assert.rejects(new OperationLedger(dir).run('phone', two, input, action), { code: 'OUTCOME_UNKNOWN' });
  assert.equal(calls, 1);
});

test('receipts append bounded writes, tolerate a torn tail, and reject expired operation IDs', async t => {
  const dir = temporary(t); const now = Date.now(), ledger = new OperationLedger(dir, 100, () => now);
  for (let i = 0; i < 40; i++) await ledger.run('phone', now + ':' + i, { text: 'hello' }, async () => ({ sent: true }));
  const before = (await import('node:fs')).statSync(ledger.file).size;
  await ledger.run('phone', now + ':next', {}, async () => ({}));
  const after = (await import('node:fs')).statSync(ledger.file).size;
  assert.ok(after - before < 1000, 'one action must not rewrite the whole receipt store');
  const uncertain = now + ':crash';
  await assert.rejects(ledger.run('phone', uncertain, {}, async () => { throw Error('lost response'); }));
  (await import('node:fs')).appendFileSync(ledger.file, '["partial');
  const reopened = new OperationLedger(dir, 100, () => now);
  assert.equal(reopened.status('phone', uncertain).state, 'uncertain');
  await assert.rejects(reopened.run('phone', (now - 86400001) + ':old', {}, async () => { throw Error('must not dispatch'); }), { code: 'OPERATION_EXPIRED' });
});

test('only one host may own a device and receipt store', async t => {
  const { acquireHostLock } = await import('../src/process-lock.mjs');
  const dir = temporary(t), release = acquireHostLock(dir);
  assert.throws(() => acquireHostLock(dir), /already running/);
  release(); const again = acquireHostLock(dir); again();
});
