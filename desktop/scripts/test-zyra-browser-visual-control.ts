import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createBrowserControlTool } from '../../src/agent-control/browser-control-tool.mjs'
import { normalizeTemporaryBrowserOperation, startTemporaryBrowserRelay } from '../../src/agent-control/temporary-browser-relay.mjs'
import { AgentControlBroker } from '../src/main/agent-control/agent-control-broker'
import { BrowserSurfaceHost } from '../src/main/agent-control/browser-surface-host'
import { FakeControlDriver } from '../src/main/agent-control/drivers/fake-driver'
import { ObservationStore } from '../src/main/agent-control/observation-store'
import { isTrustedBrowserTabId } from '../src/main/agent-control/trusted-guest-registry'
import { resolveZyraRoot } from '../src/main/zyra/zyra-root'
import { AssistantBrowserAgentCursor } from '../src/renderer/src/pages/assistant/AssistantBrowserAgentCursor'
import type { ControlTarget } from '../src/shared/agent-control/contracts'

const expectedRuntimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const inheritedZyraRoot = process.env.ZYRA_ROOT
try {
    process.env.ZYRA_ROOT = path.resolve(expectedRuntimeRoot, '..', '..', '..')
    assert.equal(resolveZyraRoot(), expectedRuntimeRoot, 'the loaded desktop worktree wins over a stale inherited ZYRA_ROOT')
} finally {
    if (inheritedZyraRoot === undefined) delete process.env.ZYRA_ROOT
    else process.env.ZYRA_ROOT = inheritedZyraRoot
}

