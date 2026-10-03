import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readRuntimeRevision } from '../src/agent-server/runtime-revision.mjs';

const directory = await mkdtemp(path.join(tmpdir(), 'zyra-revision-contract-'));
try {
  const roots = [path.join(directory, 'first'), path.join(directory, 'second')];
  for (const [index, root] of roots.entries()) {
    await mkdir(path.join(root, 'src'), { recursive: true });
    await writeFile(path.join(root, 'package.json'), '{}');
    await writeFile(path.join(root, 'src/runtime.mjs'), `export const value=${index};`);
  }
  const [first, second, ...concurrent] = await Promise.all([readRuntimeRevision(roots[0]), readRuntimeRevision(roots[1]), ...Array.from({ length: 8 }, () => readRuntimeRevision(roots[0]))]);
  assert.notEqual(first, second, 'different runtime roots are isolated');
  assert.deepEqual(concurrent, Array(8).fill(first));
  await writeFile(path.join(roots[0], 'src/runtime.mjs'), 'export const value=2;');
  const changed = await readRuntimeRevision(roots[0]); assert.notEqual(changed, first);
  await writeFile(path.join(roots[0], 'src/extra.mjs'), 'extra');
  assert.notEqual(await readRuntimeRevision(roots[0]), changed);
  await rm(path.join(roots[0], 'src/extra.mjs')); assert.equal(await readRuntimeRevision(roots[0]), changed);
  await assert.rejects(readRuntimeRevision(null), TypeError, 'invalid input preserves the async error contract');
  await rm(path.join(roots[0], 'package.json'));
  await assert.rejects(readRuntimeRevision(roots[0]), /ENOENT/);
  await writeFile(path.join(roots[0], 'package.json'), '{}'); assert.equal(await readRuntimeRevision(roots[0]), changed, 'failed check can retry');
  console.log('Runtime revision: concurrent readers, distinct roots, fresh changes and failed retry passed');
} finally {
  if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('zyra-revision-contract-')) throw Error('Unexpected cleanup path');
  await rm(directory, { recursive: true, force: true });
}
