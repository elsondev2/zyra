import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
    deriveAssistantRuntimeStatus,
    type AssistantStoreState
} from '../src/renderer/src/lib/assistant/assistant-store-runtime'
import { selectAssistantStoreSession } from '../src/renderer/src/lib/assistant/assistant-store-session-selection'
import type { CachedHydratedThreadState } from '../src/renderer/src/lib/assistant/session-hydration-cache'

function thread(id: string, messageText: string) {
    return {
        id,
        providerThreadId: null,
        source: 'main',
        parentThreadId: null,
        providerParentThreadId: null,
        subagentDepth: 0,
        agentNickname: null,
        agentRole: null,
        model: 'test-model',
        cwd: null,
        messageCount: 1,
        activityCount: 0,
        proposedPlanCount: 0,
        hasActivePlan: false,
        hasPendingApprovals: false,
        hasPendingUserInputs: false,
        lastSeenCompletedTurnId: null,
        runtimeMode: 'approval-required',
        interactionMode: 'default',
        state: 'idle',
        lastError: null,
        createdAt: '2026-07-24T10:00:00.000Z',
        updatedAt: '2026-07-24T10:00:00.000Z',
        latestTurn: null,
        activePlan: null,
        messages: [{
            id: `message-${id}`,
            threadId: id,
            turnId: null,
            role: 'user',
            text: messageText,
            createdAt: '2026-07-24T10:00:00.000Z',
            updatedAt: '2026-07-24T10:00:00.000Z',
            streaming: false
        }],
        proposedPlans: [],
        activities: [],
        pendingApprovals: [],
        pendingUserInputs: []
    }
}

function session(id: string) {
    const activeThread = thread(`thread-${id}`, `content-${id}`)
    return {
        id,
        title: `Chat ${id}`,
        mode: 'work',
        projectPath: null,
        playgroundLabId: null,
        pendingLabRequest: null,
        archived: false,
        createdAt: '2026-07-24T10:00:00.000Z',
        updatedAt: '2026-07-24T10:00:00.000Z',
        activeThreadId: activeThread.id,
        threads: [activeThread]
    }
}

const sessions = [session('a'), session('b'), session('c')]
let state = {
    snapshot: {
        selectedSessionId: 'a',
        sessions,
        knownModels: [],
        playground: { rootPath: null, labs: [] }
    },
    historyByThreadId: {},
    status: {
        available: true,
        connected: true,
        selectedSessionId: 'a',
        activeThreadId: 'thread-a',
        state: 'idle',
        reason: null
    },
    hydrating: false,
    hydrated: true,
    modelsLoading: false,
    commandPending: false,
    pendingCreateSessionInput: null,
    selectionHydrationKey: null,
    selectionTransitionKey: null,
    selectionRequestId: 0,
    selectionRequestSessionId: null,
    error: null
} as unknown as AssistantStoreState

const hydratedThreadCache = new Map<string, CachedHydratedThreadState>()
for (const selectedSession of sessions) {
    const activeThread = selectedSession.threads[0]
    hydratedThreadCache.set(activeThread.id, {
        sessionId: selectedSession.id,
        threadId: activeThread.id,
        activePlan: activeThread.activePlan,
        messages: activeThread.messages,
        proposedPlans: activeThread.proposedPlans,
        activities: activeThread.activities,
        pendingApprovals: activeThread.pendingApprovals,
        pendingUserInputs: activeThread.pendingUserInputs
    })
}

const selectionCalls: string[] = []
const connectionCalls: string[] = []
const hydrationCalls: Array<{ sessionId: string; threadId: string | null }> = []
const originalWindow = (globalThis as { window?: unknown }).window
;(globalThis as any).window = {
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (callback: (time: number) => void) => setTimeout(() => callback(Date.now()), 0),
    devscope: {
        assistant: {
            selectSession: async (sessionId: string) => {
                selectionCalls.push(sessionId)
                return { success: true as const, sessionId }
            },
            connect: async ({ sessionId }: { sessionId: string }) => {
                connectionCalls.push(sessionId)
                return { success: true as const, threadId: `thread-${sessionId}` }
            },
            getStatus: async () => ({
                available: true,
                connected: true,
                selectedSessionId: state.snapshot.selectedSessionId,
                activeThreadId: `thread-${state.snapshot.selectedSessionId}`,
                state: 'idle',
                reason: null
            })
        }
    }
}

