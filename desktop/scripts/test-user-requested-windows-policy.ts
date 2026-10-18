import assert from 'node:assert/strict'
import { AgentControlBroker } from '../src/main/agent-control/agent-control-broker'
import { FakeControlDriver } from '../src/main/agent-control/drivers/fake-driver'
import { AgentControlError } from '../src/main/agent-control/control-errors'
import { CONTROL_BOUNDS } from '../src/shared/agent-control/policy'

const root = { type: 'root' as const, threadId: 'thread:user', turnId: 'turn:user' }
const other = { type: 'root' as const, threadId: 'thread:other', turnId: 'turn:other' }
const child = { type: 'agent' as const, fleetId: 'fleet:fixture', agentRunId: 'agent:fixture', parentThreadId: root.threadId }
const options = { backgrounded: true, permissionMode: 'full-access' as const }
const app = { operation: 'use_app' as const, application: 'Paint', capabilities: ['observe.structure' as const, 'pointer.click' as const] }
const tick = () => new Promise<void>(resolve => setImmediate(resolve))
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done }); return { promise, resolve } }

class PaintDriver extends FakeControlDriver {
    constructor() { super('windows-window') }
    override async listWindows() { return (await super.listWindows()).map(entry => ({ ...entry, applicationName: 'Paint', title: 'Paint' })) }
}

// Trusted user-turn provenance never upgrades permissions or leaks to another turn/child.
{
    const broker = new AgentControlBroker({ drivers: [new PaintDriver()] })
    try {
        broker.authorizeUserWindowsTurn(root)
        for (const principal of [other, { ...root, turnId: 'turn:later' }, child]) {
            await assert.rejects(() => broker.handleToolOperation(principal, app, undefined, options),
                { code: principal.type === 'agent' ? 'CONTROL_CAPABILITY_DENIED' : 'CONTROL_FOREGROUND_REQUIRED' })
        }
        assert.throws(() => broker.authorizeUserWindowsTurn(child as any), { code: 'CONTROL_PRINCIPAL_MISMATCH' })
        await assert.rejects(() => broker.handleToolOperation(root, { operation: 'open_tab', reveal: true }, undefined, options), { code: 'CONTROL_FOREGROUND_REQUIRED' })
        const supervised = broker.handleToolOperation(root, app, undefined, { ...options, permissionMode: 'approval-required' })
        await tick()
        const request = broker.state().pendingGrants[0]
        assert.ok(request, 'background handoff still waits for the normal supervised target/capability approval')
        assert.equal(broker.state().grants.filter(grant => grant.state === 'active').length, 0)
        broker.approvePendingGrant({ pendingRequestId: request.requestId, targetId: request.targetId,
            capabilities: request.capabilities, durationMs: 60000, maxActions: 10 })
        const result = await supervised as any
        assert.ok(result.grant && result.observation)
        assert.deepEqual(result.grant.capabilities.sort(), [...app.capabilities].sort())
        broker.revokePrincipal(root)
        await assert.rejects(() => broker.handleToolOperation(root, app, undefined, options), { code: 'CONTROL_FOREGROUND_REQUIRED' })
    } finally { await broker.dispose() }
}

