import assert from 'node:assert/strict';
import { createZyraPermissionGateExtension, describeZyraToolPermission } from '../src/zyra-permission-gate.mjs';

function toolHandler(options) {
  const extension = createZyraPermissionGateExtension({ project: process.cwd(), ...options });
  return extension.handlers.get('tool_call')[0];
}

assert.equal(describeZyraToolPermission({ toolName: 'read', input: { path: 'README.md' } }), null, 'read-only tools should not prompt');
assert.equal(describeZyraToolPermission({ toolName: 'browser_control', input: {} }), null, 'browser control keeps its dedicated capability broker');
assert.equal(describeZyraToolPermission({ toolName: 'bash', input: { command: 'npm test' } }).requestType, 'command');
assert.deepEqual(describeZyraToolPermission({ toolName: 'write', input: { path: 'src/a.ts' } }).paths, ['src/a.ts']);

let onceRequests = 0;
const allowOnce = toolHandler({
  getPermissionMode: () => 'approval-required',
  requestPermission: async () => { onceRequests += 1; return 'acceptOnce'; },
});
assert.equal(await allowOnce({ toolName: 'bash', input: { command: 'npm test' } }), undefined);
assert.equal(onceRequests, 1);

let declinedRequests = 0;
const decline = toolHandler({
  getPermissionMode: () => 'approval-required',
  requestPermission: async () => { declinedRequests += 1; return 'decline'; },
});
assert.equal((await decline({ toolName: 'edit', input: { path: 'src/a.ts' } })).block, true);
assert.equal(declinedRequests, 1);

let sessionRequests = 0;
const allowForSession = toolHandler({
  getPermissionMode: () => 'approval-required',
  requestPermission: async () => { sessionRequests += 1; return 'acceptForSession'; },
});
assert.equal(await allowForSession({ toolName: 'write', input: { path: 'src/a.ts' } }), undefined);
assert.equal(await allowForSession({ toolName: 'write', input: { path: 'src/b.ts' } }), undefined);
assert.equal(sessionRequests, 1, 'session grants should be bounded to the same tool, request type, and project');

let fullAccessRequests = 0;
const fullAccess = toolHandler({
  getPermissionMode: () => 'full-access',
  requestPermission: async () => { fullAccessRequests += 1; return 'decline'; },
});
assert.equal(await fullAccess({ toolName: 'bash', input: { command: 'npm test' } }), undefined);
assert.equal(fullAccessRequests, 0, 'full access should bypass approval requests');

console.log('Zyra permission gate: ok');
