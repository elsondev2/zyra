import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WorkspaceFiles } from '../src/workspace-files.mjs';

async function setup(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'zyra-markdown-context-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const first = path.join(dir, 'first'), second = path.join(dir, 'second'), outside = path.join(dir, 'private');
  await mkdir(first); await mkdir(second); await mkdir(outside); await mkdir(path.join(second, 'docs'));
  await writeFile(path.join(first, 'guide.md'), 'First root');
  await writeFile(path.join(second, 'guide.md'), 'Second root');
  await writeFile(path.join(second, 'docs', 'chapter.md'), 'Nested document');
  const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(64, 4)]);
  await writeFile(path.join(second, 'docs', 'picture.png'), png);
  await writeFile(path.join(outside, 'secret.md'), 'private');
  await symlink(outside, path.join(second, 'escape'), 'junction');
  await symlink(path.join(second, 'docs'), path.join(second, 'alias'), 'junction');
  const files = new WorkspaceFiles({ allProjects: true, allowsProject: () => true,
    resolveScope: async () => ({ workingRoot: first, roots: [{ path: first, kind: 'associated-folder' }, { path: second, kind: 'associated-folder' }] }) });
  const chat = { canonicalChatId: 'chat', project: first };
  const roots = await files.roots(chat);
  return { files, chat, first, second, png, firstId: roots.find(root => root.path === first).id, secondId: roots.find(root => root.path === second).id };
}

test('Markdown file links use the selected authorized root and current document folder', async t => {
  const f = await setup(t);
  const link = params => f.files.dispatch('workspace.link', params, f.chat);
  assert.equal((await link({ destination: 'guide.md' })).rootId, f.firstId, 'chat default remains its first authorized root');
  const chapter = await link({ rootId: f.secondId, basePath: 'docs', destination: 'chapter.md#L2' });
  assert.deepEqual(chapter, { rootId: f.secondId, path: 'docs/chapter.md', line: 2, directory: false });
  assert.equal((await link({ rootId: f.secondId, basePath: 'docs', destination: '../guide.md' })).path, 'guide.md');
  assert.equal((await link({ rootId: f.secondId, basePath: 'docs', destination: path.join(f.first, 'guide.md') })).rootId, f.firstId, 'absolute links still resolve across authorized roots');
  assert.equal((await link({ rootId: f.secondId, basePath: 'alias', destination: 'chapter.md' })).path, 'docs/chapter.md', 'within-root aliases return canonical references');
});

test('Markdown images resolve beside the file and retain independently validated chunk references', async t => {
  const f = await setup(t);
  const { mediaRef } = await f.files.dispatch('workspace.image', { rootId: f.secondId, basePath: 'docs', destination: 'picture.png' }, f.chat);
  assert.equal(mediaRef.source.rootId, f.secondId); assert.equal(mediaRef.source.path, 'docs/picture.png');
  const chunk = await f.files.dispatch('workspace.image.chunk', { ref: mediaRef, offset: 0 }, f.chat);
  assert.deepEqual(Buffer.from(chunk.base64, 'base64'), f.png);
});

test('unknown roots, invalid bases and symlink escapes cannot become Markdown link authority', async t => {
  const f = await setup(t);
  for (const context of [
    { rootId: 'unshared' }, { rootId: f.secondId, basePath: '../private' }, { rootId: f.secondId, basePath: '/absolute' },
    { rootId: f.secondId, basePath: 'C:relative' }, { rootId: f.secondId, basePath: '\\server\\share' },
    { rootId: f.secondId, basePath: 'docs\0' }, { rootId: f.secondId, basePath: 'escape' },
    { rootId: f.secondId, basePath: 'guide.md' }, { rootId: f.secondId, basePath: 'missing' }
  ]) {
    for (const method of ['workspace.link', 'workspace.image']) await assert.rejects(f.files.dispatch(method, { ...context, destination: 'secret.md' }, f.chat));
  }
  await assert.rejects(f.files.dispatch('workspace.link', { rootId: f.secondId, basePath: 'docs', destination: '../../private/secret.md' }, f.chat));
  await assert.rejects(f.files.dispatch('workspace.link', { rootId: 'unshared', destination: path.join(f.first, 'guide.md') }, f.chat));
});
