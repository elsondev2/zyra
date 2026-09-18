import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DeviceStore } from '../src/device-store.mjs';

test('project access belongs to one device and survives restart without changing future pairings', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'zyra-device-access-'));
  try {
    const store = new DeviceStore(dir);
    const pair = name => store.pair(store.createPairing().secret, name);
    const a = pair('Phone A'), b = pair('Phone B');
    store.setAccess(a.deviceId, { hiddenProjects: ['/private'] });
    const restored = new DeviceStore(dir);
    assert.deepEqual(restored.authenticate(a.deviceId, a.token).hiddenProjects, ['/private']);
    assert.deepEqual(restored.authenticate(b.deviceId, b.token).hiddenProjects || [], []);
    const c = restored.pair(restored.createPairing().secret, 'Phone C');
    assert.deepEqual(restored.authenticate(c.deviceId, c.token).hiddenProjects || [], []);
    assert.throws(() => restored.setAccess('missing', { hiddenProjects: [] }));
    assert.throws(() => restored.setAccess(a.deviceId, { hiddenProjects: [42] }));
    assert.deepEqual(restored.authenticate(a.deviceId, a.token).hiddenProjects, ['/private']);
    assert.equal(JSON.stringify(restored.list()).includes('tokenHash'), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
