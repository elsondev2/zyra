import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, lstat, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WorkspaceFiles, WORKSPACE_METHODS, WORKSPACE_READS } from '../src/workspace-files.mjs';
import { HostRouter, isRead } from '../src/router.mjs';

async function fixture(t) {
  const base = await mkdtemp(path.join(tmpdir(), 'zyra-move-test-'));
  assert.equal(path.dirname(base), path.resolve(tmpdir()));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = path.join(base, 'project'), hidden = path.join(root, 'private'), outside = path.join(base, 'outside');
  for (const folder of [root, hidden, outside, path.join(root, 'docs')]) await mkdir(folder);
  await writeFile(path.join(root, 'source.txt'), Buffer.from('Exact\r\ncontent\0binary'));
  await writeFile(path.join(hidden, 'secret.txt'), 'private');
  const hiddenProjects = [hidden];
  let access = 'read-write';
  const files = new WorkspaceFiles({ projects: [root], hiddenProjects, resolveScope: async () => ({ roots: [{ path: root, access }] }) });
  const chat = { canonicalChatId: 'chat', project: root };
  const [{ id: rootId }] = await files.roots(chat);
  const dispatch = (method, params = {}) => files.dispatch(method, { rootId, ...params }, chat);
  const etag = (await dispatch('workspace.file.read', { path: 'source.txt' })).etag;
  return { base, root, hidden, outside, hiddenProjects, files, chat, rootId, etag, dispatch, access: value => { access = value; } };
}

test('same-root moves preserve exact bytes and metadata and never become read-only operations', async t => {
  const f = await fixture(t), before = await readFile(path.join(f.root, 'source.txt'));
  assert.ok(WORKSPACE_METHODS.has('workspace.move'));
  assert.ok(!WORKSPACE_READS.has('workspace.move'));
  assert.equal(isRead('workspace.move'), false);
  const result = await f.dispatch('workspace.move', { path: 'source.txt', destination: 'docs/moved.txt', etag: f.etag });
  assert.deepEqual(result, { moved: true, rootId: f.rootId, path: 'docs/moved.txt', name: 'moved.txt', size: before.length, etag: f.etag });
  assert.deepEqual(await readFile(path.join(f.root, result.path)), before);
  await assert.rejects(lstat(path.join(f.root, 'source.txt')), { code: 'ENOENT' });
});

test('stale etags, occupied names and folders leave every original intact', async t => {
  const f = await fixture(t);
  await assert.rejects(f.dispatch('workspace.move', { path: 'source.txt', destination: 'docs/new.txt', etag: 'stale' }), { code: 'FILE_CONFLICT' });
  await writeFile(path.join(f.root, 'docs/existing.txt'), 'existing');
  for (const destination of ['docs/existing.txt', 'docs', 'source.txt']) {
    await assert.rejects(f.dispatch('workspace.move', { path: 'source.txt', destination, etag: f.etag }), { code: 'FILE_EXISTS' });
  }
  await assert.rejects(f.dispatch('workspace.move', { path: 'docs', destination: 'moved-directory', etag: f.etag }));
  assert.equal(await readFile(path.join(f.root, 'docs/existing.txt'), 'utf8'), 'existing');
  assert.ok((await lstat(path.join(f.root, 'source.txt'))).isFile());
  await assert.rejects(lstat(path.join(f.root, 'docs/new.txt')), { code: 'ENOENT' });
});

