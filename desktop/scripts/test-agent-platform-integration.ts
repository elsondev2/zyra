import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { AgentFleetController } from '../../src/agents/runtime/fleet-controller.mjs'
import { AgentControlBroker } from '../src/main/agent-control/agent-control-broker'
import { FakeControlDriver } from '../src/main/agent-control/drivers/fake-driver'
import type { ControlPrincipal } from '../src/shared/agent-control/contracts'

const project = await mkdtemp(path.join(os.tmpdir(), 'zyra-agent-platform-integration-'))
const rootPrincipal = { type: 'root' as const, threadId: 'thread:integration', turnId: 'turn:integration' }
const driver = new FakeControlDriver('zyra-browser')
const broker = new AgentControlBroker({ drivers: [driver] })
const targetId = broker.targets.createTargetId('zyra-browser')
broker.registerTarget({
    target: { kind: 'zyra-browser', targetId, tabId: 'browser:integration', guestIdentity: 'guest:integration', origin: 'http://127.0.0.1' },
    driver,
    trustedIdentity: {}
})

function issueRootGrant(maxActions = 6) {
    const pending = broker.requestGrant({
        principal: rootPrincipal,
        targetId,
        capabilities: ['observe.structure', 'pointer.click'],
        durationMs: 60_000,
        maxActions,
        allowedOrigins: ['http://127.0.0.1']
    })
    return broker.approvePendingGrant({
        pendingRequestId: pending.requestId,
        targetId,
        capabilities: pending.capabilities,
        durationMs: 60_000,
        maxActions,
        allowedOrigins: pending.allowedOrigins
    })
}

const bridge = {
    async request(operation: Record<string, unknown>, options: { principal?: ControlPrincipal; signal?: AbortSignal } = {}) {
        return broker.handleToolOperation(options.principal || rootPrincipal, operation, options.signal)
    },
    forPrincipal(principal: ControlPrincipal) {
        return Object.freeze({
            request: (operation: Record<string, unknown>, options: { signal?: AbortSignal } = {}) => bridge.request(operation, { ...options, principal })
        })
    }
}

const catalog = [{
    key: 'openai-codex/gpt-5.6-terra', provider: 'openai-codex', id: 'gpt-5.6-terra',
    model: { provider: 'openai-codex', id: 'gpt-5.6-terra' }, eligible: true, authenticated: true,
    availability: 'available', rejectionReasons: [], contextWindow: 256000, reasoning: true, toolUse: true, tier: 'terra'
}]

let observedChildPrincipal: ControlPrincipal | undefined
const runner = {
    async run(run: Record<string, any>, options: Record<string, any>) {
        assert(run.tools.includes('browser_control'))
        const childClient = options.controlClient
        const visible = await childClient.request({ operation: 'list_targets', targetKind: 'zyra-browser' })
        assert.deepEqual(visible.targets.map((target: { targetId: string }) => target.targetId), [targetId])
        let grantId = options.controlLease?.grantId
        if (run.goal === 'request browser on demand') {
            assert.equal(options.controlLease, undefined)
            const requested = await childClient.request({
                operation: 'request_grant', targetId, capabilities: ['observe.structure'], maxActions: 3
            })
            assert.equal(requested.pending, true)
            const childGrant = broker.approvePendingGrant({
                pendingRequestId: requested.request.requestId,
                targetId,
                capabilities: requested.request.capabilities,
                durationMs: 30_000,
                maxActions: 3,
                allowedOrigins: requested.request.allowedOrigins
            })
            grantId = childGrant.grantId
            observedChildPrincipal = childGrant.principal
        } else {
            assert.equal(options.controlLease?.issuedBy, 'delegated-parent')
            observedChildPrincipal = options.controlLease.principal
        }
        const observed = await childClient.request({
            operation: 'observe', grantId, targetId
        }, { signal: options.signal })
        assert.equal(observed.observation.targetId, targetId)
        const sessionFile = path.join(project, `${run.agentRunId}.jsonl`)
        await writeFile(sessionFile, '')
        const host = { dispose() {}, async send() {} }
        await options.onLinked({ host, sessionId: `session:${run.agentRunId}`, sessionFile })
        if (run.goal === 'wait for cancellation') {
            if (options.signal.aborted) throw abortError()
            await new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(abortError()), { once: true }))
        }
        return { host, sessionId: `session:${run.agentRunId}`, sessionFile, text: 'delegated observation complete', usage: {} }
    }
}

