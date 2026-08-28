import assert from 'node:assert/strict'
import type { AssistantSession, AssistantThread } from '../src/shared/assistant/contracts'
import { isAssistantSessionProjectLocked } from '../src/shared/assistant/session-project'

const createdAt = '2026-07-21T00:00:00.000Z'
const thread: AssistantThread = {
    id: 'thread-project-lock',
    providerThreadId: null,
    source: 'root',
    parentThreadId: null,
    providerParentThreadId: null,
    subagentDepth: null,
    agentNickname: null,
    agentRole: null,
    model: '',
    cwd: 'C:/projects/original',
    messageCount: 0,
    activityCount: 0,
    proposedPlanCount: 0,
    lastSeenCompletedTurnId: null,
    runtimeMode: 'approval-required',
    interactionMode: 'default',
    state: 'idle',
    lastError: null,
    createdAt,
    updatedAt: createdAt,
    latestTurn: null,
    hasPendingApprovals: false,
    hasPendingUserInputs: false,
    hasActivePlan: false,
    activePlan: null,
    messages: [],
    proposedPlans: [],
    activities: [],
    pendingApprovals: [],
    pendingUserInputs: []
}
const session: AssistantSession = {
    id: 'session-project-lock',
    title: 'Project lock fixture',
    mode: 'work',
    projectPath: 'C:/projects/original',
    playgroundLabId: null,
    pendingLabRequest: null,
    archived: false,
    createdAt,
    updatedAt: createdAt,
    activeThreadId: thread.id,
    threadIds: [thread.id],
    threads: [thread]
}

assert.equal(isAssistantSessionProjectLocked(session), false, 'an untouched chat may still choose a different project')

thread.state = 'starting'
assert.equal(
    isAssistantSessionProjectLocked(session),
    false,
    'connection-only warmup must not block project selection in a pristine New Chat'
)

thread.messageCount = 1
assert.equal(
    isAssistantSessionProjectLocked(session),
    true,
    'a starting thread with submitted chat content still protects its working directory'
)

thread.state = 'idle'
thread.messageCount = 1
assert.equal(isAssistantSessionProjectLocked(session), false, 'persisted chat messages do not permanently lock project metadata')

thread.messageCount = 0
thread.activityCount = 1
assert.equal(isAssistantSessionProjectLocked(session), false, 'completed tool or runtime history does not lock project metadata')

thread.activityCount = 0
thread.latestTurn = {
    id: 'turn-project-lock',
    state: 'running',
    requestedAt: createdAt,
    startedAt: createdAt,
    completedAt: null,
    assistantMessageId: null,
    usage: null
}
assert.equal(isAssistantSessionProjectLocked(session), true, 'a started turn locks the project even before history hydration')

thread.latestTurn = null
thread.hasPendingApprovals = true
assert.equal(isAssistantSessionProjectLocked(session), true, 'pending work temporarily pauses project changes')

thread.hasPendingApprovals = false
assert.equal(isAssistantSessionProjectLocked(session), false, 'project metadata becomes editable again when work settles')

console.log('Assistant mutable project checks passed.')
