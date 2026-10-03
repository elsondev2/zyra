import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir, cpus, totalmem } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { readRuntimeRevision } from '../src/agent-server/runtime-revision.mjs';

const beforeIndex = process.argv.indexOf('--before');
if (beforeIndex < 0) throw Error('Supply --before <saved runtime-revision.mjs> for paired measurement');
const before = (await import(pathToFileURL(path.resolve(process.argv[beforeIndex + 1])).href)).readRuntimeRevision;
const directory = await mkdtemp(path.join(tmpdir(), 'zyra-perf-revision-'));
const samples = { before: [], after: [] };
try {
  await mkdir(path.join(directory, 'src'));
  await writeFile(path.join(directory, 'package.json'), '{"type":"module","name":"synthetic-runtime"}');
  const files = 500, fileBytes = 8192, clients = 8;
  for (let i = 0; i < files; i++) await writeFile(path.join(directory, 'src', `module-${i}.mjs`), `${i}:` + 'a'.repeat(fileBytes - `${i}:`.length));
  const expected = await before(directory);
  for (let sample = -1; sample < 5; sample++) {
    for (const mode of sample % 2 ? ['after', 'before'] : ['before', 'after']) {
      global.gc?.();
      const memoryBefore = process.memoryUsage();
      const cpuBefore = process.cpuUsage();
      const start = performance.now();
      const reader = mode === 'before' ? before : readRuntimeRevision;
      const hashes = await Promise.all(Array.from({ length: clients }, () => reader(directory)));
      const wallMs = performance.now() - start;
      const cpu = process.cpuUsage(cpuBefore);
      const memoryAfter = process.memoryUsage();
      assert.deepEqual(hashes, Array(clients).fill(expected));
      if (sample >= 0) samples[mode].push({ wallMs, cpuMs: (cpu.user + cpu.system) / 1000, rssBefore: memoryBefore.rss, rssAfter: memoryAfter.rss, externalBefore: memoryBefore.external, externalAfter: memoryAfter.external });
    }
  }
  await writeFile(path.join(directory, 'src/module-0.mjs'), 'changed');
  const changed = await readRuntimeRevision(directory); assert.notEqual(changed, expected);
  await writeFile(path.join(directory, 'src/new.mjs'), 'added');
  const added = await readRuntimeRevision(directory); assert.notEqual(added, changed);
  await rm(path.join(directory, 'src/new.mjs'));
  assert.equal(await readRuntimeRevision(directory), changed);
  const missing = path.join(directory, 'missing');
  await mkdir(path.join(missing, 'src'), { recursive: true }); await writeFile(path.join(missing, 'src/a.mjs'), 'a');
  await assert.rejects(readRuntimeRevision(missing), /ENOENT/);
  await writeFile(path.join(missing, 'package.json'), '{}'); assert.ok(await readRuntimeRevision(missing));
  const report = { environment: { node: process.version, cpu: cpus()[0]?.model, totalMemoryBytes: totalmem() }, protocol: { files, fileBytes, clients, samples: 5, warmups: 1, alternatingOrder: true, workload: 'Concurrent runtime fingerprints, generated temporary tree; warm filesystem cache; connection prerequisite only' }, samples, correctness: { identicalHash: true, sourceEdits: true, addedAndDeletedFiles: true, retryAfterFailure: true } };
  const outputIndex = process.argv.indexOf('--output');
  if (outputIndex >= 0) await writeFile(path.resolve(process.argv[outputIndex + 1]), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('zyra-perf-revision-')) throw Error('Unexpected cleanup path');
  await rm(directory, { recursive: true, force: true });
}
