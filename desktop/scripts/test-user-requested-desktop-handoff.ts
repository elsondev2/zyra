// Runtime-to-broker regression. Synthetic driver/worker only; never opens a native app.
import assert from 'node:assert/strict'
import { mock } from 'bun:test'
import { AgentControlBroker } from '../src/main/agent-control/agent-control-broker'
import { FakeControlDriver } from '../src/main/agent-control/drivers/fake-driver'
const noop = () => undefined
let nativeCalls = 0
class PaintDriver extends FakeControlDriver {
    constructor() { super('windows-window') }
    override async openApp(application: string) { nativeCalls++; return { applicationName: application } }
    override async listWindows() { return nativeCalls ? (await super.listWindows()).map(entry => ({ ...entry, applicationName: 'Paint', title: 'Paint' })) : [] }
}
const broker = new AgentControlBroker({ drivers: [new PaintDriver()] })
mock.module('electron-log', () => ({ default: { info: noop, warn: noop, error: noop, debug: noop } }))
mock.module('../src/main/agent-control', () => ({ getAgentControlBroker: () => broker }))
mock.module('electron', () => ({ app: { getPath: () => process.env.TEMP || process.cwd(), isReady: () => true, on: noop, once: noop },
    BrowserWindow: class { static getAllWindows() { return [] } }, screen: { getAllDisplays: () => [] },
    nativeImage: { createFromBuffer: () => ({ isEmpty: () => true }) }, webContents: { fromId: () => null }, safeStorage: { isEncryptionAvailable: () => false } }))
const { ZyraRuntime } = await import('../src/main/assistant/zyra-runtime')
const { createAssistantThread } = await import('../src/main/assistant/service-state')
const { leaveAssistantThreadForNavigation } = await import('../src/main/assistant/service-navigation-runtime')
const runtime = new ZyraRuntime()
let handleControl: any
let finishPrompt!: () => void
let promptPending = new Promise<void>(resolve => { finishPrompt = resolve })
const worker = {
    setControlRequestHandler: (handler: any) => { handleControl = handler }, onEvent: () => noop, isAlive: () => true, flushReplay: noop, dispose: noop,
    request: async (type: string) => type === 'prompt' ? promptPending : { threadId: 'diagnostic-canonical-paint', model: 'fixture-model' }
}
;(runtime as any).checkAvailability = async () => ({ available: true, reason: null })
;(runtime as any).getAgentServerConnection = () => ({ updatePluginAuthority: async () => {}, createWorker: () => worker })
const thread = createAssistantThread('2026-10-17T22:53:34.000Z')
thread.runtimeMode = 'full-access'
try {
    await runtime.connect(thread, process.cwd())
    const context = (runtime as any).sessions.get(thread.id)
    // Merely observing an autonomous/replayed turn does not authorize a handoff.
    context.activeTurnId = 'autonomous-turn'
    runtime.setNavigationBackgrounded(thread.id, true)
    await assert.rejects(() => handleControl({ operation: 'use_app', application: 'Paint', capabilities: ['observe.structure'], userInitiated: true }, new AbortController().signal),
        { code: 'CONTROL_FOREGROUND_REQUIRED' })
    context.activeTurnId = null
    await runtime.sendPrompt(thread.id, 'Open Paint and draw an owl', { turnId: 'diagnostic-user-turn', runtimeMode: 'full-access' })
    // Match the installed log: user selects another chat before the tool runs.
    leaveAssistantThreadForNavigation({ runtime } as any, { ...thread, state: 'running' })
    const access = await handleControl({ operation: 'use_app', application: 'Paint', capabilities: ['observe.structure', 'pointer.click'] }, new AbortController().signal)
    assert.equal(nativeCalls, 1, 'explicit originating request reaches the normal app grant flow after navigation')
    assert.ok(access.grant && access.observation, 'handoff still requires a bounded target grant and initial observation')
    runtime.setNavigationBackgrounded(thread.id, true)
    const observed = await handleControl({ operation: 'observe', targetId: access.grant.targetId, grantId: access.grant.grantId }, new AbortController().signal)
    assert.ok(observed.observation, 'navigation preserves the submitted user turn Windows grant, not just acquisition')
    await assert.rejects(() => handleControl({ operation: 'open_tab', reveal: true }, new AbortController().signal),
        { code: 'CONTROL_FOREGROUND_REQUIRED' }, 'Windows authority does not reveal the Browser workspace')
    finishPrompt()
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.ok(!broker.state().grants.some(grant => grant.state === 'active'), 'turn completion revokes grants')
    await assert.rejects(() => broker.handleToolOperation({ type: 'root', threadId: thread.id, turnId: 'diagnostic-user-turn' },
        { operation: 'use_app', application: 'Paint', capabilities: ['observe.structure'] }, undefined, { backgrounded: true, permissionMode: 'full-access' }),
        { code: 'CONTROL_FOREGROUND_REQUIRED' }, 'completed user turn cannot reuse native handoff authority')
    let failPrompt!: (error: Error) => void
    promptPending = new Promise<void>((_resolve, reject) => { failPrompt = reject })
    await runtime.sendPrompt(thread.id, 'Continue the requested drawing task', { turnId: 'disposed-user-turn', runtimeMode: 'full-access' })
    await new Promise(resolve => setTimeout(resolve, 0))
    failPrompt(new Error('Zyra bridge disposed.'))
    await new Promise(resolve => setTimeout(resolve, 0))
    await assert.rejects(() => broker.handleToolOperation({ type: 'root', threadId: thread.id, turnId: 'disposed-user-turn' },
        { operation: 'open_app', application: 'Paint' }, undefined, { backgrounded: true, permissionMode: 'full-access' }),
        { code: 'CONTROL_FOREGROUND_REQUIRED' }, 'bridge disposal revokes authority even when it clears activeTurnId before finally')
    console.log('User-turn runtime handoff survives navigation, keeps Browser policy, and expires at completion/disposal: ok')
} finally {
    finishPrompt()
    await new Promise(resolve => setTimeout(resolve, 0))
    runtime.dispose()
    await broker.dispose()
}
