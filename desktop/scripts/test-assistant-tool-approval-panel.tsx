import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { AssistantPendingApprovalPanel } from '../src/renderer/src/pages/assistant/AssistantPendingApprovalPanel'
import type { AssistantPendingApproval } from '../src/shared/assistant/contracts'

const approval: AssistantPendingApproval = {
    id: 'approval-fixture', requestId: 'request-fixture', requestType: 'command',
    title: 'Command approval', command: 'Get-ChildItem .', status: 'pending', decision: null,
    turnId: 'turn-fixture', createdAt: '2026-09-01T00:00:00.000Z', resolvedAt: null
}
const onRespond = () => { throw Error('Rendering a prompt must never approve an action') }
const render = (pendingApprovals: AssistantPendingApproval[], responding = false) => renderToStaticMarkup(
    <AssistantPendingApprovalPanel pendingApprovals={pendingApprovals} responding={responding} onRespond={onRespond} />
)
assert.equal(render([]), '', 'no prompt without a pending request')
const html = render([approval])
assert.ok(html.includes(approval.command!))
assert.ok(html.includes('Deny'))
assert.ok(html.includes('Allow once'))
assert.ok(!html.includes('request-fixture'), 'internal request IDs are not visible copy')
const busy = render([approval], true)
const buttons = busy.match(/<button\b[^>]*>/g) || []
assert.ok(buttons.length >= 2)
assert.ok(buttons.every(button => button.includes('disabled')), 'duplicate clicks are disabled while responding')
assert.equal(approval.status, 'pending', 'rendering cannot mutate the pending decision')

assert.ok(html.includes('This action has not run.'))
assert.ok(busy.includes('Saving your choice'))
assert.equal(render([{ ...approval, status: 'resolved' }]), '', 'resolved requests cannot reopen an approval prompt')
const filePath = 'C:/workspace/desktop/scripts/release/runtime-contract.mjs'
const fileRequest: AssistantPendingApproval = { ...approval, requestType: 'file-change', command: undefined, title: 'Edit needs approval', detail: filePath, paths: [filePath], grantLabel: 'Allow file changes for this chat' }
const fileHtml = render([fileRequest])
const fileText = fileHtml.replace(/<[^>]*>/g, '')
assert.equal(fileText.split('runtime-contract.mjs').length - 1, 1, 'the file target is not repeated as a second path')
assert.doesNotMatch(fileHtml, /<pre\b/, 'path-only requests use a file target rather than a command box')
assert.ok(fileHtml.includes('Other approval options'), 'broader grants have a separate explicit entry')
assert.ok(!fileText.includes('Allow file changes for this chat'), 'the broader grant is not a competing default action')
assert.ok(render([fileRequest, { ...approval, requestId: 'next-request' }]).includes('1 of 2'))
const { getApprovalPresentation } = await import('../src/renderer/src/pages/assistant/assistant-approval-presentation')
assert.equal(getApprovalPresentation(fileRequest).grantLabel, fileRequest.grantLabel, 'the menu retains the exact backend scope label')
assert.equal(getApprovalPresentation({ ...approval, grantLabel: 'Allow shell commands for this chat' }).grantLabel, 'Allow shell commands for this chat')
const importantDetail = 'This updates the release manifest. Review the target before allowing it.'
assert.ok(render([{ ...fileRequest, detail: importantDetail }]).includes(importantDetail), 'meaningful detail is never hidden as a duplicate')
console.log('Tool approval panel: clear targets, exact command/scope, queued requests, no implicit decisions and responding lock: ok')
