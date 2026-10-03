import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ZyraAgentServer } from '../src/agent-server/server.mjs';
import { ZyraAgentServerClient } from '../src/agent-server/client.mjs';
import { ZyraExternalToolsClient, EXTERNAL_TOOL_METHODS } from '../src/agent-control/external-tools-client.mjs';

const directory = mkdtempSync(path.join(os.tmpdir(), 'zyra-external-tools-'));
const clients = [];
const options = { stateDirectory: directory, channel: 'fixture', endpoint: 0,
  desktopAuthorityToken: 'fixture-only-authority',
  externalTools: { createChat: async input => ({ canonicalChatId: `zyra_tools_${input.sourceSessionId}`, project: input.project }) },
  createWorker() { throw new Error('External control must never start a model worker'); } };
const server = new ZyraAgentServer(options);
const makeClient = extra => { const client = new ZyraAgentServerClient({ ...options, autoStart: false, verifyRuntimeRevision: false,
  requiredMethods: EXTERNAL_TOOL_METHODS, ...extra }); clients.push(client); return client; };
try {
  await server.start();
  const rawPi = makeClient({ surface: 'pi', clientId: 'pi:fixture' });
  const pi = new ZyraExternalToolsClient({ client: rawPi, project: directory, sourceSessionId: 'fixture-parent' });
  assert.equal((await pi.status()).available, false);
  await assert.rejects(() => pi.request({ operation: 'list_targets' }), { code: 'CONTROL_DRIVER_UNAVAILABLE' });
  const desktop = makeClient({ surface: 'desktop', clientId: 'desktop:fixture', authorities: ['desktop-control', 'desktop-workspace'], authorityProof: 'fixture-only-authority' });
  let held, cancelled = [], ended = [];
  desktop.on('control-cancel', message => cancelled.push(message));
  desktop.setDesktopWorkspaceTurnEndHandler((chatId, turnId) => ended.push({ chatId, turnId }));
  desktop.setControlHandler(async (operation, message) => {
    assert.equal(message.principal.type, 'root');
    assert.equal(message.principal.threadId, message.sessionKey);
    if (operation.operation === 'observe') {
      return { observation: { revision: 3 }, screenshot: { mimeType: 'image/png', data: Buffer.from('fixture-image').toString('base64') } };
    }
    if (operation.operation === 'act') return new Promise(resolve => { held = { resolve, message }; });
    return { targets: [{ targetId: 'chrome:fixture', kind: 'chrome-tab' }], grants: [] };
  });
  await desktop.connect();
  assert.equal((await pi.status()).available, true);
  const [first, second] = await Promise.all([pi.ensureSession(), pi.ensureSession()]);
  assert.equal(first.toolSessionId, second.toolSessionId, 'concurrent first calls share one identity');
  const result = await pi.request({ operation: 'list_targets' });
  assert.equal(result.targets[0].kind, 'chrome-tab');
  const observed = await pi.request({ operation: 'observe', targetId: 'chrome:fixture', grantId: 'grant:fixture' });
  assert.equal(Buffer.from(observed.screenshot.data, 'base64').toString(), 'fixture-image', 'image bytes survive the actual pipe');
  const stranger = makeClient({ surface: 'pi', clientId: 'pi:stranger' });
  await assert.rejects(() => stranger.request('tools.control', { toolSessionId: first.toolSessionId, operation: { operation: 'list_targets' } }), { code: 'CONTROL_PRINCIPAL_MISMATCH' });
  await assert.rejects(() => rawPi.request('tools.control', { toolSessionId: first.toolSessionId, operation: { operation: 'list_targets', principal: { type: 'root', threadId: 'other' } } }), { code: 'CONTROL_VALIDATION_ERROR' });
  await assert.rejects(() => pi.request({ operation: 'revoke_current_principal' }), { code: 'CONTROL_VALIDATION_ERROR' });
  const controller = new AbortController();
  const interrupted = pi.request({ operation: 'act' }, { signal: controller.signal, timeoutMs: 2_000 });
  while (!held) await new Promise(resolve => setTimeout(resolve, 5));
  controller.abort();
  await assert.rejects(interrupted, { code: 'CONTROL_CANCELLED' });
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(cancelled.length, 1, 'cancel reaches the actual driver');
  assert.equal(server.externalTools.sessions.size, 0, 'interruption removes the tool turn');
  held.resolve({ tooLate: true });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal((await pi.status()).available, true, 'late response does not crash or poison the connection');
  assert.equal(ended.length, 1, 'turn end asks Desktop to revoke only this principal');
  held = null;
  const timeout = pi.request({ operation: 'act' }, { timeoutMs: 100 });
  await assert.rejects(timeout, { code: 'CONTROL_TIMEOUT' });
  held.resolve({ tooLate: true });
  await pi.endTurn();
  const newSession = await pi.ensureSession();
  assert.notEqual(newSession.turnId, first.turnId);
  rawPi.close();
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(server.externalTools.sessions.size, 0, 'client disconnect drops grants and pending turns');
  assert.equal(server.utilityWorker, null);
  assert.equal(server.sessions.size, 0, 'external tools never attach a generation session');
  console.log('PASS external tools: pipe routing, authority, isolation, screenshots, cancellation, deadlines, late replies and cleanup');
} finally {
  for (const client of clients) client.close();
  await server.stop();
  rmSync(directory, { recursive: true, force: true });
}