// Root-only child requests must not consume another user's native queue slots.
{
    const gate = deferred()
    class OccupiedDriver extends PaintDriver { override async listWindows() { await gate.promise; return super.listWindows() } }
    const broker = new AgentControlBroker({ drivers: [new OccupiedDriver()] })
    const pending: Promise<unknown>[] = []
    try {
        broker.authorizeUserWindowsTurn(root)
        broker.authorizeUserWindowsTurn(other)
        const selected = await broker.selectWindow('fixture:window')
        pending.push(broker.handleToolOperation(root, { operation: 'list_windows', query: 'Paint' }, undefined, options))
        await tick()
        const invalid = [
            { operation: 'list_windows', query: 'Paint' }, { operation: 'open_app', application: 'Paint' }, app,
            { operation: 'request_grant', windowToken: 'fixture:window', capabilities: ['observe.structure'] },
            { operation: 'request_grant', targetId: selected.targetId, capabilities: ['observe.structure'] }
        ]
        const crowd = Array.from({ length: CONTROL_BOUNDS.maxPendingActionsPerTarget }, (_, index) => broker.handleToolOperation(child, invalid[index % invalid.length], undefined,
            { ...options, backgrounded: false }).catch(error => error))
        pending.push(...crowd)
        let legitimateError: any
        const legitimate = broker.handleToolOperation(other, { operation: 'list_windows', query: 'Paint' }, undefined, options).catch(error => { legitimateError = error })
        pending.push(legitimate)
        await tick()
        assert.notEqual(legitimateError?.code, 'CONTROL_QUEUE_FULL', 'invalid child acquisitions cannot exhaust the shared native lane')
        gate.resolve()
        await legitimate
        for (const error of await Promise.all(crowd)) assert.equal(error.code, 'CONTROL_CAPABILITY_DENIED')
    } finally { gate.resolve(); await broker.dispose(); await Promise.allSettled(pending) }
}

// Aborting after a completed acquisition result still revokes its returned grant.
{
    const broker = new AgentControlBroker({ drivers: [new PaintDriver()] })
    const caller = new AbortController()
    const execute = (broker as any).executeToolOperation.bind(broker)
    ;(broker as any).executeToolOperation = async (...args: any[]) => {
        const result = await execute(...args)
        if (args[1].operation === 'use_app') caller.abort()
        return result
    }
    try {
        broker.authorizeUserWindowsTurn(root)
        await assert.rejects(broker.handleToolOperation(root, app, caller.signal, options), { code: 'CONTROL_CANCELLED' })
        assert.equal(broker.state().grants.filter(grant => grant.state === 'active').length, 0, 'cancelled acquisition result cannot leave active Windows authority')
    } finally { await broker.dispose() }
}

// A selection result arriving after Stop must not recreate revoked authority.
{
    const started = deferred()
    const gate = deferred()
    class SelectingDriver extends PaintDriver {
        override async selectWindow(token: string) { started.resolve(); await gate.promise; return super.selectWindow(token) }
    }
    const broker = new AgentControlBroker({ drivers: [new SelectingDriver()] })
    try {
        broker.authorizeUserWindowsTurn(root)
        const pending = assert.rejects(broker.handleToolOperation(root, app, undefined, options))
        await started.promise
        await broker.emergencyStop()
        gate.resolve()
        await pending
        assert.equal(broker.state().grants.filter(grant => grant.state === 'active').length, 0, 'late native selection cannot issue authority after Stop')
    } finally { gate.resolve(); await broker.dispose() }
}

// One native focus lane serializes different roots, without blocking hidden Browser metadata.
{
    const gate = deferred()
    let entered = 0
    class BusyDriver extends PaintDriver {
        override async listWindows() { entered++; if (entered === 1) await gate.promise; return super.listWindows() }
    }
    const broker = new AgentControlBroker({ drivers: [new BusyDriver()] })
    try {
        broker.authorizeUserWindowsTurn(root)
        broker.authorizeUserWindowsTurn(other)
        const first = broker.handleToolOperation(root, { operation: 'list_windows', query: 'Paint' }, undefined, options)
        await tick()
        const second = broker.handleToolOperation(other, { operation: 'list_windows', query: 'Paint' }, undefined, options)
        let cancellationSettled = false
        const cancelled = assert.rejects(second, { code: 'CONTROL_CANCELLED' }).then(() => { cancellationSettled = true })
        await tick()
        assert.equal(entered, 1, 'other roots cannot enter native discovery while the foreground lane is occupied')
        assert.deepEqual(await broker.handleToolOperation(root, { operation: 'plan_status', planId: 'plan:no-longer-paused' }, undefined, options), { plans: [] })
        await assert.rejects(() => broker.handleToolOperation({ ...root, turnId: 'turn:autonomous' }, app, undefined, options),
            { code: 'CONTROL_FOREGROUND_REQUIRED' }, 'unauthorized work is denied before consuming the occupied lane')
        broker.revokePrincipal(other)
        await tick()
        assert.equal(cancellationSettled, true, 'queued cancellation settles without waiting for the current foreground owner')
        const selectedAutonomous = { ...root, turnId: 'turn:selected-autonomous' }
        const navigationCancelled = assert.rejects(broker.handleToolOperation(selectedAutonomous,
            { operation: 'list_windows', query: 'Paint' }, undefined, { ...options, backgrounded: false }), { code: 'CONTROL_CANCELLED' })
        broker.revokeForegroundPrincipal(selectedAutonomous)
        gate.resolve()
        await first
        await cancelled
        await navigationCancelled
        assert.equal(entered, 1, 'revoked queued turn never reaches the native driver')
        broker.authorizeUserWindowsTurn(other)
        await broker.handleToolOperation(other, { operation: 'list_windows', query: 'Paint' }, undefined, options)
        assert.equal(entered, 2, 'the lane makes progress for a fresh authorized request after cancellation')
    } finally { gate.resolve(); await broker.dispose() }
}

