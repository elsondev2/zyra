import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AssistantSessionTurnUsageEntry, FleetSnapshot } from '../src/shared/assistant/contracts'
import type { ControlPendingGrant, ControlStateSnapshot, ControlTarget } from '../src/shared/agent-control/contracts'
import {
    clearBrowserControlApprovalPreferences,
    findRememberedBrowserControlApproval,
    onBrowserControlApprovalPreferencesChange,
    readBrowserControlApprovalPreferences,
    rememberBrowserControlApproval
} from '../src/renderer/src/pages/assistant/assistant-control-approval-preferences'
import {
    countAssistantThreadPendingControl,
    resolveAssistantThreadDetailsNowState,
    selectAssistantThreadControl,
    summarizeAssistantThreadUsage
} from '../src/renderer/src/pages/assistant/assistant-thread-details'
import { AssistantThreadDetailsContext } from '../src/renderer/src/pages/assistant/AssistantThreadDetailsContext'
import { AssistantThreadDetailsComputerUse } from '../src/renderer/src/pages/assistant/AssistantThreadDetailsComputerUse'
import { resolveAssistantFleetSnapshot } from '../src/renderer/src/pages/assistant/useAssistantFleetSnapshot'

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
const computerUseSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantThreadDetailsComputerUse.tsx', import.meta.url), 'utf8')
assert.ok(browserWorkspaceSource.includes('Browser control permission requested'), 'the focused Browser page exposes an approval dialog')
assert.ok(diffPanelSource.includes('attention: pendingForTab > 0'), 'the exact outer Browser tab exposes approval attention')
assert.ok(diffPanelSource.includes("label: 'Thread Details'"), 'Control is rebranded as Thread Details in the Inspector')
assert.ok(diffPanelSource.includes('count: agents.length || undefined'), 'the Agents tab counts all session agents and never presents completed work as zero')
assert.ok(diffPanelSource.includes('countAssistantThreadPendingControl(controlState, threadId)'), 'Thread Details attention is scoped to the selected thread')
assert.ok(controlWorkspaceSource.includes('AssistantThreadDetailsComputerUse'), 'Thread Details keeps computer-use status as a focused sub-surface')
assert.ok(controlWorkspaceSource.includes('repeat(auto-fit,minmax(min(100%,260px),1fr))'), 'Thread Details adapts from one thin column to a compact expanded grid')
assert.equal(computerUseSource.includes('Only activity belonging to this thread appears here.'), false, 'Computer use avoids explanatory text stacked under the section title')
assert.ok(computerUseSource.includes('No active access'), 'Computer use presents idle state as one compact status row')
assert.ok(computerUseSource.includes('Forget sites'), 'remembered-site approvals remain available under computer-use setup')
assert.equal(computerUseSource.includes('AssistantControlAudit'), false, 'the thread surface does not dump the global control audit')
assert.equal(browserWorkspaceSource.includes('google.com'), false, 'no development-only site auto-approval remains')
assert.equal(resolveAssistantThreadDetailsNowState({
    threadState: 'ready',
    latestTurnState: 'completed',
    latestTurnCompletedAt: '2026-08-19T12:00:00.000Z',
    latestActivitySummary: null,
    lastError: null,
    pendingApprovals: 0,
    pendingInputs: 0,
    activeAgents: 0
}).label, 'Ready', 'a selected ready thread does not become Disconnected during a renderer attachment transition')
const fleetFixture = (sequence: number, agentIds: string[]): FleetSnapshot => ({
    version: 1,
    fleetId: 'fleet:test',
    rootSessionId: 'session:test',
    rootThreadId: 'thread:test',
    lastAppliedSequence: sequence,
    updatedAt: new Date(sequence * 1_000).toISOString(),
    agents: Object.fromEntries(agentIds.map((agentRunId) => [agentRunId, { agentRunId, createdAt: new Date(0).toISOString(), status: 'completed' }])) as FleetSnapshot['agents'],
    workflows: {},
    relationships: [],
    artifacts: [],
    eventWindow: [],
    usage: {},
    truncated: { agents: false, workflows: false, relationships: false, artifacts: false, events: false }
})
assert.equal(
    Object.keys(resolveAssistantFleetSnapshot(fleetFixture(2, []), fleetFixture(113, ['agent:1', 'agent:2']))?.agents || {}).length,
    2,
    'an explicit fleet refresh replaces the stale empty startup projection'
)
assert.equal(resolveAssistantThreadDetailsNowState({
    threadState: 'running',
    latestTurnState: 'running',
    latestTurnCompletedAt: null,
    latestActivitySummary: 'Checking the implementation',
    lastError: null,
    pendingApprovals: 0,
    pendingInputs: 0,
    activeAgents: 1
}).label, 'Working now')
assert.deepEqual(resolveAssistantThreadDetailsNowState({
    threadState: 'waiting',
    latestTurnState: 'completed',
    latestTurnCompletedAt: '2026-08-19T12:00:00.000Z',
    latestActivitySummary: null,
    lastError: null,
    pendingApprovals: 0,
    pendingInputs: 0,
    activeAgents: 2
}), {
    label: 'Background work',
    detail: '2 child agents still working',
    tone: 'active'
}, 'canonical background presence remains visible after the root turn settles')

