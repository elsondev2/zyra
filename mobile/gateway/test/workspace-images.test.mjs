import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { WorkspaceFiles } from '../src/workspace-files.mjs';
import { HostRouter, isRead } from '../src/router.mjs';

test('Markdown image references stream bounded bytes from the attached folder and recheck device scope', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'zyra-markdown-image-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const home = path.join(dir, 'home'), folder = path.join(dir, 'work');
  await mkdir(home); await mkdir(folder);
  const bytes = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(80000, 7)]);
  const image = path.join(folder, 'hello world.png'); await writeFile(image, bytes);
  await writeFile(path.join(dir, 'private.png'), bytes);
  await writeFile(path.join(folder, 'not-an-image.png'), 'plain text');
  let visible = true;
  const files = new WorkspaceFiles({ allProjects: true, allowsProject: root => visible && root !== dir,
    resolveScope: async () => ({ workingRoot: folder, roots: [{ path: home, kind: 'project-home' }, { path: folder, kind: 'associated-folder' }] }) });
  const chat = { canonicalChatId: 'chat', project: home };
  const resolved = await files.dispatch('workspace.image', { destination: 'hello%20world.png' }, chat);
  const ref = resolved.mediaRef;
  assert.equal(ref.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(ref.mimeType, 'image/png'); assert.equal(ref.bytes, bytes.length);
  assert.equal(ref.source.path, 'hello world.png'); assert.equal(ref.source.kind, 'workspace');
  assert.ok(JSON.stringify(resolved).length < 700);
  assert.equal((await files.dispatch('workspace.image', { destination: pathToFileURL(image).href }, chat)).mediaRef.sha256, ref.sha256);
  const chunks = []; let offset = 0;
  while (offset < ref.bytes) {
    const chunk = await files.dispatch('workspace.image.chunk', { ref, offset }, chat);
    chunks.push(Buffer.from(chunk.base64, 'base64')); assert.ok(chunk.next - offset <= 49152); offset = chunk.next;
  }
  assert.deepEqual(Buffer.concat(chunks), bytes);
  for (const destination of ['../private.png', path.join(dir, 'private.png'), 'https://example.com/image.png', 'file://remote/share/a.png', 'not-an-image.png']) {
    await assert.rejects(files.dispatch('workspace.image', { destination }, chat));
  }
  visible = false;
  await assert.rejects(files.dispatch('workspace.image.chunk', { ref, offset: 0 }, chat));
  visible = true;
  await writeFile(image, Buffer.concat([bytes, Buffer.from('changed')]));
  await assert.rejects(files.dispatch('workspace.image.chunk', { ref, offset: 0 }, chat), /changed/);
  await symlink(dir, path.join(folder, 'escape'), 'junction');
  await assert.rejects(files.dispatch('workspace.image', { destination: 'escape/private.png' }, chat));
});

test('image requests are read-only but must pass canonical chat visibility before file access', async () => {
  for (const method of ['workspace.image', 'workspace.image.chunk']) {
    assert.equal(isRead(method), true);
    const router = new HostRouter({ owner: 'phone', client: { request: async () => ({ chat: { canonicalChatId: 'hidden', project: '/private' } }) }, cache: {} });
    await assert.rejects(router.dispatch(method, { session: 'hidden', destination: 'image.png' }), { code: 'CHAT_NOT_VISIBLE' });
  }
});
