import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listZyraPromptResourceManifest } from '../src/zyra-prompt-resources.mjs';
import { getRuntimeSourceDirectories } from '../desktop/scripts/release/runtime-contract.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const home = await mkdtemp(path.join(os.tmpdir(), 'zyra-visualize-skill-'));
try {
  const manifest = await listZyraPromptResourceManifest({ root, home });
  const skill = manifest.skills.find(skill => skill.name === 'visualize');
  assert.ok(skill, 'built-in skill is discovered without a project or user command');
  assert.equal(skill.scope, 'built-in');
  assert.equal(skill.disableModelInvocation, false);
  assert.match(skill.description, /proactively/);
  assert.ok((await getRuntimeSourceDirectories(root)).includes('skills'));
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.ok(pkg.files.includes('skills'), 'npm distribution includes the skill');
  console.log('Visualization skill: automatic discovery and both distribution paths passed');
} finally { await rm(home, { recursive: true, force: true }); }