const otherRequest = request({
    requestId: 'control-request:other',
    principal: { type: 'root', threadId: 'thread:other', turnId: 'turn:other' },
    targetId: 'control-target:other'
})
const controlState: ControlStateSnapshot = {
    version: 1,
    targets: [target(), { ...target('https://other.example'), targetId: 'control-target:other', ownerThreadId: 'thread:other' }],
    grants: [],
    pendingGrants: [request(), otherRequest],
    audit: [],
    health: [],
    cursors: [],
    workspace: null,
    pairing: { state: 'stopped' },
    active: true,
    sequence: 1
}
assert.equal(countAssistantThreadPendingControl(controlState, 'thread:test'), 1)
assert.deepEqual(
    selectAssistantThreadControl(controlState, 'thread:test').pendingGrants.map((entry) => entry.requestId),
    ['control-request:test'],
    'computer-use state is isolated to the selected thread'
)

const usageTurns: AssistantSessionTurnUsageEntry[] = [
    {
        id: 'turn:1', sessionId: 'session:test', threadId: 'thread:test', model: 'openai-codex/gpt-5.6-sol', state: 'completed',
        requestedAt: '2026-08-18T10:00:00.000Z', startedAt: '2026-08-18T10:00:01.000Z', completedAt: '2026-08-18T10:01:00.000Z', assistantMessageId: 'message:1',
        usage: { inputTokens: 1_000, outputTokens: 200, reasoningOutputTokens: 100, cachedInputTokens: 9_000, cacheWriteTokens: 0, totalTokens: 10_200, costUsd: 0.02 }, updatedAt: '2026-08-18T10:01:00.000Z'
    },
    {
        id: 'turn:2', sessionId: 'session:test', threadId: 'thread:test', model: 'openai-codex/gpt-5.6-sol', state: 'completed',
        requestedAt: '2026-08-18T10:02:00.000Z', startedAt: '2026-08-18T10:02:01.000Z', completedAt: '2026-08-18T10:03:00.000Z', assistantMessageId: 'message:2',
        usage: { inputTokens: 2_000, outputTokens: 300, reasoningOutputTokens: 120, cachedInputTokens: 18_000, cacheWriteTokens: 0, totalTokens: 20_300, costUsd: 0.03, sessionCostUsd: 0.05, sessionCostComplete: true }, updatedAt: '2026-08-18T10:03:00.000Z'
    },
    {
        id: 'turn:other', sessionId: 'session:test', threadId: 'thread:other', model: 'openai-codex/gpt-5.6-sol', state: 'completed',
        requestedAt: '2026-08-18T10:04:00.000Z', startedAt: null, completedAt: null, assistantMessageId: null,
        usage: { inputTokens: 99_000, outputTokens: 99_000, cachedInputTokens: 99_000, totalTokens: 297_000 }, updatedAt: '2026-08-18T10:04:00.000Z'
    }
]
const usageSummary = summarizeAssistantThreadUsage(usageTurns, 'thread:test', [{ id: 'openai-codex/gpt-5.6-sol', label: 'gpt-5.6-sol', contextWindow: 372_000 }])
assert.equal(usageSummary.inputTokens, 3_000)
assert.equal(usageSummary.outputTokens, 500)
assert.equal(usageSummary.cacheReadTokens, 27_000)
assert.equal(usageSummary.contextWindow, 372_000)
assert.equal(usageSummary.contextLimit, 256_000)
assert.equal(usageSummary.contextTokens, 20_300)
assert.equal(usageSummary.cacheHitPercent, 90)
assert.equal(usageSummary.costUsd, 0.05)
assert.equal(usageSummary.costSource, 'recorded')

const incompleteCostSummary = summarizeAssistantThreadUsage(
    usageTurns.map((turn) => turn.threadId === 'thread:test' && turn.usage
        ? { ...turn, usage: { ...turn.usage, costUsd: null, sessionCostUsd: null, sessionCostComplete: false } }
        : turn),
    'thread:test',
    [{ id: 'openai-codex/gpt-5.6-sol', label: 'gpt-5.6-sol', contextWindow: 372_000 }]
)
assert.equal(incompleteCostSummary.costUsd, null, 'top-level token snapshots cannot masquerade as a complete thread-cost estimate')
assert.equal(incompleteCostSummary.costSource, 'unavailable')
const partialRuntimeCostSummary = summarizeAssistantThreadUsage(
    usageTurns.map((turn) => turn.threadId === 'thread:test' && turn.usage
        ? { ...turn, usage: { ...turn.usage, sessionCostUsd: null, sessionCostComplete: false } }
        : turn),
    'thread:test',
    [],
    { threadId: 'thread:test', costUsd: 40.718, costComplete: false }
)
assert.equal(partialRuntimeCostSummary.costUsd, null, 'a positive runtime subtotal is hidden unless every metered provider response carried cost')
const staleCompletedCostSummary = summarizeAssistantThreadUsage([
    ...usageTurns,
    {
        id: 'turn:3', sessionId: 'session:test', threadId: 'thread:test', model: 'openai-codex/gpt-5.6-sol', state: 'completed',
        requestedAt: '2026-08-18T10:05:00.000Z', startedAt: '2026-08-18T10:05:01.000Z', completedAt: '2026-08-18T10:06:00.000Z', assistantMessageId: 'message:3',
        usage: { inputTokens: 500, outputTokens: 100, totalTokens: 21_000, sessionCostUsd: 0.06, sessionCostComplete: false }, updatedAt: '2026-08-18T10:06:00.000Z'
    }
], 'thread:test')
assert.equal(staleCompletedCostSummary.costUsd, null, 'a newer incomplete session snapshot suppresses an older complete cost')

