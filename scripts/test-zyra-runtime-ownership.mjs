import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const forbidden = /@(?:earendil-works|mariozechner)\/pi-(?:coding-agent|agent-core|ai|tui|client|protocol|telemetry)/;
for (const file of ['package.json', 'package-lock.json', 'bun.lock', 'desktop/package.json', 'desktop/package-lock.json']) {
  const source = await readFile(path.join(root, file), 'utf8');
  assert.doesNotMatch(source, forbidden, `${file} must not install or lock a Pi package`);
}
for (const directory of ['src', 'bin', 'desktop/src']) {
  const files = await readdir(path.join(root, directory), { recursive: true });
  for (const file of files.filter(file => /\.(?:m?js|cjs|tsx?)$/.test(file))) {
    const source = await readFile(path.join(root, directory, file), 'utf8');
    assert.doesNotMatch(source, /(?:from\s*|import\s*\(|require\s*\(|resolve\s*\()\s*['"][^'"]*@(?:earendil-works|mariozechner)\/pi-/, `${directory}/${file} cannot load external Pi code`);
  }
}
const engine = await import('../src/runtime/engine/src/index.js');
const provider = await import('../src/runtime/providers/src/index.js');
const agent = await import('../src/runtime/agent/src/index.js');
const terminal = await import('../src/runtime/terminal/src/index.js');
assert.equal(typeof engine.createAgentSession, 'function');
assert.equal(typeof engine.ModelRuntime.create, 'function');
assert.equal(typeof provider.createModels, 'function');
assert.equal(typeof agent.runAgentLoop, 'function');
assert.equal(typeof terminal.Container, 'function');
assert.ok(engine.getAgentDir().replaceAll('\\', '/').includes('/.zyra/'), 'runtime defaults must belong to Zyra');
const config = await import('../src/runtime/engine/src/config.js');
assert.equal(config.APP_NAME, 'zyra');
console.log('Zyra runtime ownership: local engine, transports, loop, terminal and zero Pi package imports/locks: ok');