test('both source and destination honor hidden projects, roots, read-only scope and traversal', async t => {
  const f = await fixture(t);
  for (const source of ['private/secret.txt', '../outside/file.txt']) {
    await assert.rejects(f.dispatch('workspace.move', { path: source, destination: 'docs/new.txt', etag: f.etag }));
  }
  for (const destination of ['private/new.txt', '../outside/new.txt', 'docs/../../outside/new.txt', '..\\outside\\new.txt',
    path.join(f.outside, 'absolute.txt'), 'C:escape', 'docs/new.txt:stream', 'docs/NUL', 'docs/trailing.', 'missing/new.txt']) {
    await assert.rejects(f.dispatch('workspace.move', { path: 'source.txt', destination, etag: f.etag }));
  }
  f.access('read-only');
  await assert.rejects(f.dispatch('workspace.move', { path: 'source.txt', destination: 'docs/new.txt', etag: f.etag }), /read-only/);
  assert.equal(await readFile(path.join(f.hidden, 'secret.txt'), 'utf8'), 'private');
  assert.ok((await lstat(path.join(f.root, 'source.txt'))).isFile());
});

test('directory aliases cannot move hidden, outside or even visible linked paths', async t => {
  const f = await fixture(t);
  for (const [name, target] of [['hidden-alias', f.hidden], ['outside-alias', f.outside], ['docs-alias', path.join(f.root, 'docs')]]) {
    await symlink(target, path.join(f.root, name), 'junction');
  }
  await writeFile(path.join(f.root, 'docs/public.txt'), 'public');
  for (const destination of ['hidden-alias/new.txt', 'outside-alias/new.txt', 'docs-alias/new.txt']) {
    await assert.rejects(f.dispatch('workspace.move', { path: 'source.txt', destination, etag: f.etag }));
  }
  for (const source of ['hidden-alias/secret.txt', 'docs-alias/public.txt']) {
    await assert.rejects(f.dispatch('workspace.move', { path: source, destination: 'docs/new.txt', etag: f.etag }));
  }
  assert.equal(await readFile(path.join(f.root, 'docs/public.txt'), 'utf8'), 'public');
});

test('scope is checked again after queued writes and competing moves cannot overwrite', async t => {
  const f = await fixture(t);
  let release;
  const lock = new Promise(resolve => { release = resolve; });
  f.files.writes.set(path.join(f.root, 'source.txt'), lock);
  const blocked = f.dispatch('workspace.move', { path: 'source.txt', destination: 'docs/new.txt', etag: f.etag });
  for (let attempt = 0; f.files.writes.get(path.join(f.root, 'source.txt')) === lock && attempt < 200; attempt++) {
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.notEqual(f.files.writes.get(path.join(f.root, 'source.txt')), lock, 'move must be queued before scope changes');
  f.hiddenProjects.push(path.join(f.root, 'docs'));
  release();
  await assert.rejects(blocked);
  assert.ok((await lstat(path.join(f.root, 'source.txt'))).isFile());
  f.hiddenProjects.pop();
  await writeFile(path.join(f.root, 'second.txt'), 'second');
  const second = await f.dispatch('workspace.file.read', { path: 'second.txt' });
  const results = await Promise.allSettled([
    f.dispatch('workspace.move', { path: 'source.txt', destination: 'docs/winner.txt', etag: f.etag }),
    f.dispatch('workspace.move', { path: 'second.txt', destination: 'docs/winner.txt', etag: second.etag }),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'FILE_EXISTS');
  const losingSource = results[0].status === 'rejected' ? 'source.txt' : 'second.txt';
  assert.ok((await lstat(path.join(f.root, losingSource))).isFile());
});

test('router asserts the chat and forwards per-device exclusions for moves', async t => {
  const f = await fixture(t);
  const router = new HostRouter({ owner: 'phone', projects: [f.root], hiddenProjects: f.hiddenProjects,
    cache: { project: (_, result) => result }, client: { request: async () => ({ chat: f.chat }) } });
  await assert.rejects(router.dispatch('workspace.move', { session: 'chat', rootId: f.rootId, path: 'source.txt', destination: 'private/new.txt', etag: f.etag }));
  const moved = await router.dispatch('workspace.move', { session: 'chat', rootId: f.rootId, path: 'source.txt', destination: 'docs/ok.txt', etag: f.etag });
  assert.equal(moved.path, 'docs/ok.txt');
});
