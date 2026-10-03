import assert from 'node:assert/strict';
import plugin from '../src/harness-config-plugin.mjs';
import { managedHarnessConfig } from '../src/opencode-harness.mjs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const native = { provider: { fixture: { options: { untouched: true } } }, permission: { read: 'deny' }, mcp: {
  remote: { type: 'remote', url: 'http://example.invalid', enabled: true },
  local: { type: 'local', command: ['fixture'], enabled: true },
  disabled: { type: 'local', command: ['other'], enabled: false },
} };
const original = structuredClone(native);
const hooks = await plugin();
await hooks.config(native);
assert.ok(Object.values(native.mcp).every(entry => entry.enabled === false));
for (const name of Object.keys(native.mcp)) assert.deepEqual({ ...native.mcp[name], enabled: original.mcp[name].enabled }, original.mcp[name]);
assert.deepEqual(native.provider, original.provider);
assert.deepEqual(native.permission, original.permission);
await hooks.config({});
const inline = { plugin: ['existing-plugin'], mcp: original.mcp };
const managed = managedHarnessConfig(JSON.stringify(inline));
assert.equal(managed.plugin[0], 'existing-plugin');
assert.equal(managed.plugin.at(-1), new URL('../src/harness-config-plugin.mjs', import.meta.url).href);
assert.deepEqual(managed.mcp, original.mcp, 'entries change only in the owned native process config hook');
const previousStandalone = process.env.ZYRA_STANDALONE, previousRoot = process.env.ZYRA_ROOT;
try {
  process.env.ZYRA_STANDALONE = '1'; process.env.ZYRA_ROOT = path.resolve('standalone fixture');
  assert.equal(managedHarnessConfig().plugin.at(-1), pathToFileURL(path.join(process.env.ZYRA_ROOT, 'src', 'harness-config-plugin.mjs')).href, 'standalone uses its extracted file, not the bundled virtual import URL');
} finally {
  if (previousStandalone === undefined) delete process.env.ZYRA_STANDALONE; else process.env.ZYRA_STANDALONE = previousStandalone;
  if (previousRoot === undefined) delete process.env.ZYRA_ROOT; else process.env.ZYRA_ROOT = previousRoot;
}
assert.ok(readFileSync(new URL('./build-tui-release.mjs', import.meta.url), 'utf8').includes('"src/harness-config-plugin.mjs"'), 'standalone distribution includes the native plugin file');
console.log('Owned native config hook disables duplicate MCP connections and preserves provider, permission and original configuration values.');
