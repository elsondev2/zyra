import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectRuntimeStatus, mobileRuntimeStatus } from '../src/runtime-status.mjs';

test('runtime status projects only the bounded mobile contract', () => {
  const status = projectRuntimeStatus({
    phase: 'ready', connection: 'connected', lastConfirmedAt: '2026-03-20T10:00:00.000Z', errorCode: 'NONE', updatePending: true,
    instance: { instanceId: 'runtime-1', namespaceId: 'desktop', channel: 'stable', protocolVersion: 1, runtimeRevision: 'a'.repeat(64), startedAt: '2026-03-20T09:00:00.000Z', rawPath: 'C:/private' },
    installation: { kind: 'installed', label: 'Zyra Desktop', appVersion: '1.2.3', token: 'secret' }, sessions: [{ id: 'private' }]
  });
  assert.deepEqual(status, {
    phase: 'ready', connection: 'connected', lastConfirmedAt: '2026-03-20T10:00:00.000Z', errorCode: 'NONE', updatePending: true,
    instance: { instanceId: 'runtime-1', namespaceId: 'desktop', channel: 'stable', protocolVersion: 1, runtimeRevision: 'a'.repeat(64), startedAt: '2026-03-20T09:00:00.000Z' },
    installation: { kind: 'installed', label: 'Zyra Desktop', appVersion: '1.2.3' }
  });
  assert.equal(projectRuntimeStatus({ phase: 'ready' }), undefined, 'missing connection is unknown, never ready');
  assert.equal(projectRuntimeStatus(undefined), undefined);
});

test('phone connection health wins over a cached desktop status', () => {
  const configured = { phase: 'ready', connection: 'connected', installation: { kind: 'development', label: 'Development-test' } };
  const value = mobileRuntimeStatus({ phase: 'failed', connection: 'disconnected' }, configured);
  assert.equal(value.connection, 'disconnected');
  assert.equal(value.phase, 'failed');
  assert.equal(value.installation.label, 'Development-test');
  assert.equal(mobileRuntimeStatus(undefined, undefined), undefined);
  assert.equal(projectRuntimeStatus({ phase: 'idle', connection: 'unknown', installation: configured.installation }).connection, 'unknown');
});
