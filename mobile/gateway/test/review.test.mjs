import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { HostRouter, isRead } from '../src/router.mjs';
import { BodyCache } from '../src/projection.mjs';
import { singleFilePatch } from '../src/review.mjs';

async function fixture(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'zyra-review-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const folder = path.join(dir, 'work'), privateFolder = path.join(dir, 'private');
  await mkdir(folder); await mkdir(privateFolder); await writeFile(path.join(folder, 'a.md'), 'new');
  await writeFile(path.join(privateFolder, 'secret.md'), 'private');
  await symlink(privateFolder, path.join(folder, 'escape'), 'junction');
  const change = (filePath, activityId = 'write') => ({ filePath, activityId, changeKind: 'update', additions: 1, deletions: 1, authoritative: true, status: 'completed' });
  const index = { turns: [{ id: 't2', number: 2, state: 'completed', prompt: { text: 'Update the guide' }, response: { text: 'Updated' }, changes: [
    change(path.join(folder, 'a.md')), change(path.join(folder, 'removed.md'), 'delete'), change(path.join(privateFolder, 'secret.md')),
    change(path.join(folder, 'escape', 'secret.md')), change(path.join(folder, 'escape', 'removed.md')),
    { ...change(path.join(folder, 'renamed.md')), previousPath: path.join(privateFolder, 'old.md') }
  ] }, { id: 't1', number: 1, state: 'completed', changes: [] }] };
  let details = 0, reads = 0;
  const detail = { messages: [{ id: 'm', role: 'assistant', text: 'Updated the guide' }, { role: 'system', text: 'internal' }],
    activities: [{ id: 'write', changes: [{ path: path.join(folder, 'a.md'), diff: '@@ -1 +1 @@\n-old\n+new' }] },
      { id: 'delete', changes: [{ path: path.join(folder, 'removed.md'), diff: '@@ -1 +0,0 @@\n-deleted' }] }] };
  const review = { index: async canonical => { assert.equal(canonical, 'chat'); reads++; return index; }, turn: async (canonical, turn) => { assert.equal(canonical, 'chat'); assert.equal(turn, 't2'); details++; return detail; } };
  const router = new HostRouter({ owner: 'phone', cache: new BodyCache(), projects: [folder],
    client: { request: async (_method, params) => ({ chat: { canonicalChatId: params.session, project: params.session === 'chat' ? folder : privateFolder } }) },
    review, resolveScope: async () => ({ roots: [{ path: folder }] }) });
  return { router, index, detail, dir, folder, get details() { return details; }, get reads() { return reads; } };
}

test('review pages use canonical turn metadata, lazy detail and scoped relative file paths', async t => {
  const f = await fixture(t);
  const first = await f.router.dispatch('review.list', { session: 'chat', limit: 1 });
  assert.equal(first.turns[0].id, 't2'); assert.equal(first.nextCursor, 't2'); assert.equal(first.totalTurns, 2);
  assert.deepEqual(first.turns[0].changes.map(change => change.path), ['a.md', 'removed.md']);
  assert.equal(JSON.stringify(first).includes(f.dir), false); assert.equal(f.details, 0);
  const second = await f.router.dispatch('review.list', { session: 'chat', before: 't2' });
  assert.equal(second.turns[0].id, 't1'); assert.equal(second.nextCursor, null);
  f.detail.messages.unshift({ id: 'u', role: 'user', text: 'The prompt' }, { id: 'progress', role: 'assistant', text: 'Intermediate commentary' });
  const turn = await f.router.dispatch('review.turn', { session: 'chat', turnId: 't2' });
  assert.equal(turn.messages.length, 2); assert.equal(f.details, 1);
  assert.deepEqual(turn.messages.map(message => message.id), ['u', 'm']);
  const file = first.turns[0].changes[0];
  const diff = await f.router.dispatch('review.diff', { session: 'chat', turnId: 't2', ...file });
  assert.match(diff.patch, /-old\n\+new/); assert.equal(diff.patch.includes(f.folder), false);
  const deleted = await f.router.dispatch('review.diff', { session: 'chat', turnId: 't2', ...first.turns[0].changes[1] });
  assert.match(deleted.patch, /-deleted/);
  for (const method of ['review.list', 'review.turn', 'review.diff']) assert.equal(isRead(method), true);
});

