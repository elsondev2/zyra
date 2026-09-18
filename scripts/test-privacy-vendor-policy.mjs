import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { localPrivacyExemption } from './privacy-vendor-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vendors = [
  'mobile/android/app/src/main/assets/mermaid/mermaid.min.js',
  'mobile/android/svg/src/main/java/com/caverock/androidsvg/SVGAndroidRenderer.java',
];
const license = 'extensions/zyra-browser-control/assets/LICENSES.txt';

test('Mermaid vendor path is pinned to LF while desktop remains export-ignored', () => {
  const attributes = readFileSync(path.join(root, '.gitattributes'), 'utf8')
    .split(/\r?\n/).filter(Boolean);
  assert.ok(attributes.includes('/desktop export-ignore'));
  assert.ok(attributes.includes(`${vendors[0]} eol=lf`));
  assert.ok(attributes.includes(`${vendors[1]} eol=crlf`));
  assert.ok(attributes.includes('desktop/src/renderer/src/assets/plugin-logos/*.svg eol=lf'));
});

test('only the two exact pristine upstream artifacts receive local-rule exemptions', () => {
  for (const file of vendors) {
    const bytes = readFileSync(path.join(root, file));
    assert.equal(localPrivacyExemption(file, bytes)(1, 'anything'), true);
    assert.equal(localPrivacyExemption(file, Buffer.concat([bytes, Buffer.from('\n')]))(1, 'anything'), false);
    assert.equal(localPrivacyExemption('somewhere-else/vendor.js', bytes)(1, 'anything'), false);
  }
});

test('license exemption covers the exact attribution line only', () => {
  const bytes = readFileSync(path.join(root, license));
  const line = bytes.toString('utf8').split(/\r?\n/)[2];
  const exempt = localPrivacyExemption(license, bytes);
  assert.equal(exempt(3, line), true);
  assert.equal(exempt(2, line), false);
  assert.equal(exempt(4, line), false);
  assert.equal(exempt(3, line + ' changed'), false);
  assert.equal(localPrivacyExemption('other/LICENSE.txt', bytes)(3, line), false);
});

function fixture(run) {
  const directory = mkdtempSync(path.join(tmpdir(), 'zyra-privacy-policy-'));
  const resolved = realpathSync(directory);
  try {
    mkdirSync(path.join(directory, 'scripts'));
    mkdirSync(path.join(directory, '.zyra'));
    writeFileSync(path.join(directory, '.gitignore'), '.zyra/\n');
    writeFileSync(path.join(directory, '.zyra/privacy-patterns.json'), JSON.stringify({ checks: [{ label: 'fixture phrase', pattern: 'synthetic-local-marker' }] }));
    for (const name of ['privacy-check.mjs', 'privacy-vendor-policy.mjs']) copyFileSync(path.join(root, 'scripts', name), path.join(directory, 'scripts', name));
    const init = spawnSync('git', ['init', '--quiet'], { cwd: directory, encoding: 'utf8' });
    assert.equal(init.status, 0);
    return run(directory);
  } finally {
    const relative = path.relative(realpathSync(tmpdir()), resolved);
    assert.ok(relative.startsWith('zyra-privacy-policy-') && !relative.includes(path.sep));
    rmSync(resolved, { recursive: true, force: true });
  }
}
function scan(directory) {
  const result = spawnSync(process.execPath, ['scripts/privacy-check.mjs'], { cwd: directory, encoding: 'utf8' });
  return { status: result.status, output: result.stdout + result.stderr };
}
function put(directory, file, text) {
  mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
  writeFileSync(path.join(directory, file), text);
}

test('the real scanner keeps generic checks active on pristine exempt vendor and attribution lines', () => fixture(directory => {
  const specimens = [...vendors.map(file => ({ file, line: 1 })), { file: license, line: 3 }];
  const prefixes = specimens.map(({ file, line }) => {
    const bytes = readFileSync(path.join(root, file));
    put(directory, file, bytes);
    return bytes.toString('utf8').split(/\r?\n/)[line - 1].slice(0, 48).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  });
  const scanner = path.join(directory, 'scripts/privacy-check.mjs');
  writeFileSync(scanner, readFileSync(scanner, 'utf8').replace('const genericChecks = [',
    'const genericChecks = [{ label: "synthetic generic", pattern: new RegExp(' + JSON.stringify('^(?:' + prefixes.join('|') + ')') + ') },'));
  writeFileSync(path.join(directory, '.zyra/privacy-patterns.json'), JSON.stringify({ checks: [{ label: 'fixture phrase', pattern: '.' }] }));
  const result = scan(directory);
  assert.equal(result.status, 1);
  for (const { file, line } of specimens) {
    assert.ok(result.output.includes(`${file}:${line} [synthetic generic]`));
    assert.ok(!result.output.includes(`${file}:${line} [fixture phrase]`));
  }
}));

test('the real scanner still detects generic credentials and private paths in vendor paths', () => fixture(directory => {
  // Construct synthetic tokens so this regression source does not itself
  // contain a token-shaped literal or a private absolute home path.
  const key = ['gh', 'p_', 'A'.repeat(24)].join('');
  const home = ['C:', 'Users', 'fixture-account', 'document.txt'].join('\\');
  put(directory, vendors[0], key + '\n' + home);
  const result = scan(directory);
  assert.equal(result.status, 1);
  assert.match(result.output, /GitHub access token/);
  assert.match(result.output, /absolute Windows user path/);
}));

test('modified vendor files and unrelated license lines still receive local checks', () => fixture(directory => {
  put(directory, vendors[1], Buffer.concat([readFileSync(path.join(root, vendors[1])), Buffer.from('\nsynthetic-local-marker\n')]));
  const lines = readFileSync(path.join(root, license), 'utf8').split(/\r?\n/);
  lines.push('synthetic-local-marker');
  put(directory, license, lines.join('\n'));
  const result = scan(directory);
  assert.equal(result.status, 1);
  assert.match(result.output, /SVGAndroidRenderer\.java:\d+ \[fixture phrase\]/);
  assert.match(result.output, /LICENSES\.txt:\d+ \[fixture phrase\]/);
}));
