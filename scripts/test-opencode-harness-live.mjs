/**
 * Manual live gate for the OpenCode harness pipe. NEVER runs in CI or the
 * check runner: it requires ZYRA_LIVE_HARNESS=1 and spends the user's own
 * OpenCode account quota (use a free model). It starts a Zyra-owned serve
 * on loopback, sends one tiny text turn with tools disabled, verifies the
 * reply shape, then deletes the session and stops the server.
 *
 *   ZYRA_LIVE_HARNESS=1 ZYRA_LIVE_HARNESS_MODEL=opencode/big-pickle node scripts/test-opencode-harness-live.mjs
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { detectHarness, ensureHarnessServe, runHarnessTextTurn, stopHarnessServe } from '../src/opencode-harness.mjs';

if (process.env.ZYRA_LIVE_HARNESS !== '1') {
  console.log('Live harness check skipped. Set ZYRA_LIVE_HARNESS=1 to run it explicitly.');
  process.exit(0);
}
const modelId = String(process.env.ZYRA_LIVE_HARNESS_MODEL ?? 'opencode/big-pickle');
const root = await mkdtemp(path.join(tmpdir(), 'zyra-harness-live-'));
const cwd = path.join(root, 'project');
const { mkdir } = await import('node:fs/promises');
await mkdir(cwd, { recursive: true });
try {
  const detected = await detectHarness();
  assert.ok(detected, 'OpenCode must be installed for the live check.');
  console.log(`Harness binary: ${detected.executable} (${detected.version})`);
  const lease = await ensureHarnessServe({ cwd, executable: detected.executable });
  try {
    const reply = await runHarnessTextTurn({
      client: { ...lease.client, fetch },
      modelId,
      context: { messages: [{ role: 'user', content: 'Reply with exactly: OK' }] },
    });
    console.log(`Reply text: ${JSON.stringify(reply.text.slice(0, 200))}`);
    console.log(`Usage: ${JSON.stringify(reply.usage)}`);
    assert.ok(reply.text.trim().length > 0, 'The harness returned empty text.');
  } finally {
    try { lease.release(); } catch { /* Ignore release failures. */ }
  }
  console.log('Live harness turn passed.');
} finally {
  await stopHarnessServe().catch(() => {});
  await rm(root, { recursive: true, force: true });
}
