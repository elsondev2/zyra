import assert from 'node:assert/strict'
import { AgentControlBroker } from '../src/main/agent-control/agent-control-broker'
import { FakeControlDriver } from '../src/main/agent-control/drivers/fake-driver'
import type { DriverObservationOptions } from '../src/main/agent-control/drivers/driver'
import type { RegisteredControlTarget } from '../src/main/agent-control/target-registry'

class CriticalControlDriver extends FakeControlDriver {
    async observe(target: RegisteredControlTarget, options: DriverObservationOptions) {
        const observation = await super.observe(target, options)
        observation.elements.push({
            elementRef: 'fixture:purchase', role: 'button', name: 'Confirm purchase', actions: ['click'],
            bounds: { x: 100, y: 100, width: 80, height: 30 }
        })
        return observation
    }
}

const browserDriver = new CriticalControlDriver()
const windowsDriver = new CriticalControlDriver('windows-window')
const broker = new AgentControlBroker({ drivers: [browserDriver, windowsDriver] })
const fullAccessSignal = AbortSignal.timeout(10_000)
const principal = { type: 'root' as const, threadId: 'thread:full-access', turnId: 'turn:full-access' }
const targetId = broker.targets.createTargetId('zyra-browser')
broker.registerTarget({
    target: { kind: 'zyra-browser', targetId, tabId: 'browser:fixture', ownerThreadId: principal.threadId, guestIdentity: 'guest:fixture', origin: 'http://127.0.0.1' },
    driver: browserDriver, trustedIdentity: {}
})
let approvals = 0
try {
    const access = await broker.handleToolOperation(principal, {
        operation: 'request_grant', targetId, capabilities: ['observe.structure', 'pointer.click', 'keyboard.type'],
        durationMs: 60_000, maxActions: 16
    }, fullAccessSignal, { permissionMode: 'full-access' }) as any
    let observation = await broker.observe(principal, access.grant.grantId, targetId)
    for (const sideEffect of ['none', 'purchase'] as const) {
        const result = await broker.handleToolOperation(principal, {
            operation: 'act', version: 1, requestId: `act:${sideEffect}`, grantId: access.grant.grantId, targetId,
            observationRevision: observation.revision,
            action: { type: 'click', elementRef: 'fixture:purchase', sideEffect }
        }, fullAccessSignal, { permissionMode: 'full-access' }) as any
        assert.equal(result.outcome, 'completed')
        observation = result.observation
    }
    const staged = await broker.handleToolOperation(principal, {
        operation: 'perform', version: 1, requestId: 'stage:full-access', grantId: access.grant.grantId, targetId,
        observationRevision: observation.revision,
        stage: { summary: 'Exercise a synthetic critical control', expectedActivity: 'pointer' },
        steps: [{ type: 'click', elementRef: 'fixture:purchase', sideEffect: 'purchase' }],
        observationMode: 'structure', includeScreenshot: false
    }, fullAccessSignal, { permissionMode: 'full-access' }) as any
    assert.equal(staged.outcome, 'completed')
    observation = staged.observation
    assert.equal(approvals, 0, 'Full access never creates critical single-action or staged-action approvals')

    await assert.rejects(() => broker.handleToolOperation(principal, {
        operation: 'act', version: 1, requestId: 'untrusted:mode', grantId: access.grant.grantId, targetId,
        permissionMode: 'full-access', observationRevision: observation.revision,
        action: { type: 'click', elementRef: 'fixture:purchase', sideEffect: 'none' }
    }), /external side effect/, 'model-supplied mode fields cannot enable Full access')

    const deniedAction = broker.handleToolOperation(principal, {
        operation: 'act', version: 1, requestId: 'supervised:critical', grantId: access.grant.grantId, targetId,
        observationRevision: observation.revision,
        action: { type: 'click', elementRef: 'fixture:button', sideEffect: 'purchase' }
    }, undefined, { permissionMode: 'approval-required' })
    const declined = assert.rejects(() => deniedAction, /declined/)
    await new Promise(resolve => setImmediate(resolve))
    const pending = broker.state().pendingActionApprovals[0]
    if (pending) { approvals += 1; broker.rejectPendingAction(pending.requestId) }
    await declined
    assert.equal(approvals, 1, 'Supervised still requests explicit side-effect approval')

    const windows = await broker.handleToolOperation(principal, {
        operation: 'use_app', application: 'Fixture', durationMs: 60_000, maxActions: 8,
        capabilities: ['observe.structure', 'pointer.click'], requestId: 'use-app:full-access',
        steps: [{ type: 'click', role: 'button', name: 'Confirm purchase', sideEffect: 'none' }]
    }, fullAccessSignal, { permissionMode: 'full-access' }) as any
    assert.equal(windows.sequence.completedSteps, 1)
    const coordinate = await broker.handleToolOperation(principal, {
        operation: 'act_sequence', version: 1, requestId: 'sequence:full-access',
        grantId: windows.grant.grantId, targetId: windows.grant.targetId,
        observationRevision: windows.observation.revision,
        steps: [{ type: 'click_point', x: 120, y: 110, sideEffect: 'none' }]
    }, fullAccessSignal, { permissionMode: 'full-access' }) as any
    assert.equal(coordinate.completedSteps, 1)
    assert.equal(approvals, 1, 'embedded and coordinate sequences do not introduce Full access prompts')
    assert.equal(broker.state().pendingGrants.length, 0)
    assert.equal(broker.state().pendingActionApprovals.length, 0)
} finally {
    broker.dispose()
}
console.log('Agent control Full access: trusted mode propagation and zero approvals passed.')
