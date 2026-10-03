import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isolateBridgeEnvironment } from './fixtures/agent-server-bridge-env.mjs';

const directory = await mkdtemp(path.join(tmpdir(), 'zyra-engine-imports-'));
const isolation = isolateBridgeEnvironment(directory);
let publicEntryLoaded = false;
let extensionCompilerLoaded = false;
const hooks = registerHooks({ load(url, context, nextLoad) {
  if (url.endsWith('/runtime/engine/src/index.js')) publicEntryLoaded = true;
  if (url.includes('/node_modules/jiti/')) extensionCompilerLoaded = true;
  return nextLoad(url, context);
} });
try {
  const core = await import('../src/zyra-session-engine.mjs');
  await import('../src/zyra-runtime.mjs');
  assert.equal(publicEntryLoaded, false, 'core services must not initialize the public CLI/terminal entry');
  assert.equal(extensionCompilerLoaded, false, 'normal sessions do not load the extension compiler');
  const full = await import('../src/runtime/engine/src/index.js');
  for (const [name, value] of Object.entries(core)) assert.equal(value, full[name], `${name} retains the exact engine implementation`);
  const { VIRTUAL_MODULES } = await import('../src/runtime/engine/src/core/extensions/virtual-modules.js');
  assert.equal(VIRTUAL_MODULES['@zyra/engine'], full);
  assert.equal(VIRTUAL_MODULES['@earendil-works/pi-coding-agent'], full);
  assert.equal(VIRTUAL_MODULES['@mariozechner/pi-coding-agent'], full);
  assert.equal(VIRTUAL_MODULES['@zyra/terminal'], VIRTUAL_MODULES['@mariozechner/pi-tui']);
  assert.equal(VIRTUAL_MODULES.typebox, VIRTUAL_MODULES['@sinclair/typebox']);
  isolation.assertOffline();
  console.log('Session imports exclude the public engine, preserve core export identities and retain bundled extension aliases.');
} finally {
  hooks.deregister(); isolation.restore();
  await rm(directory, { recursive: true, force: true });
}
