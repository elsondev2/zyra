import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sessionPreferences } from '../src/session-preferences.mjs';
import { createMemoryController } from '../src/memory/zyra-memory-controller.mjs';

test('preferences expose names and current chat mode without profile bodies or global memory', () => {
  const runtime = { project: '/selected', session: {} };
  const result = sessionPreferences(runtime, {
    createZyraMemoryController: target => { assert.equal(target, runtime); return { threadMode: () => ({ mode: 'polluted', threadId: 'private' }) }; },
    getActiveProfile: () => 'friendly',
    listZyraProfiles: project => { assert.equal(project, '/selected'); return [{ name: 'friendly', description: 'Friendly style', body: 'private text', path: '/private' }]; }
  }, 'preferences.get');
  assert.deepEqual(result, { profile: 'friendly', profiles: [{ name: 'friendly', description: 'Friendly style' }], memoryMode: 'polluted' });
});

test('memory changes persist for the attached runtime thread only', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'zyra-session-preferences-'));
  try {
    const runtime = { session: { sessionManager: { getSessionId: () => 'selected' } } };
    const controller = createMemoryController({ root, runtime });
    controller.setThreadMode('enabled', 'other');
    const sdk = { createZyraMemoryController: () => controller };
    assert.deepEqual(sessionPreferences(runtime, sdk, 'memory.configure', { enabled: false }), { memoryMode: 'disabled' });
    assert.equal(createMemoryController({ root, runtime }).threadMode().mode, 'disabled');
    assert.equal(controller.threadMode('other').mode, 'enabled');
    assert.throws(() => sessionPreferences(runtime, sdk, 'memory.configure', { enabled: true, threadId: 'other' }));
    assert.throws(() => sessionPreferences(runtime, sdk, 'preferences.get', { project: '/other' }));
    assert.throws(() => sessionPreferences(runtime, sdk, 'memory.configure', { enabled: 'false' }));
    assert.equal(controller.threadMode().mode, 'disabled');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