const footerUsageSummary = summarizeAssistantThreadUsage(
    usageTurns,
    'thread:test',
    [{ id: 'openai-codex/gpt-5.6-sol', label: 'gpt-5.6-sol', contextWindow: 372_000 }],
    {
        threadId: 'thread:test',
        inputTokens: 939_000,
        outputTokens: 88_000,
        reasoningOutputTokens: 12_000,
        cachedInputTokens: 43_000_000,
        cacheWriteTokens: 0,
        totalTokens: 44_027_000,
        contextTokens: 107_508,
        modelContextWindow: 372_000,
        cacheHitPercent: 99.2,
        costUsd: 40.718,
        costComplete: true,
        autoCompactionEnabled: true
    }
)
assert.equal(footerUsageSummary.inputTokens, 939_000)
assert.equal(footerUsageSummary.cacheReadTokens, 43_000_000)
assert.equal(footerUsageSummary.cacheHitPercent, 99.2)
assert.equal(footerUsageSummary.contextLimit, 256_000)
assert.equal(Number(footerUsageSummary.contextPercent?.toFixed(1)), 42)
assert.equal(footerUsageSummary.costUsd, 40.718)

const zeroRuntimeTotalsSummary = summarizeAssistantThreadUsage(
    usageTurns,
    'thread:test',
    [{ id: 'openai-codex/gpt-5.6-sol', label: 'gpt-5.6-sol', contextWindow: 372_000 }],
    {
        threadId: 'thread:test',
        inputTokens: 0,
        outputTokens: 0,
        reasoningOutputTokens: 0,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: 0,
        contextTokens: 254_000,
        modelContextWindow: 372_000,
        cacheHitPercent: 99.6,
        costUsd: 0,
        costComplete: false,
        autoCompactionEnabled: true
    }
)
assert.equal(zeroRuntimeTotalsSummary.inputTokens, 3_000, 'an all-zero runtime snapshot cannot erase persisted usage')
assert.equal(zeroRuntimeTotalsSummary.costUsd, 0.05, 'an all-zero runtime cost cannot replace a non-zero persisted session total')
assert.equal(Number(zeroRuntimeTotalsSummary.contextPercent?.toFixed(1)), 99.2)

const footerMarkup = renderToStaticMarkup(createElement(AssistantThreadDetailsContext, {
    usage: footerUsageSummary,
    loading: false
}))
assert.match(footerMarkup, /42\.0%/)
assert.match(footerMarkup, /compacts at 256k/)
assert.match(footerMarkup, /Estimated model cost/)
assert.match(footerMarkup, /\$40\.72/)
assert.doesNotMatch(footerMarkup, /Input|Output|Cache read|Cache hit|Reasoning|· sub/)

const contextMarkup = renderToStaticMarkup(createElement(AssistantThreadDetailsContext, {
    usage: usageSummary,
    loading: false
}))
assert.match(contextMarkup, /7\.9%/)
assert.match(contextMarkup, /\/ 256k/)
assert.match(contextMarkup, /\$0\.05/)
assert.doesNotMatch(contextMarkup, /372k window|↑ 3\.0k|R 27k|· sub/)

const selectedThreadControl = selectAssistantThreadControl(controlState, 'thread:test')
const computerUseMarkup = renderToStaticMarkup(createElement(AssistantThreadDetailsComputerUse, {
    controlState,
    threadControl: selectedThreadControl
}))
assert.match(computerUseMarkup, /Allow example\.com/)
assert.match(computerUseMarkup, /view the page and click/)
assert.doesNotMatch(computerUseMarkup, /other\.example|control-target:other|observe\.structure/)
const idleComputerUseMarkup = renderToStaticMarkup(createElement(AssistantThreadDetailsComputerUse, {
    controlState: { ...controlState, pendingGrants: [], active: false },
    threadControl: selectAssistantThreadControl({ ...controlState, pendingGrants: [], active: false }, 'thread:test')
}))
assert.match(idleComputerUseMarkup, /Idle/)
assert.match(idleComputerUseMarkup, /No active access/)
assert.match(idleComputerUseMarkup, />Setup</)
assert.doesNotMatch(idleComputerUseMarkup, /Only activity belonging|No computer use is active/)

console.log('Assistant Browser approval preferences passed.')
