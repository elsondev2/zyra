import assert from 'node:assert/strict';
import path from 'node:path';
import { createZyraPermissionGateExtension, describeZyraToolPermission, isDefinitelyCriticalZyraToolPermission, isPotentiallyCriticalZyraToolPermission } from '../src/zyra-permission-gate.mjs';

function toolHandler(options) {
  const extension = createZyraPermissionGateExtension({ project: process.cwd(), ...options });
  return extension.handlers.get('tool_call')[0];
}

assert.equal(describeZyraToolPermission({ toolName: 'read', input: { path: 'README.md' } }), null, 'read-only tools should not prompt');
assert.equal(describeZyraToolPermission({ toolName: 'browser_control', input: {} }), null, 'browser control keeps its dedicated capability broker');
const mcpPermission = describeZyraToolPermission({ toolName: 'plugin_mcp', input: { action: 'call', pluginId: 'p', server: 's', tool: 'write', arguments: { token: 'secret' } } });
assert.equal(describeZyraToolPermission({ toolName: 'plugin_mcp', input: { action: 'servers' } }), null, 'listing pinned servers does not start a connection');
assert.equal(mcpPermission.grantKey, 'plugin_mcp:p:s:call:write');
assert.equal(mcpPermission.detail.includes('secret'), false, 'MCP arguments never enter approval summaries');
const emailPermission = describeZyraToolPermission({ toolName: 'plugin_mcp', input: { action: 'call', pluginId: 'p', server: 'gmail', tool: 'create_draft', arguments: { to: ['private@example.test'], body: 'Private email text', attachments: [{ filename: 'private.pdf', data: 'private-file-content' }], token: 'secret' } } });
assert.match(emailPermission.detail, /Attachment uploads: 1/u);
for (const privateValue of ['private@example.test', 'Private email text', 'private.pdf', 'private-file-content', 'secret']) assert.equal(emailPermission.detail.includes(privateValue), false);
for (const mode of ['full-access', 'approval-required', 'edits-only', 'auto-review']) {
  let prompts = 0;
  let reviews = 0;
  const handler = toolHandler({ getPermissionMode: () => mode, reviewPermission: async request => { reviews++; assert.match(request.detail, /send_message/u); return { decision: 'ask', reason: 'An external email needs confirmation.' }; }, requestPermission: async () => { prompts++; return 'decline'; } });
  const result = await handler({ toolName: 'plugin_mcp', input: { action: 'call', pluginId: 'p', server: 'gmail', tool: 'send_message', arguments: { to: ['private@example.test'] } } });
  assert.equal(prompts, mode === 'full-access' ? 0 : 1);
  assert.equal(reviews, mode === 'auto-review' ? 1 : 0);
  assert.equal(mode === 'full-access' ? result === undefined : result.block, true, 'Gmail sends inherit the existing permission mode; there is no separate approval system');
}
assert.equal(describeZyraToolPermission({ toolName: 'bash', input: { command: 'npm test' } }).requestType, 'command');
assert.deepEqual(describeZyraToolPermission({ toolName: 'write', input: { path: 'src/a.ts' } }).paths, ['src/a.ts']);

const scopedHome = path.resolve('fixture-project-home');
const scopedWritable = path.resolve('fixture-associated-writable');
const scopedReadOnly = path.resolve('fixture-associated-read-only');
const filesystemScope = {
  roots: [
    { path: scopedHome, access: 'read-write' },
    { path: scopedWritable, access: 'read-write' },
    { path: scopedReadOnly, access: 'read-only' },
  ],
};
assert.equal(describeZyraToolPermission(
  { toolName: 'read', input: { path: path.join(scopedWritable, 'README.md') } },
  { project: scopedHome, filesystemScope },
), null, 'safe reads inside any scoped Project root should proceed');
assert.equal(describeZyraToolPermission(
  { toolName: 'edit', input: { path: path.join(scopedReadOnly, 'notes.md') } },
  { project: scopedHome, filesystemScope },
).readOnlyViolation, true, 'read-only Associated folders impose a hard write ceiling');
let scopeBypassRequests = 0;
const scopedFullAccess = toolHandler({
  project: scopedHome,
  filesystemScope,
  getPermissionMode: () => 'full-access',
  requestPermission: async () => { scopeBypassRequests += 1; return 'acceptOnce'; },
});
assert.equal(await scopedFullAccess({ toolName: 'write', input: { path: path.join(scopedReadOnly, 'notes.md') } }), undefined);
assert.equal(await scopedFullAccess({ toolName: 'read', input: { path: path.resolve('outside-scope', 'secret.txt') } }), undefined);
assert.equal(await scopedFullAccess({ toolName: 'bash', input: { command: `type "${path.resolve('outside-scope', 'secret.txt')}"` } }), undefined);
assert.equal(await scopedFullAccess({ toolName: 'bash', input: { command: `node tools/update.mjs "${scopedReadOnly}"` } }), undefined);
const readOnlyWorkingRoot = toolHandler({
  project: scopedReadOnly,
  filesystemScope,
  getPermissionMode: () => 'full-access',
  requestPermission: async () => { scopeBypassRequests += 1; return 'acceptOnce'; },
});
assert.equal(
  await readOnlyWorkingRoot({ toolName: 'bash', input: { command: 'git status --short' } }),
  undefined,
  'conservatively read-only commands may run from a read-only working root',
);
assert.equal(await readOnlyWorkingRoot({ toolName: 'bash', input: { command: 'npm test' } }), undefined);
assert.equal(await readOnlyWorkingRoot({ toolName: 'bash', input: { command: 'git status && node tools/update.mjs' } }), undefined);
assert.equal(scopeBypassRequests, 0, 'routine Full access never prompts for folder scope');

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

