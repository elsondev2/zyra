import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
    deriveAssistantRuntimeStatus,
    type AssistantStoreState
} from '../src/renderer/src/lib/assistant/assistant-store-runtime'
import { selectAssistantStoreSession } from '../src/renderer/src/lib/assistant/assistant-store-session-selection'
import { cacheHydratedThreads, hasCachedSessionSelection, type CachedHydratedThreadState } from '../src/renderer/src/lib/assistant/session-hydration-cache'
import { resolveAssistantThreadStatusPill } from '../src/renderer/src/pages/assistant/assistant-sessions-rail-utils'
import { getAssistantThreadHydrationRevision } from '../src/renderer/src/lib/assistant/assistant-thread-hydration-revision'

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
        revision: getAssistantThreadHydrationRevision(activeThread),
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
        },
        warmSessionConnection: (sessionId: string, threadId: string) => {
            connectionCalls.push(sessionId)
            state = {
                ...state,
                status: {
                    available: true,
                    connected: true,
                    selectedSessionId: sessionId,
                    activeThreadId: threadId,
                    state: 'idle',
                    reason: null
                }
            }
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
    assert.equal(state.selectionTransitionKey, null, 'a cached target chat renders without an intervening empty-shell paint')
    const switchingThread = state.snapshot.sessions.find((entry) => entry.id === 'b')!.threads[0]
    assert.equal(switchingThread.messages[0]?.text, 'content-b', 'cached target rows are available in the click task')
    const switchingPill = resolveAssistantThreadStatusPill(switchingThread, true, undefined, {
        connecting: Boolean(state.commandPending && !['starting', 'running', 'waiting'].includes(switchingThread.state))
    })
    assert.notEqual(switchingPill?.label, 'Connecting', 'selecting an idle chat must not classify it as active work')
    assert.deepEqual(selectionCalls, [], 'authoritative selection waits one microtask so a same-task newer click can supersede it')
    await selectB
    assert.deepEqual(selectionCalls, ['b'], 'the selected chat is persisted after the shell transition')
    assert.deepEqual(connectionCalls, [], 'opening a settled chat does not attach or start its provider runtime')
    assert.equal(state.status.connected, false, 'selection remains a read-only shell transition until the user sends')
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
    assert.deepEqual(connectionCalls, [], 'rapid history navigation remains read-only and never starts provider sessions')
    assert.deepEqual(hydrationCalls, [{ sessionId: 'c', threadId: 'thread-c' }], 'only the newest chat requests hydration')
    assert.equal(state.selectionRequestSessionId, null, 'the current selection request releases its event guard after completion')

    const hookSource = readFileSync(new URL('../src/renderer/src/lib/assistant/assistant-store-hooks.ts', import.meta.url), 'utf8')
    const pageSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantPage.tsx', import.meta.url), 'utf8')
    const coreSource = readFileSync(new URL('../src/renderer/src/lib/assistant/assistant-store-core.ts', import.meta.url), 'utf8')
    const agentInboxSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantAgentInboxSidebar.tsx', import.meta.url), 'utf8')
    const legacyRailSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantChatSessionsRail.tsx', import.meta.url), 'utf8')
    const serviceSource = readFileSync(new URL('../src/main/assistant/service.ts', import.meta.url), 'utf8')
    assert.equal(hookSource.includes('timelineMessages: selectionTransitioning ? []'), true, 'the old timeline is removed during the urgent shell render')
    assert.equal(hookSource.includes('activityFeed: selectionTransitioning ? []'), true, 'old activity rows cannot remain visible during chat switching')
    assert.equal(pageSource.includes('messages: selectionTransitioning ? EMPTY_ASSISTANT_MESSAGES'), true, 'Inspector projections also drop stale chat data immediately')
    assert.equal(coreSource.includes('current.selectionRequestSessionId'), true, 'delayed domain events preserve the newest local chat selection')
    assert.equal(coreSource.includes('previousState.snapshot.sessions !== mergedState.snapshot.sessions'), true, 'selection-only snapshots skip full hydrated-thread cache scans')
    const threadSelectionSource = coreSource.split('async selectThread')[1]?.split('async deletePlaygroundLab')[0] || ''
    assert.match(threadSelectionSource, /selectionRequestId[\s\S]{0,6000}restorePreviousSelection/, 'sub-thread selection uses a latest-intent transaction with rollback')
    assert.match(serviceSource, /navigationSelectionGeneration[\s\S]{0,1200}generation !== this\.navigationSelectionGeneration/, 'main-process navigation rejects a superseded selection after asynchronous Voice cleanup')
    assert.equal(agentInboxSource.includes('props.commandPending && !isThreadBusy'), false, 'Agent Inbox selection pending cannot masquerade as active work')
    assert.equal(agentInboxSource.includes('if (item.active || item.status !== \'ready\') return false'), false, 'opening a settled chat cannot remove it from Settled without new activity')
    assert.equal(legacyRailSource.includes('commandPending && !isThreadBusy'), false, 'legacy sidebar selection pending cannot masquerade as active work')

    const manySessions = Array.from({ length: 16 }, (_, index) => session(`cache-${index}`))
    const boundedCache = new Map<string, CachedHydratedThreadState>()
    cacheHydratedThreads(boundedCache, {
        ...state.snapshot,
        selectedSessionId: manySessions[15]!.id,
        sessions: manySessions
    })
    assert.equal(boundedCache.size, 12, 'hydrated renderer history uses a bounded recent-chat cache')
    assert.equal(boundedCache.has(manySessions[15]!.activeThreadId), true, 'the selected chat is protected from history-cache eviction')

    const staleCache = new Map(hydratedThreadCache)
    const staleSessionB = state.snapshot.sessions.find((entry) => entry.id === 'b')!
    const staleThreadB = {
        ...staleSessionB.threads[0]!,
        updatedAt: '2026-07-24T10:01:00.000Z',
        messageCount: 0,
        messages: []
    }
    const staleSnapshot = {
        ...state.snapshot,
        sessions: state.snapshot.sessions.map((entry) => entry.id === 'b'
            ? { ...entry, threads: [staleThreadB] }
            : entry)
    }
    cacheHydratedThreads(staleCache, staleSnapshot)
    assert.equal(hasCachedSessionSelection(staleSnapshot, 'b', staleThreadB.id, staleCache), false, 'newer shell metadata invalidates stale hydrated rows')

    console.log('Assistant immediate session switching contract: ok')
} finally {
    if (originalWindow === undefined) delete (globalThis as any).window
    else (globalThis as any).window = originalWindow
}
