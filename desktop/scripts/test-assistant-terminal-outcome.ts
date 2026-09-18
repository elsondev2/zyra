import assert from 'node:assert/strict'
import { handleAssistantRuntimeEvent } from '../src/main/assistant/service-runtime-events'
import {
    readTerminalAssistantMessageOutcome,
    resolveZyraTerminalOutcome
} from '../src/main/assistant/assistant-terminal-outcome'
import { applyAssistantDomainEvent } from '../src/shared/assistant/projector'
import type {
    AssistantDomainEvent,
    AssistantRuntimeEvent,
    AssistantSession,
    AssistantSnapshot,
    AssistantThread
} from '../src/shared/assistant/contracts'

const baseTime = Date.parse('2026-09-17T15:58:45.638Z')
const abortedTimestamp = baseTime + 111_887
const interruptedMessage = readTerminalAssistantMessageOutcome({
    role: 'assistant',
    timestamp: abortedTimestamp,
    stopReason: 'error',
    errorMessage: 'Request was aborted'
}, 'runtime-fallback')
assert.deepEqual(interruptedMessage, {
    outcome: 'interrupted',
    errorMessage: 'Request was aborted',
    sourceMessageId: `pi-message:assistant:${abortedTimestamp}`
}, 'the canonical assistant terminal message and timestamp own interruption metadata')
assert.equal(resolveZyraTerminalOutcome('agent_end', {}, interruptedMessage && { turnId: 'turn-interrupted', ...interruptedMessage }), 'interrupted')

const failedAttempt = readTerminalAssistantMessageOutcome({
    role: 'assistant',
    timestamp: abortedTimestamp - 100,
    stopReason: 'error',
    errorMessage: 'Temporary provider failure'
}, 'failed-attempt')
const successfulResponse = readTerminalAssistantMessageOutcome({
    role: 'assistant',
    timestamp: abortedTimestamp,
    stopReason: 'stop',
    content: [{ type: 'text', text: 'Recovered response' }]
}, 'successful-response')
assert.equal(failedAttempt?.outcome, 'failed')
assert.equal(successfulResponse, null)
assert.equal(resolveZyraTerminalOutcome('agent_end', {}, null), 'completed', 'a later successful assistant response clears an earlier failed attempt')

const createdAt = new Date(baseTime).toISOString()
const thread: AssistantThread = {
    id: 'thread-terminal-metadata',
    providerThreadId: 'canonical:terminal-metadata',
    source: 'root',
    parentThreadId: null,
    providerParentThreadId: null,
    subagentDepth: null,
    agentNickname: null,
    agentRole: null,
    model: 'test-model',
    cwd: 'C:/synthetic',
    messageCount: 0,
    activityCount: 0,
    proposedPlanCount: 0,
    lastSeenCompletedTurnId: null,
    runtimeMode: 'approval-required',
    interactionMode: 'default',
    state: 'ready',
    lastError: null,
    createdAt,
    updatedAt: createdAt,
    latestTurn: null,
    hasPendingApprovals: false,
    hasPendingUserInputs: false,
    hasActivePlan: false,
    activePlan: null,
    messages: [],
    activities: [],
    proposedPlans: [],
    pendingApprovals: [],
    pendingUserInputs: []
}
const session: AssistantSession = {
    id: 'session-terminal-metadata',
    title: 'Synthetic terminal metadata',
    mode: 'work',
    projectPath: 'C:/synthetic',
    playgroundLabId: null,
    pendingLabRequest: null,
    archived: false,
    createdAt,
    updatedAt: createdAt,
    activeThreadId: thread.id,
    threadIds: [thread.id],
    threads: [thread]
}
let snapshot: AssistantSnapshot = {
    snapshotSequence: 0,
    updatedAt: createdAt,
    selectedSessionId: session.id,
    playground: { rootPath: null, labs: [] },
    sessions: [session],
    knownModels: []
}
let sequence = 0
const currentThread = () => snapshot.sessions[0]!.threads[0]!
const deps = {
    planBuffers: new Map<string, string>(),
    assistantTextBuffers: new Map<string, string>(),
    isAssistantTextSuppressed: () => false,
    findSessionByThreadId: () => snapshot.sessions[0]!,
    requireThread: () => currentThread(),
    findThreadRecord: () => ({ session: snapshot.sessions[0]!, thread: currentThread() }),
    queueAssistantTextDelta: () => {},
    flushAssistantTextDelta: () => {},
    queueAssistantActivityDelta: () => {},
    flushAssistantActivityDelta: () => {},
    appendEvent: (
        type: AssistantDomainEvent['type'],
        occurredAt: string,
        payload: Record<string, unknown>,
        sessionId?: string,
        threadId?: string
    ) => {
        sequence += 1
        snapshot = applyAssistantDomainEvent(snapshot, {
            sequence,
            eventId: `event-${sequence}`,
            type,
            occurredAt,
            sessionId,
            threadId,
            payload
        })
    },
    projectFleet: () => true,
    updateLatestTurnAssistantMessage: () => {}
}
const handle = (event: AssistantRuntimeEvent) => handleAssistantRuntimeEvent(event, deps)
const runtimeEvent = (
    type: AssistantRuntimeEvent['type'],
    turnId: string,
    milliseconds: number,
    payload: Record<string, unknown>,
    extra: Partial<AssistantRuntimeEvent> = {}
): AssistantRuntimeEvent => ({
    eventId: `${type}-${turnId}`,
    type,
    threadId: thread.id,
    turnId,
    createdAt: new Date(baseTime + milliseconds).toISOString(),
    payload,
    ...extra
} as AssistantRuntimeEvent)

