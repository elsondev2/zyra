import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CanonicalChatCatalog } from '../src/agent-server/catalog.mjs';

const directory = await mkdtemp(path.join(tmpdir(), 'zyra-catalog-locks-'));
const originalRename = fs.renameSync;
try {
  const catalog = new CanonicalChatCatalog({ stateDirectory: directory });
  catalog.registerProject(path.join(directory, 'first'));
  let attempts = 0;
  fs.renameSync = (...args) => {
    if (++attempts < 3) throw Object.assign(new Error('Fixture transient Windows file lock.'), { code: 'EPERM' });
    return originalRename(...args);
  };
  syncBuiltinESMExports();
  catalog.registerProject(path.join(directory, 'second'));
  assert.equal(attempts, 3, 'a short file lock retries the same atomic replacement');
  const saved = fs.readFileSync(catalog.paths.catalogFile, 'utf8');
  assert.equal(JSON.parse(saved).projects.length, 2, 'the complete catalog is persisted after the lock clears');

  for (const code of ['EPERM', 'ENOSPC']) {
    attempts = 0;
    const error = Object.assign(new Error('Fixture persistent write failure.'), { code });
    fs.renameSync = () => { attempts++; throw error; };
    syncBuiltinESMExports();
    assert.throws(() => catalog.registerProject(path.join(directory, code)), caught => caught === error);
    assert.equal(fs.readFileSync(catalog.paths.catalogFile, 'utf8'), saved, 'failed replacement preserves the last complete catalog');
    assert.equal(attempts, code === 'EPERM' ? 6 : 1, 'retries remain bounded and permanent failures propagate immediately');
  }
  console.log('Chat catalog file locks: atomic retry, bounded failure and preserved prior bytes passed.');
} finally {
  fs.renameSync = originalRename;
  syncBuiltinESMExports();
  await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