assert.equal(isTrustedBrowserTabId('browser:8'), true)
assert.equal(isTrustedBrowserTabId('browser:agent:visual-open'), true, 'agent-created Browser tabs must pass the trusted binding boundary')
assert.equal(isTrustedBrowserTabId('browser:agent/escape'), false)
assert.throws(() => normalizeTemporaryBrowserOperation({ operation: 'list_windows' }), /not allowed/)
assert.throws(() => normalizeTemporaryBrowserOperation({ operation: 'observe', targetId: 'chrome-tab:1' }), /in-app Browser/)
assert.equal(
    (normalizeTemporaryBrowserOperation({ operation: 'observe', targetId: 'control-target:zyra-browser:1' }) as any).targetId,
    'control-target:zyra-browser:1'
)
const relayFlag = process.env.ZYRA_ENABLE_TEMP_BROWSER_RELAY
process.env.ZYRA_ENABLE_TEMP_BROWSER_RELAY = '1'
let relayedOperation: any
const relay = await startTemporaryBrowserRelay({
    threadId: 'thread:visual',
    controlClient: {
        request: async (operation: unknown) => {
            relayedOperation = operation
            return { targets: [] }
        }
    }
})
if (relayFlag === undefined) delete process.env.ZYRA_ENABLE_TEMP_BROWSER_RELAY
else process.env.ZYRA_ENABLE_TEMP_BROWSER_RELAY = relayFlag
assert(relay)
const relayDescriptor = JSON.parse(readFileSync(relay.descriptorFile, 'utf8'))
const unauthorizedRelayResponse = await fetch(`http://127.0.0.1:${relayDescriptor.port}/control`, { method: 'POST', body: '{}' })
assert.equal(unauthorizedRelayResponse.status, 401)
const relayResponse = await fetch(`http://127.0.0.1:${relayDescriptor.port}/control`, {
    method: 'POST',
    headers: { authorization: `Bearer ${relayDescriptor.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ operation: { operation: 'list_targets', targetKind: 'chrome-tab' } })
})
assert.equal(relayResponse.status, 200)
assert.deepEqual(relayedOperation, { operation: 'list_targets', targetKind: 'zyra-browser' })
relay.stop()
assert.equal(existsSync(relay.descriptorFile), false)

const policyDirectory = mkdtempSync(path.join(os.tmpdir(), 'zyra-browser-relay-policy-'))
const policyPath = path.join(policyDirectory, 'policy.mjs')
const writePolicy = (targetKind: string) => writeFileSync(
    policyPath,
    `export function normalizeTemporaryBrowserOperation(){ return { operation: 'list_targets', targetKind: ${JSON.stringify(targetKind)} }; }\n`
)
writePolicy('version-one')
process.env.ZYRA_ENABLE_TEMP_BROWSER_RELAY = '1'
let hotRelayedOperation: any
const hotRelay = await startTemporaryBrowserRelay({
    threadId: 'thread:hot-policy',
    policyPath,
    controlClient: { request: async (operation: unknown) => { hotRelayedOperation = operation; return {} } }
})
if (relayFlag === undefined) delete process.env.ZYRA_ENABLE_TEMP_BROWSER_RELAY
else process.env.ZYRA_ENABLE_TEMP_BROWSER_RELAY = relayFlag
assert(hotRelay)
const hotDescriptor = JSON.parse(readFileSync(hotRelay.descriptorFile, 'utf8'))
const postHotPolicy = async () => {
    const response = await fetch(`http://127.0.0.1:${hotDescriptor.port}/control`, {
        method: 'POST',
        headers: { authorization: `Bearer ${hotDescriptor.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ operation: { operation: 'list_targets' } })
    })
    assert.equal(response.status, 200)
}
await postHotPolicy()
assert.equal(hotRelayedOperation.targetKind, 'version-one')
writePolicy('version-two-without-restart')
await postHotPolicy()
assert.equal(hotRelayedOperation.targetKind, 'version-two-without-restart')
hotRelay.stop()
rmSync(policyDirectory, { recursive: true, force: true })

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

const surfaceRequests: any[] = []
const openedTargets = new Map<string, any>()
const surfaceHost = new BrowserSurfaceHost({
    send: (request) => surfaceRequests.push(request),
    resolveTarget: (openedTargetId) => {
        const opened = openedTargets.get(openedTargetId)
        if (!opened) throw new Error('missing target')
        return opened
    },
    makeId: () => 'visual-open',
    timeoutMs: 2_000
})
const openedPromise = surfaceHost.openTab(principal, true)
assert.deepEqual(surfaceRequests[0] && {
    requestId: surfaceRequests[0].requestId,
    threadId: surfaceRequests[0].threadId,
    tabId: surfaceRequests[0].tabId,
    reveal: surfaceRequests[0].reveal
}, {
    requestId: 'browser-open:visual-open',
    threadId: principal.threadId,
    tabId: 'browser:agent:visual-open',
    reveal: true
})
const openedTarget = {
    kind: 'zyra-browser' as const,
    targetId: 'zyra-browser:opened',
    tabId: surfaceRequests[0].tabId,
    guestIdentity: 'guest:opened',
    origin: null
}
openedTargets.set(openedTarget.targetId, openedTarget)
const openAcknowledgement = {
    requestId: surfaceRequests[0].requestId,
    threadId: surfaceRequests[0].threadId,
    tabId: surfaceRequests[0].tabId
}
assert.equal(surfaceHost.acknowledge(openAcknowledgement), true)
assert.equal(surfaceHost.acknowledge(openAcknowledgement), false)
assert.equal(surfaceHost.completeRegisteredTarget(openedTarget), true)
assert.equal((await openedPromise).targetId, openedTarget.targetId)
assert.equal(surfaceHost.complete({
    ...openAcknowledgement,
    success: true,
    targetId: openedTarget.targetId
}), false)
surfaceHost.dispose()

const delayedSurfaceRequests: any[] = []
const delayedSurfaceHost = new BrowserSurfaceHost({
    send: (request) => delayedSurfaceRequests.push(request),
    resolveTarget: () => { throw new Error('registration completion should use the trusted target directly') },
    makeId: () => 'delayed-visual-open',
    timeoutMs: 1_000
})
const delayedOpenedPromise = delayedSurfaceHost.openTab(principal, false)
await new Promise((resolveDelay) => setTimeout(resolveDelay, 400))
assert.equal(delayedSurfaceHost.acknowledge({
    requestId: delayedSurfaceRequests[0].requestId,
    threadId: delayedSurfaceRequests[0].threadId,
    tabId: delayedSurfaceRequests[0].tabId
}), true)
await new Promise((resolveDelay) => setTimeout(resolveDelay, 700))
const delayedOpenedTarget = {
    ...openedTarget,
    targetId: 'zyra-browser:delayed-opened',
    tabId: delayedSurfaceRequests[0].tabId
}
assert.equal(delayedSurfaceHost.completeRegisteredTarget(delayedOpenedTarget), true)
assert.equal((await delayedOpenedPromise).targetId, delayedOpenedTarget.targetId)
delayedSurfaceHost.dispose()

broker.setBrowserSurfaceController({
    openTab: async (_requestPrincipal, reveal) => {
        assert.equal(reveal, true)
        return broker.targets.get(targetId).target as Extract<ControlTarget, { kind: 'zyra-browser' }>
    },
    cancelPending: () => undefined
})
const openedByTool = await tool.execute('visual-open-tab', { operation: 'open_tab', reveal: true })
assert.equal((openedByTool.details as any).target.targetId, targetId)
assert.match(String(openedByTool.content[0]?.text), /no navigation or input authority yet/i)
const modelGrantPromise = tool.execute('visual-request-grant', {
    operation: 'request_grant', targetId, capabilities: ['observe.structure'], maxActions: 2
})
const modelPending = broker.grants.listPending().find((entry) => entry.principal.type === 'root')
assert(modelPending, 'the model tool call must wait while the approval is visible')
const modelGrant = broker.approvePendingGrant({
    pendingRequestId: modelPending.requestId,
    targetId,
    capabilities: modelPending.capabilities,
    durationMs: 30_000,
    maxActions: 2,
    allowedOrigins: modelPending.allowedOrigins
})
const modelGrantResult = await modelGrantPromise
assert.equal((modelGrantResult.details as any).grant.grantId, modelGrant.grantId)
assert.match(String(modelGrantResult.content[0]?.text), new RegExp(modelGrant.grantId))
broker.revokeGrant(modelGrant.grantId, principal)
await assert.rejects(
    broker.handleToolOperation(principal, { operation: 'open_tab', reveal: 'yes' }),
    (error: any) => error.code === 'CONTROL_VALIDATION_ERROR'
)

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
await assert.rejects(
    broker.handleToolOperation(childPrincipal, { operation: 'open_tab', reveal: true }),
    (error: any) => error.code === 'CONTROL_CAPABILITY_DENIED'
)
const discovered = await broker.handleToolOperation(childPrincipal, { operation: 'list_targets', targetKind: 'zyra-browser' })
assert.equal((discovered.targets as unknown[]).length, 1)
assert.equal((discovered.grants as unknown[]).length, 0)
const childGrantPromise = broker.handleToolOperation(childPrincipal, {
    operation: 'request_grant', targetId, capabilities: ['observe.structure', 'observe.screenshot', 'pointer.click'], maxActions: 8
}) as Promise<any>
const childPending = broker.grants.listPending().find((entry) => entry.principal.type === 'agent' && entry.principal.agentRunId === childPrincipal.agentRunId)
assert(childPending, 'the model-facing grant request must remain pending while the tool call waits')
const childGrant = broker.approvePendingGrant({
    pendingRequestId: childPending.requestId,
    targetId,
    capabilities: childPending.capabilities,
    durationMs: 30_000,
    maxActions: 8,
    allowedOrigins: childPending.allowedOrigins
})
const childRequest = await childGrantPromise
assert.equal(childRequest.pending, false)
assert.equal(childRequest.grant.grantId, childGrant.grantId, 'approval must resume the same model tool call with the exact grant')
const attached = await broker.handleToolOperation(childPrincipal, { operation: 'list_targets', targetKind: 'zyra-browser' })
assert.equal((attached.grants as Array<{ grantId: string }>)[0]?.grantId, childGrant.grantId)
const cancelledGrantPromise = broker.handleToolOperation(childPrincipal, {
    operation: 'request_grant', targetId, capabilities: ['observe.structure'], maxActions: 2
})
broker.revokePrincipal(childPrincipal, 'agent finished')
await assert.rejects(cancelledGrantPromise, (error: any) => error.code === 'CONTROL_CANCELLED')
assert.equal(broker.grants.listForPrincipal(childPrincipal).some((entry) => entry.state === 'active'), false)
assert.equal(broker.grants.listPending().some((entry) => entry.principal.type === 'agent' && entry.principal.agentRunId === childPrincipal.agentRunId), false)

await broker.emergencyStop()
assert.equal(broker.state().cursors.length, 0)

const pageSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantPage.tsx', import.meta.url), 'utf8')
const panelSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantDiffPanel.tsx', import.meta.url), 'utf8')
const workspaceSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantBrowserWorkspace.tsx', import.meta.url), 'utf8')
const handlerSource = readFileSync(new URL('../src/main/ipc/handlers/agent-control-handlers.ts', import.meta.url), 'utf8')
const preloadSource = readFileSync(new URL('../src/preload/adapters/agent-control-adapter.ts', import.meta.url), 'utf8')
const protocolSource = readFileSync(new URL('../src/shared/agent-control/protocol.ts', import.meta.url), 'utf8')
const hostSource = readFileSync(new URL('../src/main/agent-control/browser-surface-host.ts', import.meta.url), 'utf8')
const browserDriverSource = readFileSync(new URL('../src/main/agent-control/drivers/zyra-browser-driver.ts', import.meta.url), 'utf8')
const mainSource = readFileSync(new URL('../src/main/index.ts', import.meta.url), 'utf8')
const runtimeSource = readFileSync(new URL('../src/main/assistant/zyra-pi-runtime.ts', import.meta.url), 'utf8')
assert(pageSource.includes('onBrowserSurfaceRequest'))
assert(pageSource.includes('request.threadId !== diffSource.threadId'))
assert(pageSource.includes("if (request.reveal) setRightPanelMode('review')"))
assert(panelSource.includes('processedBrowserSurfaceRequestRef'))
assert(panelSource.includes('surfaceRequest={browserSurfaceRequest}'))
assert(panelSource.includes("'pointer-events-none invisible absolute inset-x-0 bottom-0 top-[76px] flex'"))
assert(workspaceSource.includes('addAssistantBrowserTab(current, surfaceRequest.tabId)'))
assert(workspaceSource.includes('completeBrowserSurfaceRequest({'))
assert(workspaceSource.includes('Allow agent?'))
assert(workspaceSource.includes('rejectGrant(activePendingGrant.requestId)'))
assert(workspaceSource.includes('data-browser-control-owned'))
assert(workspaceSource.includes('Zyra-controlled Browser surface'))
assert(workspaceSource.includes('MousePointer2'))
assert(browserDriverSource.includes("for (const fromSurface of [true, false])"))
assert(browserDriverSource.includes('guest.capturePage()'))
assert(browserDriverSource.includes("await this.command(guest, 'Input.insertText', { text: action.text })"))
assert(mainSource.includes('webPreferences.backgroundThrottling = false'))
assert(runtimeSource.includes("'Root Browser control ended with its turn.'"))
assert(protocolSource.includes("operation: 'open_tab'"))
assert(protocolSource.includes('acknowledgeBrowserSurfaceRequest'))
assert(preloadSource.includes('browserSurfaceRequested'))
assert(preloadSource.includes('acknowledgeBrowserSurfaceRequest'))
assert(handlerSource.includes('assertTrustedRenderer(event, mainWindow)'))
assert(handlerSource.includes('browserSurface.completeRegisteredTarget(target)'))
assert(hostSource.includes("tabId: `browser:agent:${id}`"))
assert(hostSource.includes("phase: 'sent' | 'accepted'"))
console.log('Zyra visual Browser control contract passed.')
