import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { realpathSync, existsSync } from 'node:fs';

const home = os.homedir();
const packageRoot = process.argv[2] || path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@earendil-works', 'pi-coding-agent');
const sdk = await import(pathToFileURL(path.join(packageRoot, 'dist/bundle/index.js')).href);
const extensionPath = path.join(home, '.pi/agent/extensions/zyra-tools/index.ts');
const notifierPath = path.join(home, '.pi/agent/extensions/windows-notify.ts');
const paths = existsSync(notifierPath) ? [extensionPath, notifierPath] : [extensionPath];
const loaded = await sdk.discoverAndLoadExtensions(paths, process.cwd(), path.join(os.tmpdir(), 'zyra-isolated-pi-extension-discovery'));
assert.deepEqual(loaded.errors, []);
assert.equal(loaded.extensions.length, paths.length);
const tools = loaded.extensions[0].tools;
assert.equal(tools.size, 26);
assert(tools.has('browser_use') && tools.has('zyra_tool_search') && tools.has('full_send_notify'));
const skills = sdk.loadSkills({ cwd: process.cwd(), agentDir: path.join(home, '.pi/agent'), includeDefaults: true, skillPaths: [] });
const { listZyraPromptResourceManifest } = await import('../src/zyra-prompt-resources.mjs');
const zyraManifest = await listZyraPromptResourceManifest({ root: process.cwd(), home, project: process.cwd(), projectTrusted: true });
for (const name of ['full-send', 'zyra-tools']) {
  assert(skills.skills.some(skill => skill.name === name), `Pi discovers ${name}`);
  assert(zyraManifest.skills.some(skill => skill.name === name), `Zyra discovers ${name}`);
  for (const base of ['.agents/skills', '.codex/skills', '.pi/agent/skills', '.zyra/skills']) {
    const file = path.join(home, base, name, 'SKILL.md');
    assert(existsSync(file));
    assert.equal(realpathSync(file), realpathSync(path.join(process.cwd(), 'skills', name, 'SKILL.md')));
  }
}
console.log('PASS installed Pi loader: 26 tools, both skills, shared canonical files, no model/provider calls');