let editsOnlyRequests = 0;
const editsOnly = toolHandler({
  getPermissionMode: () => 'edits-only',
  requestPermission: async () => { editsOnlyRequests += 1; return 'acceptOnce'; },
});
assert.equal(await editsOnly({ toolName: 'edit', input: { path: 'src/a.ts' } }), undefined);
assert.equal(editsOnlyRequests, 0, 'edits only should allow non-destructive project file edits');
assert.equal(await editsOnly({ toolName: 'bash', input: { command: 'npm test' } }), undefined);
assert.equal(editsOnlyRequests, 1, 'edits only should ask before commands');
assert.equal(await editsOnly({ toolName: 'write', input: { path: '../outside.txt' } }), undefined);
assert.equal(editsOnlyRequests, 2, 'edits only should ask before out-of-project edits');

let autoReviewCalls = 0;
let autoReviewRequests = 0;
const autoReview = toolHandler({
  getPermissionMode: () => 'auto-review',
  reviewPermission: async () => { autoReviewCalls += 1; return { decision: 'approve', reason: 'Routine reversible work.' }; },
  requestPermission: async () => { autoReviewRequests += 1; return 'acceptOnce'; },
});
assert.equal(await autoReview({ toolName: 'bash', input: { command: 'npm test' } }), undefined);
assert.equal(autoReviewCalls, 1, 'auto review should review routine actions');
assert.equal(autoReviewRequests, 0, 'an approved automatic review should not interrupt the user');
assert.equal(await autoReview({ toolName: 'bash', input: { command: 'git push origin main' } }), undefined);
assert.equal(autoReviewCalls, 2, 'flagged critical commands must reach the reviewer before any user prompt');
assert.equal(autoReviewRequests, 0, 'the reviewer can approve a flagged action without interrupting the user');

let fullAccessRequests = 0;
const fullAccess = toolHandler({
  getPermissionMode: () => 'full-access',
  requestPermission: async () => { fullAccessRequests += 1; return 'decline'; },
});
assert.equal(await fullAccess({ toolName: 'bash', input: { command: 'npm test' } }), undefined);
assert.equal(fullAccessRequests, 0, 'full access should bypass approval requests');

let mediaPrompts = 0;
let mediaReviews = 0;
const fullAccessMedia = toolHandler({
  getPermissionMode: () => 'full-access',
  reviewPermission: async () => { mediaReviews += 1; return { decision: 'ask' }; },
  requestPermission: async () => { mediaPrompts += 1; return 'decline'; },
});
for (const command of [
  "ffprobe -v error -show_entries format=duration,size,bit_rate:stream=index,codec_name,codec_type,width,height,r_frame_rate,sample_rate,channels,pix_fmt -of json 'C:/Users/example/Downloads/source.mp4'",
  "ffmpeg -nostdin -n -i source.mp4 -vf 'scale=640:-2,format=yuv420p' preview.mp4",
]) assert.equal(await fullAccessMedia({ toolName: 'bash', input: { command } }), undefined);
assert.equal(mediaPrompts, 0, 'Full access media inspection and conversion do not prompt');
assert.equal(mediaReviews, 0, 'media format options must not invoke critical-action review');
assert.equal(await fullAccessMedia({ toolName: 'bash', input: { command: 'ffprobe -show_entries format=duration source.mp4; format D:' } }), undefined);
assert.equal(mediaPrompts, 0, 'Full access bypasses approval even for a flagged critical command');
assert.equal(mediaReviews, 0, 'Full access never invokes the reviewer');