const controller = new AgentFleetController({
    project,
    rootSessionId: 'root-integration',
    rootThreadId: rootPrincipal.threadId,
    fleetId: 'fleet-integration',
    modelCatalog: catalog,
    runner,
    controlBridgeClient: bridge
})
await controller.initialize({ installRoot: path.resolve('.') })

const parentGrant = issueRootGrant()
const completedSpawn = await controller.spawn({
    prompt: 'observe the delegated browser target',
    model: 'terra',
    tools: ['read', 'browser_control'],
    capabilities: ['observe.structure'],
    controlLease: {
        parentGrantId: parentGrant.grantId,
        targetId,
        capabilities: ['observe.structure'],
        expiresAt: new Date(Date.now() + 30_000).toISOString(),
        maxActions: 2,
        allowedOrigins: ['http://127.0.0.1']
    },
    background: true
})
const completed = await controller.wait(completedSpawn.agentRunId)
assert.equal(completed.status, 'completed')
assert.equal(completed.controlLease?.targetId, targetId)
assert.equal(observedChildPrincipal?.type, 'agent')
await waitFor(() => controller.status(completedSpawn.agentRunId).controlLease?.state === 'revoked')
const completedLease = broker.grants.list().find((grant) => grant.principal.type === 'agent' && grant.principal.agentRunId === completedSpawn.agentRunId)
assert.equal(completedLease?.state, 'revoked')
assert.equal(broker.grants.list().find((grant) => grant.grantId === parentGrant.grantId)?.actionCount, 1, 'child actions consume the parent action budget')

const onDemandSpawn = await controller.spawn({
    prompt: 'request browser on demand',
    model: 'terra',
    tools: ['read'],
    background: true
})
const onDemand = await controller.wait(onDemandSpawn.agentRunId)
assert.equal(onDemand.status, 'completed')
assert(onDemand.tools.includes('browser_control'))
await waitFor(() => broker.grants.list().some((grant) => grant.principal.type === 'agent' && grant.principal.agentRunId === onDemandSpawn.agentRunId && grant.state === 'revoked'))
const onDemandGrant = broker.grants.list().find((grant) => grant.principal.type === 'agent' && grant.principal.agentRunId === onDemandSpawn.agentRunId)
assert.equal(onDemandGrant?.state, 'revoked')
assert.equal(broker.grants.listPending().some((request) => request.principal.type === 'agent' && request.principal.agentRunId === onDemandSpawn.agentRunId), false)

const cancellationParent = issueRootGrant()
const cancellableSpawn = await controller.spawn({
    prompt: 'wait for cancellation',
    model: 'terra',
    tools: ['browser_control'],
    controlLease: {
        parentGrantId: cancellationParent.grantId,
        targetId,
        capabilities: ['observe.structure'],
        expiresAt: new Date(Date.now() + 30_000).toISOString(),
        maxActions: 2,
        allowedOrigins: ['http://127.0.0.1']
    },
    background: true
})
await waitFor(() => controller.status(cancellableSpawn.agentRunId).status === 'running')
await controller.stop(cancellableSpawn.agentRunId, 'integration cancellation')
const cancelled = await controller.wait(cancellableSpawn.agentRunId)
assert.equal(cancelled.status, 'cancelled')
await waitFor(() => controller.status(cancellableSpawn.agentRunId).controlLease?.state === 'revoked')
const cancelledLease = broker.grants.list().find((grant) => grant.principal.type === 'agent' && grant.principal.agentRunId === cancellableSpawn.agentRunId)
assert.equal(cancelledLease?.state, 'revoked')

await controller.dispose()
await broker.dispose()
await rm(project, { recursive: true, force: true })
console.log('Agent platform delegated-control integration passed.')

function abortError() {
    const error = new Error('cancelled')
    error.name = 'AbortError'
    return error
}

async function waitFor(predicate: () => boolean, timeoutMs = 2_000) {
    const deadline = Date.now() + timeoutMs
    while (!predicate()) {
        if (Date.now() >= deadline) throw new Error('Timed out waiting for integrated fleet/control state.')
        await new Promise((resolve) => setTimeout(resolve, 10))
    }
}
