import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { WorkspaceFiles } from '../src/workspace-files.mjs';
import { HostRouter, isRead } from '../src/router.mjs';

test('file links resolve attached roots, line references and folders without exposing host paths', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zyra-file-link-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const home = path.join(dir, 'home'), folder = path.join(dir, 'work');
  await mkdir(home); await mkdir(folder); await mkdir(path.join(folder, 'src'));
  const filename = path.join(folder, 'src', 'hello world.kt'); await writeFile(filename, 'first\nsecond\nthird');
  await writeFile(path.join(dir, 'private.txt'), 'private');
  let visible = true;
  const files = new WorkspaceFiles({ allProjects: true, allowsProject: () => visible,
    resolveScope: async () => ({ workingRoot: folder, roots: [{ path: home, kind: 'project-home' }, { path: folder, kind: 'associated-folder' }] }) });
  const chat = { canonicalChatId: 'chat', project: home };
  const resolve = destination => files.dispatch('workspace.link', { destination }, chat);
  const link = await resolve('src/hello%20world.kt:2:4');
  assert.equal(link.path, 'src/hello world.kt'); assert.equal(link.line, 2); assert.equal(link.directory, false);
  assert.equal(JSON.stringify(link).includes(dir), false);
  assert.equal((await resolve(pathToFileURL(filename).href + '#L3C1')).line, 3);
  assert.equal((await resolve(filename + ':2')).rootId, link.rootId);
  assert.equal((await resolve('src')).directory, true);
  for (const destination of ['../private.txt', path.join(dir, 'private.txt'), 'https://example.com/a', 'file://remote/share/a', '#local-heading', 'javascript:alert(1)', '%00', '%2f%2fremote/share/a']) {
    await assert.rejects(resolve(destination));
  }
  await symlink(dir, path.join(folder, 'escape'), 'junction');
  await assert.rejects(resolve('escape/private.txt'));
  visible = false; await assert.rejects(resolve('src/hello%20world.kt'));
});

test('file-link resolution requires canonical chat visibility', async () => {
  assert.equal(isRead('workspace.link'), true);
  const router = new HostRouter({ owner: 'phone', client: { request: async () => ({ chat: { canonicalChatId: 'hidden', project: '/private' } }) }, cache: {} });
  await assert.rejects(router.dispatch('workspace.link', { session: 'hidden', destination: '/private/data' }), { code: 'CHAT_NOT_VISIBLE' });
});