test('review denies hidden chats, cross-turn IDs and unavailable file selectors before hydrating output', async t => {
  const f = await fixture(t);
  await assert.rejects(f.router.dispatch('review.list', { session: 'private' }), { code: 'CHAT_NOT_VISIBLE' });
  assert.equal(f.reads, 0);
  await assert.rejects(f.router.dispatch('review.turn', { session: 'chat', turnId: 'private-turn' }));
  await assert.rejects(f.router.dispatch('review.diff', { session: 'chat', turnId: 't2', activityId: 'write', rootId: 'unknown', path: '../private/secret.md' }));
  await assert.rejects(f.router.dispatch('review.list', { session: 'chat', before: 'missing' }));
  assert.equal(f.details, 0);
});

test('shared patches expose only the chosen file hunks with safe rebuilt headers', () => {
  const multi = 'diff --git a/shared.md b/shared.md\n--- a/shared.md\n+++ b/shared.md\n@@ -1 +1 @@\n-old\n+new\ndiff --git a/private.md b/private.md\n--- a/private.md\n+++ b/private.md\n@@ -1 +1 @@\n-secret\n+private';
  const patch = singleFilePatch(multi, ['shared.md'], 'shared.md');
  assert.match(patch, /\+new/); assert.equal(patch.includes('private'), false);
  assert.equal(singleFilePatch(multi, ['absent.md'], 'absent.md'), '');
  assert.equal(singleFilePatch('@@ -1 +1 @@\n-old\n+new', ['a'], 'a'), '');
  assert.equal(singleFilePatch('@@\n-old\n+new\n*** Delete File: /private/a', ['a'], 'a', undefined, true), '');
});

test('nested excluded projects and access changes during detail hydration remain hidden', async t => {
  const f = await fixture(t);
  const hidden = path.join(f.folder, 'excluded'); await mkdir(hidden); await writeFile(path.join(hidden, 'private.md'), 'private');
  f.router.hiddenProjects = [hidden];
  f.index.turns[0].changes.push({ activityId: 'hidden', filePath: path.join(hidden, 'private.md'), authoritative: true });
  const { turns } = await f.router.dispatch('review.list', { session: 'chat' });
  assert.equal(turns[0].changes.some(change => change.path.includes('excluded')), false);
  f.router.review.turn = async () => { f.router.files.roots = async () => []; return f.detail; };
  await assert.rejects(f.router.dispatch('review.diff', { session: 'chat', turnId: 't2', ...turns[0].changes[0] }), /no longer available/);
});

test('large patch is explicitly bounded and transferred through owner-scoped bodies', async t => {
  const f = await fixture(t);
  f.detail.activities[0].changes[0].diff = '@@ -1 +1 @@\n-old\n+' + 'x'.repeat(600000);
  const { turns } = await f.router.dispatch('review.list', { session: 'chat' });
  const result = await f.router.dispatch('review.diff', { session: 'chat', turnId: 't2', ...turns[0].changes[0] });
  assert.ok(result.deferred);
  const body = f.router.cache.items.get(result.deferred.bodyId).data;
  const diff = JSON.parse(body.toString());
  assert.equal(diff.truncated, true); assert.ok(Buffer.byteLength(diff.patch) <= 512 * 1024);
  assert.throws(() => f.router.cache.chunk('other-phone', result.deferred.bodyId));
});

test('relative review changes use the attached working folder instead of the internal project home', async t => {
  const f = await fixture(t);
  const home = path.join(f.dir, 'project-home'); await mkdir(home);
  f.router.projects.push(home);
  f.router.client.request = async () => ({ chat: { canonicalChatId: 'chat', project: home } });
  f.router.files.resolveScope = async () => ({ workingRoot: f.folder, roots: [{ path: home }, { path: f.folder }] });
  f.index.turns[0].changes[0].filePath = 'a.md';
  const { turns } = await f.router.dispatch('review.list', { session: 'chat' });
  const change = turns[0].changes.find(change => change.path === 'a.md');
  assert.ok(change);
  const diff = await f.router.dispatch('review.diff', { session: 'chat', turnId: 't2', ...change });
  assert.match(diff.patch, /\+new/);
});