// A cancelled discovery must not launch an app after its await settles.
{
    const gate = deferred()
    let opened = 0
    class DiscoveryDriver extends PaintDriver {
        override async listWindows() { await gate.promise; return [] }
        override async openApp(application: string) { opened++; return { applicationName: application } }
    }
    const broker = new AgentControlBroker({ drivers: [new DiscoveryDriver()] })
    try {
        broker.authorizeUserWindowsTurn(root)
        const pending = broker.handleToolOperation(root, { operation: 'open_app', application: 'Paint' }, undefined, options)
        const cancelled = assert.rejects(pending, { code: 'CONTROL_CANCELLED' })
        await tick()
        broker.revokePrincipal(root)
        gate.resolve()
        await cancelled
        assert.equal(opened, 0, 'no native launch occurs after cancellation during discovery')
    } finally { gate.resolve(); await broker.dispose() }
}

// Running acquisition receives the turn lifetime signal, not only a dequeue check.
{
    const started = deferred()
    const gate = deferred()
    let inputSignal: AbortSignal | undefined
    let effects = 0
    class AcquiringDriver extends PaintDriver {
        override async listWindows() { return [] }
        override async openApp(application: string, signal?: AbortSignal) {
            inputSignal = signal
            started.resolve()
            await gate.promise
            if (signal?.aborted) throw new AgentControlError('CONTROL_CANCELLED', 'Native acquisition cancelled.')
            effects++
            return { applicationName: application }
        }
    }
    const broker = new AgentControlBroker({ drivers: [new AcquiringDriver()] })
    try {
        broker.authorizeUserWindowsTurn(root)
        const pending = assert.rejects(broker.handleToolOperation(root, { operation: 'open_app', application: 'Paint' }, undefined, options), { code: 'CONTROL_CANCELLED' })
        await started.promise
        broker.revokePrincipal(root)
        assert.equal(inputSignal?.aborted, true)
        gate.resolve()
        await pending
        assert.equal(effects, 0)
    } finally { gate.resolve(); await broker.dispose() }
}

