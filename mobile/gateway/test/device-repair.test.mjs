import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DeviceStore } from '../src/device-store.mjs';
test('authenticated re-pair preserves one phone, credential, scope and other clients', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'zyra-repair-'));
  try {
    const store = new DeviceStore(dir);
    const pair = (name, previous) => store.pair(store.createPairing().secret, name, previous);
    const a = pair('Same model'), b = pair('Same model');
    store.setAccess(a.deviceId, { hiddenProjects: [path.resolve(dir, 'private')] });
    const repaired = pair('My phone', a);
    assert.deepEqual(repaired, a);
    assert.equal(store.list().length, 2);
    assert.equal(store.authenticate(a.deviceId, a.token).hiddenProjects.length, 1);
    assert.ok(store.authenticate(b.deviceId, b.token));
    const restarted = new DeviceStore(dir);
    assert.equal(restarted.list().length, 2);
    assert.equal(restarted.authenticate(a.deviceId, a.token).name, 'My phone');
    assert.throws(() => restarted.pair('expired', 'Phone', a));
    const c = pair('Same model', { deviceId: a.deviceId, token: 'incorrect' });
    assert.notEqual(c.deviceId, a.deviceId);
    store.revoke(c.deviceId);
    assert.ok(store.authenticate(a.deviceId, a.token));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
