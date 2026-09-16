import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WorkspaceFiles } from '../src/workspace-files.mjs';
test('a removed attached folder does not prevent opening the remaining project folders', async t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'zyra-mobile-missing-root-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const home = path.join(dir, 'home'), missing = path.join(dir, 'removed'), file = path.join(dir, 'ordinary.txt');
  mkdirSync(home); writeFileSync(file, 'not a folder'); writeFileSync(path.join(home, 'ok.txt'), 'available');
  const files = new WorkspaceFiles({ allProjects: true, allowsProject: () => true,
    resolveScope: async () => ({ workingRoot: missing, roots: [{ path: missing, kind: 'associated-folder' }, { path: file }, { path: home, kind: 'project-home' }] }) });
  const chat = { canonicalChatId: 'chat', project: home };
  const { roots } = await files.dispatch('workspace.roots', {}, chat);
  assert.deepEqual(roots.map(root => root.label), ['home']);
  assert.equal((await files.dispatch('workspace.file.read', { rootId: roots[0].id, path: 'ok.txt' }, chat)).text, 'available');
});
test('attached folders precede project homes without widening device access or changing explicit roots', async t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'zyra-mobile-roots-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const home = path.join(dir, 'home'), first = path.join(dir, 'first'), active = path.join(dir, 'active');
  for (const folder of [home, first, active]) { mkdirSync(folder); writeFileSync(path.join(folder, 'name.txt'), path.basename(folder)); }
  let hidden = '';
  const files = new WorkspaceFiles({ projects: [], allProjects: true, allowsProject: root => root !== hidden,
    resolveScope: async () => ({ workingRoot: active, roots: [
      { path: home, kind: 'project-home' }, { path: first, kind: 'associated-folder' },
      { path: active, kind: 'associated-folder', access: 'read-only' }
    ] }) });
  const chat = { canonicalChatId: 'chat', project: home };
  const { roots } = await files.dispatch('workspace.roots', {}, chat);
  assert.deepEqual(roots.map(root => root.label), ['active', 'first', 'home']);
  assert.ok(roots.every(root => !('path' in root) && !('priority' in root)));
  assert.equal((await files.dispatch('workspace.file.read', { rootId: roots[2].id, path: 'name.txt' }, chat)).text, 'home');
  await assert.rejects(files.dispatch('workspace.file.write', { rootId: roots[0].id, path: 'name.txt' }, chat), /read-only/);
  hidden = active;
  assert.deepEqual((await files.dispatch('workspace.roots', {}, chat)).roots.map(root => root.label), ['first', 'home']);
  await assert.rejects(files.dispatch('workspace.file.read', { rootId: roots[0].id, path: 'name.txt' }, chat), /available shared folder/);
});
test('files obey chat roots, read-only scope, bounded reads and concurrent edit conflicts', async t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'zyra-mobile-files-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const project = path.join(dir, 'project'); mkdirSync(project); writeFileSync(path.join(project, 'hello.txt'), 'original'); writeFileSync(path.join(dir, 'private.txt'), 'private');
  const chat = { canonicalChatId: 'chat', project };
  let access = 'read-write';
  const files = new WorkspaceFiles({ projects: [project], resolveScope: async () => ({ roots: [{ path: project, access }] }) });
  const base = { path: 'hello.txt' };
  await assert.rejects(files.dispatch('workspace.file.read', { path: '../private.txt' }, chat));
  await assert.rejects(files.dispatch('workspace.file.read', { path: path.join(dir, 'private.txt') }, chat));
  const original = await files.dispatch('workspace.file.read', base, chat); assert.equal(original.text, 'original');
  access = 'read-only'; await assert.rejects(files.dispatch('workspace.file.write', { ...base, hash: original.hash, text: 'bad' }, chat));
  access = 'read-write';
  const otherPhone = new WorkspaceFiles({ projects: [project] });
  const results = await Promise.allSettled(['first', 'second'].map((text, i) => (i ? otherPhone : files).dispatch('workspace.file.write', { ...base, hash: original.hash, text }, chat)));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'FILE_CONFLICT');
  assert.equal(readFileSync(path.join(project, 'hello.txt'), 'utf8'), ['first', 'second'][results.findIndex(result => result.status === 'fulfilled')]);
  writeFileSync(path.join(project, 'large.txt'), 'x'.repeat(140000));
  const large = await files.dispatch('workspace.file.read', { path: 'large.txt' }, chat); assert.equal(large.large, true); assert.equal(large.text, undefined);
  const chunk = await files.dispatch('workspace.file.chunk', { path: 'large.txt', etag: large.etag, offset: 0 }, chat); assert.ok(chunk.next <= 49152);
  await assert.rejects(files.dispatch('workspace.file.chunk', { path: 'large.txt', etag: 'changed', offset: 0 }, chat));
});

test('mobile text edits retain UTF-8 BOM and line endings, and binary files stay out of the editor', async t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'zyra-mobile-encoding-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const files = new WorkspaceFiles({ projects: [dir] }), chat = { canonicalChatId: 'encoding', project: dir };
  const bom = Buffer.from([0xef, 0xbb, 0xbf]);
  writeFileSync(path.join(dir, 'bom.txt'), Buffer.concat([bom, Buffer.from('first\r\nsecond\r\n')]));
  const first = await files.dispatch('workspace.file.read', { path: 'bom.txt' }, chat);
  assert.equal(first.text, 'first\r\nsecond\r\n');
  const saved = await files.dispatch('workspace.file.write', { path: 'bom.txt', hash: first.hash, text: first.text.replace('first', 'edited') }, chat);
  assert.deepEqual(readFileSync(path.join(dir, 'bom.txt')), Buffer.concat([bom, Buffer.from('edited\r\nsecond\r\n')]));
  const roundTrip = await files.dispatch('workspace.file.read', { path: 'bom.txt' }, chat);
  assert.equal(roundTrip.hash, saved.hash);
  writeFileSync(path.join(dir, 'plain.txt'), 'plain');
  const plain = await files.dispatch('workspace.file.read', { path: 'plain.txt' }, chat);
  await files.dispatch('workspace.file.write', { path: 'plain.txt', hash: plain.hash, text: 'edited' }, chat);
  assert.equal(readFileSync(path.join(dir, 'plain.txt'), 'utf8'), 'edited');
  writeFileSync(path.join(dir, 'binary.bin'), Buffer.from([0, 1, 2, 65]));
  const binary = await files.dispatch('workspace.file.read', { path: 'binary.bin' }, chat);
  assert.equal(binary.binary, true); assert.equal(binary.text, undefined);
});