let searchRequests = 0;
const fullAccessSearch = toolHandler({
  getPermissionMode: () => 'full-access',
  reviewPermission: async () => ({ decision: 'ask' }),
  requestPermission: async () => { searchRequests += 1; return 'decline'; },
});
assert.equal(await fullAccessSearch({ toolName: 'bash', input: { command: 'rg -n "password|token" src' } }), undefined);
assert.equal(searchRequests, 0, 'quoted search patterns are read-only, even when they contain shell metacharacters');
assert.equal(await fullAccessSearch({ toolName: 'bash', input: { command: 'rg -n password src | head -n 20' } }), undefined);
assert.equal(searchRequests, 0, 'pipelines of read-only commands do not prompt in Full access');
assert.equal(await fullAccessSearch({ toolName: 'bash', input: { command: 'rg -n password src | xargs rm -rf' } }), undefined);
assert.equal(searchRequests, 0, 'Full access also bypasses destructive pipeline approvals');

assert.equal(isPotentiallyCriticalZyraToolPermission({ toolName: 'bash', command: 'npm test' }), false);
assert.equal(isDefinitelyCriticalZyraToolPermission({ toolName: 'bash', command: 'git push origin main' }), true);
assert.equal(isPotentiallyCriticalZyraToolPermission({ toolName: 'write', outsideProject: true }), true);

let reviewedRequests = 0;
const reviewedApproval = toolHandler({
  getPermissionMode: () => 'auto-review',
  reviewPermission: async () => ({ decision: 'approve', reason: 'This only checks wording in a local script.' }),
  requestPermission: async () => { reviewedRequests += 1; return 'decline'; },
});
assert.equal(await reviewedApproval({ toolName: 'bash', input: { command: 'node scripts/check-publish-copy.mjs' } }), undefined);
assert.equal(reviewedRequests, 0, 'a reviewed false positive should not open a user prompt');
assert.equal(isDefinitelyCriticalZyraToolPermission({ toolName: 'bash', command: "printf 'format D:'" }), true, 'a command argument can still trigger a deterministic false flag');
assert.equal(await reviewedApproval({ toolName: 'bash', input: { command: "printf 'format D:'" } }), undefined);
assert.equal(reviewedRequests, 0, 'a definitely-critical false flag goes to the reviewer and can proceed without a prompt');

let reviewerConcern;
const reviewedDenial = toolHandler({
  getPermissionMode: () => 'auto-review',
  reviewPermission: async () => ({ decision: 'deny', reason: 'This conflicts with the request.' }),
  requestPermission: async (request) => { reviewerConcern = request.detail; return 'acceptOnce'; },
});
assert.equal(await reviewedDenial({ toolName: 'bash', input: { command: 'node scripts/production-report.mjs' } }), undefined);
assert.match(reviewerConcern, /This conflicts with the request/, 'Auto review surfaces a reviewer concern instead of silently blocking the action');

let criticalRequests = 0;
let definiteReviewCalls = 0;
const criticalAsk = toolHandler({
  getPermissionMode: () => 'full-access',
  reviewPermission: async () => { definiteReviewCalls += 1; return { decision: 'approve' }; },
  requestPermission: async () => { criticalRequests += 1; return 'acceptOnce'; },
});
assert.equal(await criticalAsk({ toolName: 'bash', input: { command: 'terraform apply -auto-approve' } }), undefined);
assert.equal(criticalRequests, 0, 'Full access skips approval for definite critical actions');
assert.equal(definiteReviewCalls, 0, 'Full access never calls the reviewer');

let repeatedCriticalRequests = 0;
const criticalSessionGrant = toolHandler({
  getPermissionMode: () => 'full-access',
  requestPermission: async () => { repeatedCriticalRequests += 1; return 'acceptForSession'; },
});
assert.equal(await criticalSessionGrant({ toolName: 'bash', input: { command: 'git push origin dev' } }), undefined);
assert.equal(await criticalSessionGrant({ toolName: 'bash', input: { command: 'git push origin main' } }), undefined);
assert.equal(repeatedCriticalRequests, 0, 'Full access never needs a session grant');

let noReviewerRequests = 0;
const noReviewer = toolHandler({
  getPermissionMode: () => 'full-access',
  requestPermission: async () => { noReviewerRequests += 1; return 'acceptOnce'; },
});
assert.equal(await noReviewer({ toolName: 'delete', input: { path: 'data.db' } }), undefined);
assert.equal(noReviewerRequests, 0, 'Full access does not depend on reviewer availability');

