import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { ControlPendingGrant, ControlTarget } from '../src/shared/agent-control/contracts'
import {
    clearBrowserControlApprovalPreferences,
    findRememberedBrowserControlApproval,
    onBrowserControlApprovalPreferencesChange,
    readBrowserControlApprovalPreferences,
    rememberBrowserControlApproval
} from '../src/renderer/src/pages/assistant/assistant-control-approval-preferences'

const values = new Map<string, string>()
const listeners = new Map<string, Set<(event: Event) => void>>()
const localStorageFixture = {
    get length() { return values.size },
    clear() { values.clear() },
    getItem(key: string) { return values.get(key) ?? null },
    key(index: number) { return [...values.keys()][index] ?? null },
    removeItem(key: string) { values.delete(key) },
    setItem(key: string, value: string) { values.set(key, String(value)) }
}
const windowFixture = {
    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        const callback = typeof listener === 'function' ? listener : (event: Event) => listener.handleEvent(event)
        const bucket = listeners.get(type) || new Set<(event: Event) => void>()
        bucket.add(callback)
        listeners.set(type, bucket)
    },
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        if (typeof listener === 'function') listeners.get(type)?.delete(listener)
    },
    dispatchEvent(event: Event) {
        for (const listener of listeners.get(event.type) || []) listener(event)
        return true
    }
}
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: localStorageFixture })
Object.defineProperty(globalThis, 'window', { configurable: true, value: windowFixture })
if (typeof globalThis.CustomEvent !== 'function') {
    Object.defineProperty(globalThis, 'CustomEvent', {
        configurable: true,
        value: class CustomEventFixture extends Event {}
    })
}

const expiresAt = () => new Date(Date.now() + 15 * 60 * 1000).toISOString()
const request = (overrides: Partial<ControlPendingGrant> = {}): ControlPendingGrant => ({
    requestId: 'control-request:test',
    principal: { type: 'root', threadId: 'thread:test', turnId: 'turn:test' },
    targetId: 'control-target:test',
    capabilities: ['observe.structure', 'pointer.click'],
    requestedAt: new Date().toISOString(),
    expiresAt: expiresAt(),
    maxActions: 12,
    allowedOrigins: ['https://example.com'],
    screenshots: false,
    ...overrides
})
const target = (origin = 'https://example.com'): Extract<ControlTarget, { kind: 'zyra-browser' }> => ({
    kind: 'zyra-browser',
    targetId: 'control-target:test',
    tabId: 'browser:test',
    ownerThreadId: 'thread:test',
    guestIdentity: 'guest:test',
    origin
})

clearBrowserControlApprovalPreferences()
let changeCount = 0
const unsubscribe = onBrowserControlApprovalPreferencesChange(() => { changeCount += 1 })
rememberBrowserControlApproval({
    request: request(),
    target: target(),
    capabilities: ['observe.structure', 'pointer.click', 'navigate'],
    maxActions: 30,
    durationMs: 60 * 60 * 1000
})
const stored = readBrowserControlApprovalPreferences()
assert.equal(stored.length, 1)
assert.deepEqual(stored[0]?.capabilities, ['observe.structure', 'pointer.click'], 'remembered capabilities cannot exceed the pending request')
assert.equal(stored[0]?.maxActions, 12, 'remembered action budget cannot exceed the pending request')
assert.ok((stored[0]?.durationMs || 0) <= 15 * 60 * 1000, 'remembered duration cannot exceed the pending request lifetime')
assert.ok(findRememberedBrowserControlApproval(request({ capabilities: ['observe.structure'] }), target()))
assert.equal(findRememberedBrowserControlApproval(request({ capabilities: ['observe.structure', 'keyboard.type'] }), target()), null, 'remembered approval cannot widen capabilities')
assert.equal(findRememberedBrowserControlApproval(request(), target('https://other.example')), null, 'remembered approval is exact-origin')
assert.equal(findRememberedBrowserControlApproval(request({ allowedOrigins: ['https://example.com', 'https://cdn.example.com'] }), target()), null, 'multi-origin requests are never auto-approved')
assert.equal(findRememberedBrowserControlApproval(request({
    principal: { type: 'agent', fleetId: 'fleet:test', agentRunId: 'agent:test', parentThreadId: 'thread:test' }
}), target()), null, 'child agents cannot use remembered approvals')

clearBrowserControlApprovalPreferences()
assert.equal(readBrowserControlApprovalPreferences().length, 0)
assert.ok(changeCount >= 2, 'remember and clear publish preference changes')
unsubscribe()

const browserWorkspaceSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantBrowserWorkspace.tsx', import.meta.url), 'utf8')
const diffPanelSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantDiffPanel.tsx', import.meta.url), 'utf8')
const controlWorkspaceSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantControlWorkspace.tsx', import.meta.url), 'utf8')
assert.ok(browserWorkspaceSource.includes('tabNeedsAttention'), 'the exact Browser tab exposes pending approval attention')
assert.ok(browserWorkspaceSource.includes('Browser control permission requested'), 'the focused Browser page exposes an approval dialog')
assert.ok(diffPanelSource.includes('pendingBrowserCount') && diffPanelSource.includes('attention: pendingBrowserCount > 0'), 'the outer Browser tab exposes approval attention')
assert.ok(controlWorkspaceSource.includes('Forget sites'), 'remembered-site approvals have a visible clearing control')
assert.equal(browserWorkspaceSource.includes('google.com'), false, 'no development-only site auto-approval remains')

console.log('Assistant Browser approval preferences passed.')