// Root cleanup must abort delegated input and side-effect approval, not just revoke its grant.
for (const awaitingApproval of [false, true]) {
    const started = deferred()
    const gate = deferred()
    let inputSignal: AbortSignal | undefined
    let effects = 0
    class DelegatedDriver extends PaintDriver {
        override async act(target: any, action: any, context: any) {
            inputSignal = context.signal
            started.resolve()
            await gate.promise
            if (context.signal?.aborted) throw new AgentControlError('CONTROL_CANCELLED', 'Delegated input cancelled.')
            effects++
            return super.act(target, action, context)
        }
    }
    const broker = new AgentControlBroker({ drivers: [new DelegatedDriver()] })
    const pending: Promise<unknown>[] = []
    try {
        broker.authorizeUserWindowsTurn(root)
        broker.authorizeUserWindowsTurn(other)
        const acquired = await broker.handleToolOperation(root, app, undefined, options) as any
        const parent = acquired.grant
        const lease = broker.delegate({ parentGrantId: parent.grantId, parentPrincipal: root, childPrincipal: child,
            targetId: parent.targetId, capabilities: ['observe.structure', 'pointer.click'], maxActions: 2,
            expiresAt: new Date(Date.now() + 10_000).toISOString(), allowedExecutableIdentities: parent.allowedExecutableIdentities })
        let cancelled = false
        pending.push(broker.handleToolOperation(child, { operation: 'act', version: 1, requestId: 'request:delegated-input',
            grantId: lease.grantId, targetId: lease.targetId, observationRevision: acquired.observation.revision,
            action: { type: 'click', x: 50, y: 50, ...(awaitingApproval ? { sideEffect: 'purchase' } : {}) }
        }, undefined, { permissionMode: 'approval-required' }).catch(error => { assert.equal(error.code, 'CONTROL_CANCELLED'); cancelled = true }))
        await tick()
        if (awaitingApproval) assert.equal(broker.state().pendingActionApprovals.length, 1)
        else await started.promise
        let progressed = false
        pending.push(broker.handleToolOperation(other, { operation: 'list_windows', query: 'Paint' }, undefined, options).then(() => { progressed = true }))
        broker.revokePrincipal(root)
        if (!awaitingApproval) assert.equal(inputSignal?.aborted, true, 'root cleanup reaches the delegated native driver')
        gate.resolve()
        await tick()
        assert.equal(cancelled, true, 'delegated input/approval settles on root cleanup')
        assert.equal(broker.state().pendingActionApprovals.length, 0, 'root cleanup removes child side-effect approval')
        assert.equal(progressed, true, 'unrelated root can acquire the native lane')
        assert.equal(effects, 0, 'no delegated input occurs after root cleanup')
    } finally { gate.resolve(); await broker.dispose(); await Promise.allSettled(pending) }
}

// Stop cancels both a running native request and another root waiting for focus.
{
    const gate = deferred()
    let entered = 0
    class StoppedDriver extends PaintDriver {
        override async listWindows() { entered++; await gate.promise; return super.listWindows() }
    }
    const broker = new AgentControlBroker({ drivers: [new StoppedDriver()] })
    try {
        broker.authorizeUserWindowsTurn(root)
        broker.authorizeUserWindowsTurn(other)
        const first = assert.rejects(broker.handleToolOperation(root, { operation: 'list_windows', query: 'Paint' }, undefined, options), { code: 'CONTROL_CANCELLED' })
        await tick()
        const second = assert.rejects(broker.handleToolOperation(other, app, undefined, options), { code: 'CONTROL_CANCELLED' })
        await broker.emergencyStop()
        gate.resolve()
        await Promise.all([first, second])
        assert.equal(entered, 1)
        await assert.rejects(() => broker.handleToolOperation(root, app, undefined, options), { code: 'CONTROL_FOREGROUND_REQUIRED' })
    } finally { gate.resolve(); await broker.dispose() }
}

// Cancellation during approval cannot produce a late grant/observation.
{
    const broker = new AgentControlBroker({ drivers: [new PaintDriver()] })
    try {
        broker.authorizeUserWindowsTurn(root)
        const pending = assert.rejects(broker.handleToolOperation(root, app, undefined, { ...options, permissionMode: 'approval-required' }), { code: 'CONTROL_CANCELLED' })
        await tick()
        const request = broker.state().pendingGrants[0]
        assert.ok(request)
        broker.revokePrincipal(root)
        await pending
        assert.equal(broker.state().pendingGrants.length, 0)
        assert.equal(broker.state().grants.filter(grant => grant.state === 'active').length, 0)
        assert.throws(() => broker.approvePendingGrant({ pendingRequestId: request.requestId, targetId: request.targetId,
            capabilities: request.capabilities, durationMs: 60000, maxActions: 10 }))
    } finally { await broker.dispose() }
}
console.log('User Windows handoff: exact principal scope, normal approvals, shared focus lane, cancellation and Emergency Stop: ok')
