import assert from 'node:assert/strict'
import type {
    AssistantRuntimeStatus,
    AssistantSnapshot,
    AssistantThread
} from '../src/shared/assistant/contracts'
import { deriveAssistantRuntimeStatus } from '../src/renderer/src/lib/assistant/assistant-store-runtime'
import { shouldAutoReconnectAssistantOnStartup } from '../src/renderer/src/lib/assistant/assistant-runtime-preferences'
import { getAssistantThreadPhase } from '../src/renderer/src/lib/assistant/selectors'
import { shouldAutoReconnectAssistantThread } from '../src/renderer/src/pages/assistant/assistant-connection-recovery-policy'
import { resolveCanonicalPresenceThreadState } from '../src/main/assistant/service-canonical-presence'

const now = '2026-07-10T08:00:00.000Z'
const sessionId = 'startup-session'
const threadId = 'startup-thread'

const thread: AssistantThread = {
    id: threadId,
    providerThreadId: 'provider-startup-thread',
    source: 'main',
    parentThreadId: null,
    providerParentThreadId: null,
    subagentDepth: null,
    agentNickname: null,
    agentRole: null,
    model: 'openai-codex/gpt-5.5',
    cwd: 'C:\\workspace',
    messageCount: 1,
    lastSeenCompletedTurnId: null,
    runtimeMode: 'approval-required',
    interactionMode: 'default',
    state: 'ready',
    lastError: null,
    createdAt: now,
    updatedAt: now,
    latestTurn: null,
    activePlan: null,
    messages: [],
    proposedPlans: [],
    activities: [],
    pendingApprovals: [],
    pendingUserInputs: []
}

const snapshot: AssistantSnapshot = {
    snapshotSequence: 12,
    updatedAt: now,
    selectedSessionId: sessionId,
    playground: { rootPath: null, labs: [] },
    sessions: [{
        id: sessionId,
        title: 'Restored chat',
        mode: 'work',
        projectPath: 'C:\\workspace',
        playgroundLabId: null,
        pendingLabRequest: null,
        archived: false,
        createdAt: now,
        updatedAt: now,
        activeThreadId: threadId,
        threadIds: [threadId],
        threads: [thread]
    }],
    knownModels: [{ id: 'openai-codex/gpt-5.5', label: 'gpt-5.5' }]
}

const disconnectedStatus: AssistantRuntimeStatus = {
    available: true,
    connected: false,
    selectedSessionId: sessionId,
    activeThreadId: threadId,
    state: 'disconnected',
    reason: null
}

const connectedStatus: AssistantRuntimeStatus = {
    ...disconnectedStatus,
    connected: true,
    state: 'ready'
}

const connectCalls: Array<{ sessionId?: string } | undefined> = []
const disconnectCalls: Array<string | undefined> = []

;(globalThis as typeof globalThis & { window: unknown }).window = {
    devscope: {
        assistant: {
            bootstrap: async () => ({ snapshot, status: disconnectedStatus }),
            connect: async (options?: { sessionId?: string }) => {
                connectCalls.push(options)
                return { success: true as const, threadId }
            },
            disconnect: async (targetSessionId?: string) => {
                disconnectCalls.push(targetSessionId)
                return { success: true as const }
            },
            getStatus: async () => connectedStatus,
            listModels: async () => ({ success: true as const, models: snapshot.knownModels }),
            onEvent: () => () => undefined
        }
    },
    requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0),
    cancelAnimationFrame: (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer),
    setTimeout,
    clearTimeout
}

const { assistantStore } = await import('../src/renderer/src/lib/assistant/assistant-store-core')

assistantStore.retain()

const deadline = Date.now() + 2_000
while (!assistantStore.getState().hydrated && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5))
}

const state = assistantStore.getState()
assistantStore.release()

assert.equal(state.hydrated, true, 'assistant store should finish bootstrap hydration')
assert.deepEqual(
    connectCalls,
    [{ sessionId }],
    'cold bootstrap should connect the restored selected session exactly once'
)
assert.deepEqual(disconnectCalls, [], 'cold bootstrap should not disconnect before its first connection attempt')
assert.equal(state.status.connected, true, 'store status should be connected after startup restoration')
assert.equal(state.status.activeThreadId, threadId)
assert.equal(
    deriveAssistantRuntimeStatus(snapshot, disconnectedStatus).connected,
    false,
    'persisted ready state must not masquerade as a live runtime connection'
)
assert.equal(
    shouldAutoReconnectAssistantThread({ threadState: 'ready', hasRecoverableIssue: false }),
    true,
    'a dropped live runtime should reconnect when its persisted thread is ready'
)
assert.equal(shouldAutoReconnectAssistantOnStartup(), true, 'startup reconnect should remain enabled by default')
;(globalThis as any).window.localStorage = {
    getItem: () => JSON.stringify({ assistantAutoReconnect: false })
}
assert.equal(shouldAutoReconnectAssistantOnStartup(), false, 'the persisted connection setting should disable startup reconnect')

assert.equal(
    shouldAutoReconnectAssistantThread({ threadState: 'stopped', hasRecoverableIssue: false }),
    false,
    'an intentional in-session disconnect should remain stopped'
)

const readyPresence = {
    state: 'ready' as const,
    activeTurnId: null,
    clients: [{ clientId: 'desktop:test', surface: 'desktop' }],
    backgroundWorkActive: false
}
assert.equal(
    resolveCanonicalPresenceThreadState({ currentState: 'starting', presence: readyPresence }),
    'ready',
    'canonical ready presence should clear a stale Desktop starting state even when the runtime object still exists'
)
assert.equal(
    getAssistantThreadPhase({ ...thread, state: 'starting', canonicalPresence: readyPresence }).key,
    'ready',
    'the renderer should trust canonical ready presence instead of showing Connecting forever'
)
assert.equal(
    getAssistantThreadPhase({
        ...thread,
        state: 'running',
        latestTurn: {
            id: 'stale-turn',
            state: 'running',
            requestedAt: now,
            startedAt: now,
            completedAt: null,
            model: thread.model,
            interactionMode: 'default',
            usage: null,
            updatedAt: now
        },
        canonicalPresence: { ...readyPresence, state: 'detached', clients: [] }
    }).key,
    'stale',
    'a detached canonical worker must not be presented as live work'
)

console.log('Assistant startup connection: ok')