const fullAccessWithoutCallbacks = toolHandler({ getPermissionMode: () => 'full-access' });
for (const event of [
  { toolName: 'bash', input: { command: 'format D:' } },
  { toolName: 'delete', input: { path: '../data.db' } },
  { toolName: 'plugin_mcp', input: { action: 'call', pluginId: 'p', server: 's', tool: 'publish' } },
]) assert.equal(await fullAccessWithoutCallbacks(event), undefined, 'Full access works without any approval surface');

for (const decision of ['ask', 'deny']) {
  const order = [];
  const flaggedReview = toolHandler({
    getPermissionMode: () => 'auto-review',
    reviewPermission: async () => { order.push('review'); return { decision, reason: 'Exact destructive target needs confirmation.' }; },
    requestPermission: async (request) => {
      order.push('user');
      assert.match(request.detail, /Exact destructive target needs confirmation/);
      return 'decline';
    },
  });
  assert.equal((await flaggedReview({ toolName: 'bash', input: { command: 'format D:' } })).block, true);
  assert.deepEqual(order, ['review', 'user'], 'a flagged command is reviewed before escalation, and decline prevents execution');
}

const reviewFailureReasons = [];
for (const reviewPermission of [undefined, async () => { throw Error('Permission review timed out.'); }, async () => ({})]) {
  const failingReview = toolHandler({
    getPermissionMode: () => 'auto-review', reviewPermission,
    requestPermission: async (request) => { reviewFailureReasons.push(request.detail); return 'decline'; },
  });
  assert.equal((await failingReview({ toolName: 'bash', input: { command: 'rm -rf data' } })).block, true);
}
assert.match(reviewFailureReasons[0], /Automatic review is unavailable/);
assert.match(reviewFailureReasons[1], /Permission review timed out/);

let grantedReviews = 0;
let grantedPrompts = 0;
const autoReviewSessionGrant = toolHandler({
  getPermissionMode: () => 'auto-review',
  reviewPermission: async () => { grantedReviews += 1; return { decision: 'ask', reason: 'Confirm this target.' }; },
  requestPermission: async () => { grantedPrompts += 1; return 'acceptForSession'; },
});
await autoReviewSessionGrant({ toolName: 'bash', input: { command: 'git push origin dev' } });
await autoReviewSessionGrant({ toolName: 'bash', input: { command: 'git push origin main' } });
assert.equal(grantedReviews, 2, 'session grants cannot skip review of a later flagged command');
assert.equal(grantedPrompts, 2, 'later consequential actions still receive individual decisions');

for (const mode of ['approval-required', 'edits-only']) {
  let prompts = 0;
  const unchangedMode = toolHandler({
    getPermissionMode: () => mode,
    reviewPermission: async () => { throw Error('Other modes must not use the reviewer'); },
    requestPermission: async () => { prompts += 1; return 'decline'; },
  });
  assert.equal((await unchangedMode({ toolName: 'bash', input: { command: 'format D:' } })).block, true);
  assert.equal(prompts, 1);
}

const installedAppProbe = `powershell -NoProfile -Command "Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like '*ExampleApp*' } | Select-Object DisplayName,DisplayVersion | Format-List; Get-AppxPackage *ExampleApp*; Test-Path (Join-Path $env:LOCALAPPDATA 'Programs\\ExampleApp\\ExampleApp.exe')"`;
assert.equal(isDefinitelyCriticalZyraToolPermission({ toolName: 'bash', command: installedAppProbe }), false, 'Format-List is not a disk-format command');
const probe = toolHandler({ getPermissionMode: () => 'full-access', requestPermission: async () => { throw Error('Routine installed-app lookup must not prompt in Full access'); } });
assert.equal(await probe({ toolName: 'bash', toolCallId: 'probe:installed-app', input: { command: installedAppProbe } }), undefined);
for (const command of ['Get-Item example | Format-Table', 'Get-Item example | Format-Wide', 'Get-Content example | Format-Hex', 'Get-Item example | Format-Custom']) assert.equal(isDefinitelyCriticalZyraToolPermission({ toolName: 'bash', command }), false);
for (const command of ['format C:', 'FORMAT D: /FS:NTFS', 'format.com E:', '"C:\\Windows\\System32\\format.exe" F:', 'diskpart', 'Remove-Item data -Recurse -Force']) assert.equal(isDefinitelyCriticalZyraToolPermission({ toolName: 'bash', command }), true, `Critical command remains gated: ${command}`);

console.log('Zyra permission gate: ok');
