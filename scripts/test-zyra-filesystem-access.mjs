import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, rename, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createZyraPermissionGateExtension } from '../src/zyra-permission-gate.mjs';

const fixture = await mkdtemp(path.join(os.tmpdir(), 'zyra-folder-access-'));
let passed = 0;
try {
  const project = path.join(fixture, 'installed-app');
  const repo = path.join(fixture, 'source-repo');
  const readonly = path.join(fixture, 'readonly');
  for (const folder of [project, repo, readonly]) await mkdir(folder);
  await writeFile(path.join(repo, 'AGENTS.md'), 'fixture rules');
  function runtime({ mode = 'full-access', decide = async () => 'acceptForSession' } = {}) {
    const requests = [];
    const extension = createZyraPermissionGateExtension({ project,
      filesystemScope: { roots: [{ path: project, access: 'read-write' }, { path: readonly, access: 'read-only' }] },
      getPermissionMode: () => mode,
      requestPermission: async request => { requests.push(request); return decide(request); },
      reviewPermission: () => { throw new Error('Scope expansion must never use automatic review'); },
    });
    const tool = extension.tools.get('filesystem_access')?.definition;
    assert.ok(tool, 'The live gate must register the discoverable recovery tool');
    return { requests, tool, call: extension.handlers.get('tool_call')[0],
      grant: (folder = repo, access = 'read-only', signal) => tool.execute('scope-fixture', { operation: 'request', path: folder, access, reason: 'Read project instructions' }, signal),
    };
  }
  const read = { toolName: 'read', input: { path: path.join(repo, 'AGENTS.md') } };
  const shell = { toolName: 'bash', input: { command: `git -C "${repo}" status` } };
  const edit = { toolName: 'edit', input: { path: path.join(repo, 'AGENTS.md') } };
  const r = runtime();
  for (const event of [read, shell, edit]) assert.equal((await r.call(event)).block, true);
  assert.match((await r.call(read)).reason, /filesystem_access/);
  assert.equal((await r.tool.execute('inspect', { operation: 'inspect' })).details.roots.length, 2);
  assert.equal(r.requests.length, 0, 'inspection cannot trigger approval');
  assert.equal((await r.grant()).details.granted, true);
  assert.equal(r.requests.length, 1, 'Full access still needs explicit folder approval');
  assert.deepEqual(r.requests[0].paths, [repo]);
  assert.equal(r.requests[0].toolCallId, 'scope-fixture');
  assert.equal(await r.call(read), undefined, 'same running chat retries structured read');
  assert.equal(await r.call(shell), undefined, 'Bash and read use the same grant');
  assert.equal((await r.call({toolName:'bash',input:{command:`git -c core.sshCommand=custom -C "${repo}" status`}})).block, true, 'Git configuration is not a directory-only option');
  assert.equal((await r.call(edit)).block, true, 'read-only grant blocks edits');
  assert.equal((await r.call({toolName:'bash',input:{command:`touch "${path.join(repo,'new')}"`}})).block, true);
  assert.equal((await runtime().call(read)).block, true, 'reconnect does not inherit temporary grants');
  passed++;

  for (const mode of ['full-access', 'auto-review', 'approval-required', 'edits-only']) {
    const denied = runtime({mode, decide: async () => 'decline'});
    assert.equal((await denied.grant()).details.granted, false);
    assert.equal((await denied.call(read)).block, true);
    assert.equal(denied.requests.length, 1);
    passed++;
  }
  const writable = runtime();
  assert.equal((await writable.grant(repo, 'read-write')).details.granted, true);
  assert.equal(await writable.call(edit), undefined);
  assert.equal((await writable.grant(readonly, 'read-write')).details.granted, false);
  assert.equal(writable.requests.length, 1, 'saved read-only ceiling cannot be approved away');
  await writable.grant(fixture, 'read-write');
  assert.equal((await writable.call({toolName:'write',input:{path:path.join(readonly,'new')}})).block,true,'parent grant preserves read-only child');
  passed++;

  const once = runtime({decide: async () => 'acceptOnce'});
  await once.grant();
  assert.equal(await once.call({toolName:'filesystem_access',input:{operation:'inspect'}}), undefined);
  const attempts = await Promise.all([once.call(read), once.call(read)]);
  assert.equal(attempts.filter(value => value === undefined).length, 1, 'one-shot scope cannot authorize two concurrent calls');
  assert.equal(attempts.filter(value => value?.block).length, 1);
  passed++;

  const cancellation = new AbortController();
  const aborted = runtime({decide: async () => {cancellation.abort();return 'acceptForSession';}});
  assert.equal((await aborted.grant(repo, 'read-only', cancellation.signal)).details.granted, false);
  assert.equal((await aborted.call(read)).block, true, 'late approval cannot grant after cancellation');
  passed++;

  const link = path.join(fixture, 'approved-link');
  await symlink(repo, link, process.platform === 'win32' ? 'junction' : 'dir');
  const swapped = runtime({decide: async () => {
    await rename(link, `${link}-old`);
    await symlink(readonly, link, process.platform === 'win32' ? 'junction' : 'dir');
    return 'acceptForSession';
  }});
  assert.equal((await swapped.grant(link, 'read-write')).details.granted, false, 'approval is bound to the reviewed canonical folder');
  passed++;

  await assert.rejects(r.grant(path.join(repo, 'AGENTS.md')), /folder/);
  assert.equal(r.requests.length, 1, 'invalid request must not prompt');
  passed++;
  console.log(`PASS: ${passed} filesystem recovery scenarios (installed-app scope, same-chat retry, policy modes, Bash/read, read-only, one-shot, cancellation, reconnect, link replacement)`);
} finally {
  if (path.dirname(fixture) !== os.tmpdir() || !path.basename(fixture).startsWith('zyra-folder-access-')) throw new Error('Unexpected fixture path');
  await rm(fixture, {recursive:true,force:true});
}
