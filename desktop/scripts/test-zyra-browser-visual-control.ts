import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createBrowserControlTool } from '../../src/agent-control/browser-control-tool.mjs'
import { AgentControlBroker } from '../src/main/agent-control/agent-control-broker'
import { FakeControlDriver } from '../src/main/agent-control/drivers/fake-driver'
import { ObservationStore } from '../src/main/agent-control/observation-store'
import { AssistantBrowserAgentCursor } from '../src/renderer/src/pages/assistant/AssistantBrowserAgentCursor'

const driver = new FakeControlDriver()
const broker = new AgentControlBroker({ drivers: [driver] })
const targetId = broker.targets.createTargetId('zyra-browser')
broker.registerTarget({
    target: { kind: 'zyra-browser', targetId, tabId: 'browser:visual', guestIdentity: 'guest:visual', origin: 'http://127.0.0.1' },
    driver,
    trustedIdentity: {}
})
const principal = { type: 'root' as const, threadId: 'thread:visual', turnId: 'turn:visual' }
const pending = broker.requestGrant({
    principal,
    targetId,
    capabilities: ['observe.structure', 'observe.screenshot', 'pointer.move', 'pointer.click', 'pointer.drag'],
    maxActions: 20
})
const grant = broker.approvePendingGrant({
    pendingRequestId: pending.requestId,
    targetId,
    capabilities: pending.capabilities,
    durationMs: 60_000,
    maxActions: 20
})
const client = { request: (operation: unknown, options: { signal?: AbortSignal } = {}) => broker.handleToolOperation(principal, operation, options.signal) }
const tool = createBrowserControlTool({ client })

const observed = await tool.execute('visual-observe', {
    operation: 'observe', grantId: grant.grantId, targetId, includeScreenshot: true
})
assert.equal(observed.content[0]?.type, 'text')
assert.equal(observed.content[1]?.type, 'image')
assert.equal(observed.content[1]?.mimeType, 'image/png')
const firstRevision = (observed.details as any).observation.revision

const clicked = await tool.execute('visual-click', {
    operation: 'click', grantId: grant.grantId, targetId, observationRevision: firstRevision, x: 320, y: 220
})
assert.equal((clicked.details as any).observation.revision, firstRevision + 1)
let cursor = broker.state().cursors.find((entry) => entry.targetId === targetId)
assert.deepEqual(cursor && { x: cursor.x, y: cursor.y, phase: cursor.phase }, { x: 320, y: 220, phase: 'pressing' })

const dragged = await tool.execute('visual-drag', {
    operation: 'drag', grantId: grant.grantId, targetId,
    observationRevision: (clicked.details as any).observation.revision,
    fromX: 320, fromY: 220, toX: 470, toY: 330, durationMs: 260
})
assert.equal((dragged.details as any).observation.revision, firstRevision + 2)
cursor = broker.state().cursors.find((entry) => entry.targetId === targetId)
assert.deepEqual(cursor && { x: cursor.x, y: cursor.y, phase: cursor.phase }, { x: 470, y: 330, phase: 'idle' })
assert.match(renderToStaticMarkup(createElement(AssistantBrowserAgentCursor, { cursor: cursor || null })), /Zyra Browser cursor/)

const races = new ObservationStore()
const base = {
    version: 1 as const,
    observationId: 'race',
    targetId: 'target:race',
    capturedAt: new Date().toISOString(),
    targetState: 'ready' as const,
    elements: [],
    redactions: []
}
const older = races.nextRevision(base.targetId)
const newer = races.nextRevision(base.targetId)
races.set({ ...base, observationId: 'newer', revision: newer })
races.set({ ...base, observationId: 'older', revision: older })
assert.equal(races.currentRevision(base.targetId), newer)
assert.throws(() => races.requireRevision(base.targetId, older), (error: any) => error.code === 'CONTROL_STALE_OBSERVATION')

const childPrincipal = { type: 'agent' as const, fleetId: 'fleet:visual', agentRunId: 'agent:visual', parentThreadId: 'thread:visual' }
const discovered = await broker.handleToolOperation(childPrincipal, { operation: 'list_targets', targetKind: 'zyra-browser' })
assert.equal((discovered.targets as unknown[]).length, 1)
assert.equal((discovered.grants as unknown[]).length, 0)
const childRequest = await broker.handleToolOperation(childPrincipal, {
    operation: 'request_grant', targetId, capabilities: ['observe.structure', 'observe.screenshot', 'pointer.click'], maxActions: 8
}) as any
assert.equal(childRequest.pending, true)
const childGrant = broker.approvePendingGrant({
    pendingRequestId: childRequest.request.requestId,
    targetId,
    capabilities: childRequest.request.capabilities,
    durationMs: 30_000,
    maxActions: 8,
    allowedOrigins: childRequest.request.allowedOrigins
})
const attached = await broker.handleToolOperation(childPrincipal, { operation: 'list_targets', targetKind: 'zyra-browser' })
assert.equal((attached.grants as Array<{ grantId: string }>)[0]?.grantId, childGrant.grantId)
void await broker.handleToolOperation(childPrincipal, {
    operation: 'request_grant', targetId, capabilities: ['observe.structure'], maxActions: 2
})
broker.revokePrincipal(childPrincipal, 'agent finished')
assert.equal(broker.grants.listForPrincipal(childPrincipal).some((entry) => entry.state === 'active'), false)
assert.equal(broker.grants.listPending().some((entry) => entry.principal.type === 'agent' && entry.principal.agentRunId === childPrincipal.agentRunId), false)

await broker.emergencyStop()
assert.equal(broker.state().cursors.length, 0)
console.log('Zyra visual Browser control contract passed.')