handle(runtimeEvent('turn.started', 'turn-recovered', 1_000, { interactionMode: 'default' }))
handle(runtimeEvent('activity', 'turn-recovered', 2_000, {
    activityId: 'failed-tool-that-recovers',
    kind: 'command',
    summary: 'Command failed',
    tone: 'error',
    data: { status: 'failed' }
}))
handle(runtimeEvent('turn.completed', 'turn-recovered', 3_000, { outcome: 'completed' }))
assert.equal(currentThread().activities.find((activity) => activity.id === 'failed-tool-that-recovers')?.turnTerminalOutcome, undefined)
assert.equal(currentThread().activities.some((activity) => activity.turnId === 'turn-recovered' && activity.turnTerminalOutcome !== undefined), false, 'a failed tool followed by a successful assistant completion is not interrupted')

handle(runtimeEvent('turn.started', 'turn-interrupted', 4_000, { interactionMode: 'default' }))
handle(runtimeEvent('activity', 'turn-interrupted', 5_000, {
    activityId: 'completed-tool-before-interruption',
    kind: 'command',
    summary: 'Command completed',
    tone: 'tool',
    data: { status: 'completed' }
}))
handle(runtimeEvent('turn.completed', 'turn-interrupted', 6_000, {
    outcome: 'interrupted',
    errorMessage: 'Request was aborted'
}, { itemId: `pi-message:assistant:${abortedTimestamp}` }))
const interruptedActivities = currentThread().activities.filter((activity) => activity.turnId === 'turn-interrupted')
assert.equal(interruptedActivities.find((activity) => activity.id === 'completed-tool-before-interruption')?.turnTerminalOutcome, undefined, 'the terminal marker does not replace or relabel a tool')
const liveTerminal = interruptedActivities.find((activity) => activity.turnTerminalOutcome === 'interrupted')
assert.equal(liveTerminal?.id, `shared-error:pi-message:assistant:${abortedTimestamp}`)
assert.equal(liveTerminal?.payload?.['status'], 'cancelled')
assert.equal(currentThread().latestTurn?.state, 'interrupted')

handle(runtimeEvent('turn.started', 'turn-failed', 7_000, { interactionMode: 'default' }))
handle(runtimeEvent('turn.completed', 'turn-failed', 8_000, {
    outcome: 'failed',
    errorMessage: 'Provider rejected the request'
}, { itemId: 'canonical-failed-message' }))
const failedTerminal = currentThread().activities.find((activity) => activity.turnId === 'turn-failed' && activity.turnTerminalOutcome === 'failed')
assert.equal(failedTerminal?.tone, 'error', 'a true failed turn remains distinct from interruption')
assert.equal(currentThread().latestTurn?.state, 'error')

console.log('Assistant terminal outcome contract: ok')
