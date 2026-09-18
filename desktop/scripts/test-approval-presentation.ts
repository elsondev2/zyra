import assert from 'node:assert/strict'
import { compactApprovalGrantLabel, getApprovalPresentation } from '../src/renderer/src/pages/assistant/assistant-approval-presentation'
import type { AssistantPendingApproval } from '../src/shared/assistant/contracts'
const base: AssistantPendingApproval = { id: 'fixture', requestId: 'request', requestType: 'file-change', status: 'pending', decision: null, turnId: null, createdAt: '2026-09-17T00:00:00Z', resolvedAt: null }
const windows = getApprovalPresentation({ ...base, paths: ['C:\\Work\\file.ts', 'c:/work/file.ts'], detail: 'c:/work/file.ts' })
assert.equal(windows.paths.length, 1)
assert.equal(windows.paths[0].path, 'C:\\Work\\file.ts')
assert.equal(windows.paths[0].name, 'file.ts')
assert.equal(windows.paths[0].directory, 'C:\\Work')
assert.equal(windows.detail, null)
assert.equal(getApprovalPresentation({ ...base, paths: ['/Work/file.ts', '/work/file.ts'] }).paths.length, 2, 'POSIX path identity stays case-sensitive')
for (const path of ['C:\\', '/']) assert.deepEqual(getApprovalPresentation({ ...base, paths: [path] }).paths[0], { path, name: path, directory: '' })
const command = 'Get-Content "C:\\work\\file.txt"\nWrite-Output "<content>"'
const shown = getApprovalPresentation({ ...base, requestType: 'command', command, detail: command, paths: ['C:/work/file.txt'], grantLabel: 'Allow only the named tool in this chat' })
assert.equal(shown.command, command)
assert.equal(shown.detail, null)
assert.equal(shown.grantLabel, 'Allow only the named tool in this chat')
assert.equal(getApprovalPresentation({ ...base, detail: 'Review the proposed change.', paths: ['relative/file.txt'] }).detail, 'Review the proposed change.')
assert.ok(getApprovalPresentation(base).detail)
assert.equal(getApprovalPresentation({ ...base, requestType: 'file-read' }).grantLabel, 'Allow file reads for this chat')
assert.equal(compactApprovalGrantLabel('Allow folder until chat reconnects'), 'Until reconnect')
assert.equal(compactApprovalGrantLabel('Allow file changes for this chat'), 'For this chat')
assert.equal(compactApprovalGrantLabel('Allow reads for this session'), 'For this session')
assert.equal(compactApprovalGrantLabel('Allow only the selected folder until noon'), 'Allow only the selected folder until noon', 'unknown scope wording is never reinterpreted')
console.log('Approval presentation: exact content/scope, path deduplication, root paths and useful detail: ok')