function createContext() {
    return {
        state,
        hydratedThreadCache,
        getState: () => state,
        setState: (nextState: Partial<AssistantStoreState> | ((current: AssistantStoreState) => Partial<AssistantStoreState>)) => {
            const partial = typeof nextState === 'function' ? nextState(state) : nextState
            state = { ...state, ...partial }
        },
        requestSessionHydration: async (sessionId: string, threadId: string | null) => {
            hydrationCalls.push({ sessionId, threadId })
        }
    }
}

try {
    const mismatchedStatus = deriveAssistantRuntimeStatus(
        { ...state.snapshot, selectedSessionId: 'b' },
        { ...state.status, connected: true, selectedSessionId: 'a', activeThreadId: 'thread-a' }
    )
    assert.equal(mismatchedStatus.connected, false, 'connection state from the previous chat cannot leak into a newly selected chat')

    const originalSessions = state.snapshot.sessions
    const selectB = selectAssistantStoreSession(createContext(), 'b')
    assert.equal(state.snapshot.selectedSessionId, 'b', 'the target chat becomes selected in the click task')
    assert.equal(state.snapshot.sessions, originalSessions, 'the immediate shell switch does not clone or scan timeline collections')
    assert.equal(state.selectionTransitionKey, 'b:thread-b', 'the target chat gets an explicit pre-paint transition key')
    assert.deepEqual(selectionCalls, [], 'IPC waits until the target shell has had a paint opportunity')
    await selectB
    assert.deepEqual(selectionCalls, ['b'], 'the selected chat is persisted after the shell transition')
    assert.deepEqual(connectionCalls, ['b'], 'the selected chat reconnects without delaying its immediate shell')
    assert.equal(state.status.connected, true, 'the reconnect refreshes authoritative runtime status')
    assert.equal(state.selectionTransitionKey, null, 'the shell transition clears after cached rows are restored')

    selectionCalls.length = 0
    connectionCalls.length = 0
    hydrationCalls.length = 0
    state = {
        ...state,
        snapshot: { ...state.snapshot, selectedSessionId: 'a' },
        status: { ...state.status, selectedSessionId: 'a', activeThreadId: 'thread-a' }
    }
    const supersededB = selectAssistantStoreSession(createContext(), 'b')
    const latestC = selectAssistantStoreSession(createContext(), 'c')
    assert.equal(state.snapshot.selectedSessionId, 'c', 'a second click replaces the first selection immediately')
    await Promise.all([supersededB, latestC])
    assert.deepEqual(selectionCalls, ['c'], 'a superseded chat never reaches the authoritative selection IPC')
    assert.deepEqual(connectionCalls, ['c'], 'only the newest rapid selection reconnects')
    assert.deepEqual(hydrationCalls, [{ sessionId: 'c', threadId: 'thread-c' }], 'only the newest chat requests hydration')
    assert.equal(state.selectionRequestSessionId, null, 'the current selection request releases its event guard after completion')

    const hookSource = readFileSync(new URL('../src/renderer/src/lib/assistant/assistant-store-hooks.ts', import.meta.url), 'utf8')
    const pageSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantPage.tsx', import.meta.url), 'utf8')
    const coreSource = readFileSync(new URL('../src/renderer/src/lib/assistant/assistant-store-core.ts', import.meta.url), 'utf8')
    assert.equal(hookSource.includes('timelineMessages: selectionTransitioning ? []'), true, 'the old timeline is removed during the urgent shell render')
    assert.equal(hookSource.includes('activityFeed: selectionTransitioning ? []'), true, 'old activity rows cannot remain visible during chat switching')
    assert.equal(pageSource.includes('messages: selectionTransitioning ? EMPTY_ASSISTANT_MESSAGES'), true, 'Inspector projections also drop stale chat data immediately')
    assert.equal(coreSource.includes('current.selectionRequestSessionId'), true, 'delayed domain events preserve the newest local chat selection')
    assert.equal(coreSource.includes('previousState.snapshot.sessions !== mergedState.snapshot.sessions'), true, 'selection-only snapshots skip full hydrated-thread cache scans')

    console.log('Assistant immediate session switching contract: ok')
} finally {
    if (originalWindow === undefined) delete (globalThis as any).window
    else (globalThis as any).window = originalWindow
}
