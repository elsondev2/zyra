import assert from 'node:assert/strict'
import {
    buildPatchFromFileChanges,
    mergeNormalizedFileChangePayload,
    normalizeFileChange,
    normalizeFileChangePayload,
    type NormalizedFileChangePayload
} from '../src/shared/assistant/contracts/file-change'
import { handleStdoutLine } from '../src/main/assistant/codex-runtime-events'
import type { SessionContext } from '../src/main/assistant/codex-runtime-protocol'
import { findFileChangeReconciliationTarget, handleAssistantRuntimeEvent } from '../src/main/assistant/service-runtime-events'
import type { AssistantActivity, AssistantDomainEvent, AssistantRuntimeEvent, AssistantSession, AssistantThread } from '../src/shared/assistant/contracts'
import {
    codexFileChangeFixture,
    codexMoveDeleteFixture,
    outOfOrderLifecycleFixture,
    piEditFixture,
    piWriteFailureFixture,
    piWriteNewFixture
} from './fixtures/file-change-lifecycle-fixtures'

const previewPatch = `--- a/${piEditFixture.path}\n+++ b/${piEditFixture.path}\n@@ -1 +1 @@\n-const answer = 41\n+const answer = 42\n`
const piStart = normalizeFileChangePayload({
    provider: 'pi',
    status: 'running',
    toolName: 'edit',
    toolCallId: piEditFixture.toolCallId,
    revision: 1,
    source: 'args-preview',
    authoritative: false,
    changes: [{ path: piEditFixture.path, kind: 'update', diff: previewPatch }],
    previewPatch,
    paths: [piEditFixture.path],
    startedAt: outOfOrderLifecycleFixture.startedAt
}, {
    provider: 'pi',
    startedAt: outOfOrderLifecycleFixture.startedAt
})

assert.equal(piStart.status, 'running')
assert.equal(piStart.toolCallId, piEditFixture.toolCallId)
assert.equal(piStart.paths[0], piEditFixture.path)
assert.equal(piStart.patch, undefined, 'argument previews must not be promoted to canonical patch data')
assert.equal(piStart.previewPatch, previewPatch)
assert.equal(piStart.authoritative, false)

const piResult = normalizeFileChangePayload({
    provider: 'pi',
    status: 'completed',
    toolName: 'edit',
    toolCallId: piEditFixture.toolCallId,
    revision: 2,
    source: 'provider-result',
    authoritative: true,
    changes: [{
        path: piEditFixture.path,
        kind: 'update',
        diff: piEditFixture.end.result.details.patch
    }],
    patch: piEditFixture.end.result.details.patch,
    displayDiff: piEditFixture.end.result.details.diff,
    paths: [piEditFixture.path],
    startedAt: outOfOrderLifecycleFixture.startedAt,
    completedAt: outOfOrderLifecycleFixture.completedAt,
    output: piEditFixture.end.result.content[0].text
}, {
    provider: 'pi',
    startedAt: outOfOrderLifecycleFixture.startedAt
})
const completedPi = mergeNormalizedFileChangePayload(piStart, piResult)
assert.equal(completedPi.toolCallId, piEditFixture.toolCallId, 'Pi lifecycle identity must survive completion')
assert.equal(completedPi.status, 'completed')
assert.equal(completedPi.source, 'provider-result')
assert.equal(completedPi.authoritative, true)
assert.equal(completedPi.patch, piEditFixture.end.result.details.patch)
assert.equal(completedPi.previewPatch, previewPatch, 'completion may retain the preview for compatibility without rendering it as final')
assert.equal(completedPi.displayDiff, piEditFixture.end.result.details.diff)

const replayedPi = mergeNormalizedFileChangePayload(completedPi, piResult)
assert.deepEqual(replayedPi, completedPi, 'replaying an accepted provider revision must be idempotent')

const delayedPreview = normalizeFileChangePayload({
    ...piStart,
    revision: outOfOrderLifecycleFixture.lowRevision,
    status: 'running',
    previewPatch: 'stale preview'
}, {
    provider: 'pi',
    startedAt: outOfOrderLifecycleFixture.startedAt
})
const afterDelayedPreview = mergeNormalizedFileChangePayload(completedPi, delayedPreview)
assert.equal(afterDelayedPreview.status, 'completed', 'a delayed start cannot regress terminal status')
assert.equal(afterDelayedPreview.patch, piEditFixture.end.result.details.patch, 'a delayed preview cannot replace result authority')
assert.equal(afterDelayedPreview.source, 'provider-result')

const firstLive = normalizeFileChangePayload({
    provider: 'codex',
    status: 'running',
    itemId: codexFileChangeFixture.itemId,
    revision: 1,
    source: 'provider-live',
    authoritative: false,
    changes: codexFileChangeFixture.firstPatchUpdated.params.changes,
    startedAt: outOfOrderLifecycleFixture.startedAt
}, {
    provider: 'codex',
    startedAt: outOfOrderLifecycleFixture.startedAt
})
const secondLive = normalizeFileChangePayload({
    provider: 'codex',
    status: 'running',
    itemId: codexFileChangeFixture.itemId,
    revision: 2,
    source: 'provider-live',
    authoritative: false,
    changes: codexFileChangeFixture.secondPatchUpdated.params.changes,
    startedAt: outOfOrderLifecycleFixture.startedAt
}, {
    provider: 'codex',
    startedAt: outOfOrderLifecycleFixture.startedAt
})
const latestLive = mergeNormalizedFileChangePayload(firstLive, secondLive)
assert.equal(latestLive.changes.length, 2, 'Codex patchUpdated is a current snapshot, not an append-only delta')
assert.match(latestLive.patch || '', /\+newer/)
assert.doesNotMatch(latestLive.patch || '', /\+new\n(?:.|\n)*\+newer/, 'older same-file snapshots must not be concatenated')
assert.deepEqual(latestLive.paths, ['src/a.ts', 'src/new.ts'])
assert.deepEqual(latestLive.createdPaths, ['src/new.ts'])

const duplicateLive = mergeNormalizedFileChangePayload(latestLive, secondLive)
assert.deepEqual(duplicateLive, latestLive, 'duplicate structured snapshots must not duplicate files or patch text')

const move = normalizeFileChange(codexMoveDeleteFixture.changes[0])
const deletion = normalizeFileChange(codexMoveDeleteFixture.changes[1])
assert.deepEqual(move && { path: move.path, previousPath: move.previousPath, kind: move.kind }, {
    path: 'src/new-name.ts',
    previousPath: 'src/old-name.ts',
    kind: 'move'
})
assert.equal(deletion?.kind, 'delete')
assert.equal(buildPatchFromFileChanges([move!, deletion!])?.split('--- ').length, 3, 'multi-file patches retain one section per change')

const turnFinal = normalizeFileChangePayload({
    provider: 'codex',
    status: 'completed',
    itemId: codexFileChangeFixture.itemId,
    revision: 0,
    source: 'turn-final',
    authoritative: true,
    patch: codexFileChangeFixture.finalTurnDiff.params.diff,
    paths: ['src/a.ts', 'src/new.ts'],
    startedAt: outOfOrderLifecycleFixture.startedAt,
    completedAt: outOfOrderLifecycleFixture.completedAt
}, {
    provider: 'codex',
    startedAt: outOfOrderLifecycleFixture.startedAt
})
const reconciled = mergeNormalizedFileChangePayload(latestLive, turnFinal)
assert.equal(reconciled.status, 'completed')
assert.equal(reconciled.paths.length, 2)
assert.equal(reconciled.patch, codexFileChangeFixture.finalTurnDiff.params.diff)
const providerResultAfterEarlyTurnDiff = mergeNormalizedFileChangePayload(reconciled, normalizeFileChangePayload({
    ...secondLive,
    status: 'completed',
    source: 'provider-result',
    authoritative: true,
    revision: 3,
    completedAt: outOfOrderLifecycleFixture.completedAt
}, {
    provider: 'codex',
    startedAt: outOfOrderLifecycleFixture.startedAt
}))
assert.equal(providerResultAfterEarlyTurnDiff.source, 'provider-result', 'item completion remains acceptable when a turn diff arrives first')
assert.equal(providerResultAfterEarlyTurnDiff.status, 'completed')

const lateLive = normalizeFileChangePayload({
    ...firstLive,
    revision: outOfOrderLifecycleFixture.lowRevision,
    changes: [{ path: 'src/a.ts', kind: 'update', diff: 'stale' }]
}, {
    provider: 'codex',
    startedAt: outOfOrderLifecycleFixture.startedAt
})
const protectedCompletion = mergeNormalizedFileChangePayload(reconciled, lateLive)
assert.equal(protectedCompletion.status, 'completed')
assert.equal(protectedCompletion.patch, reconciled.patch)
assert.equal(protectedCompletion.revision, reconciled.revision)

const failedWrite = normalizeFileChangePayload({
    provider: 'pi',
    status: 'failed',
    toolName: 'write',
    toolCallId: piWriteFailureFixture.toolCallId,
    revision: 2,
    source: 'args-preview',
    authoritative: false,
    previewPatch: piWriteFailureFixture.args.content,
    paths: [piWriteFailureFixture.path],
    startedAt: outOfOrderLifecycleFixture.startedAt,
    completedAt: outOfOrderLifecycleFixture.completedAt,
    errorMessage: piWriteFailureFixture.result.content[0].text,
    diffUnavailableReason: 'preview-only'
}, {
    provider: 'pi',
    startedAt: outOfOrderLifecycleFixture.startedAt
})
assert.equal(failedWrite.status, 'failed')
assert.equal(failedWrite.authoritative, false)
assert.equal(failedWrite.patch, undefined, 'failed write previews must never look applied')
assert.equal(failedWrite.diffUnavailableReason, 'preview-only')

const writeNew = normalizeFileChangePayload({
    provider: 'pi',
    status: 'completed',
    toolName: 'write',
    revision: 2,
    source: 'synthetic-snapshot',
    authoritative: true,
    snapshotBacked: true,
    changes: [{ path: piWriteNewFixture.path, kind: 'add', diff: piWriteNewFixture.expectedPatch, isNew: true }],
    patch: piWriteNewFixture.expectedPatch,
    startedAt: outOfOrderLifecycleFixture.startedAt,
    completedAt: outOfOrderLifecycleFixture.completedAt
}, {
    provider: 'pi',
    startedAt: outOfOrderLifecycleFixture.startedAt
})
assert.deepEqual(writeNew.createdPaths, [piWriteNewFixture.path])
assert.equal(writeNew.snapshotBacked, true)

const legacy = normalizeFileChangePayload({
    patch: piEditFixture.end.result.details.patch,
    paths: [piEditFixture.path],
    status: 'completed'
}, {
    provider: 'pi',
    source: 'provider-result',
    status: 'completed',
    startedAt: outOfOrderLifecycleFixture.startedAt
})
assert.equal(legacy.patch, piEditFixture.end.result.details.patch, 'legacy patch/path payloads remain readable')
assert.deepEqual(legacy.paths, [piEditFixture.path])

const terminalConflict: NormalizedFileChangePayload = mergeNormalizedFileChangePayload(
    { ...completedPi, status: 'failed', errorMessage: 'first terminal result' },
    { ...piResult, status: 'completed', revision: outOfOrderLifecycleFixture.highRevision }
)
assert.equal(terminalConflict.status, 'failed', 'the first terminal state cannot be silently rewritten by a delayed terminal event')
assert.equal(terminalConflict.errorMessage, 'first terminal result')

const codexThread: AssistantThread = {
    id: codexFileChangeFixture.threadId,
    providerThreadId: codexFileChangeFixture.threadId,
    source: 'root',
    parentThreadId: null,
    providerParentThreadId: null,
    subagentDepth: null,
    agentNickname: null,
    agentRole: null,
    model: 'openai-codex/gpt-5.6-sol',
    cwd: 'C:\\workspace',
    messageCount: 0,
    lastSeenCompletedTurnId: null,
    runtimeMode: 'approval-required',
    interactionMode: 'default',
    state: 'running',
    lastError: null,
    createdAt: outOfOrderLifecycleFixture.startedAt,
    updatedAt: outOfOrderLifecycleFixture.startedAt,
    latestTurn: null,
    activePlan: null,
    messages: [],
    proposedPlans: [],
    activities: [],
    pendingApprovals: [],
    pendingUserInputs: []
}
const codexContext = {
    pending: new Map(),
    pendingApprovals: new Map(),
    pendingUserInputs: new Map(),
    fileChangeRevisionByItemId: new Map(),
    nextRequestId: 1,
    stopping: false,
    thread: codexThread
} as unknown as SessionContext
const codexRuntimeEvents: AssistantRuntimeEvent[] = []
const codexDeps = {
    emitRuntime: (event: AssistantRuntimeEvent) => codexRuntimeEvents.push(event),
    writeMessage: () => undefined,
    registerThreadAlias: () => undefined
}
for (const notification of [
    codexFileChangeFixture.started,
    codexFileChangeFixture.firstPatchUpdated,
    codexFileChangeFixture.secondPatchUpdated,
    codexFileChangeFixture.completed,
    codexFileChangeFixture.finalTurnDiff
]) {
    handleStdoutLine(codexContext, JSON.stringify(notification), codexDeps)
}
const codexItemEvents = codexRuntimeEvents.filter((event) => (
    event.type === 'activity' && event.payload.activityId === `codex-item-${codexFileChangeFixture.itemId}`
))
assert.equal(codexItemEvents.length, 4)
assert.equal(codexItemEvents[0]?.type === 'activity' ? codexItemEvents[0].payload.data?.['source'] : null, 'args-preview')
assert.equal(codexItemEvents[1]?.type === 'activity' ? codexItemEvents[1].payload.data?.['source'] : null, 'provider-live')
assert.equal(codexItemEvents[2]?.type === 'activity' ? codexItemEvents[2].payload.data?.['revision'] : null, 3)
assert.equal(codexItemEvents[3]?.type === 'activity' ? codexItemEvents[3].payload.data?.['source'] : null, 'provider-result')
assert.deepEqual(
    codexItemEvents.map((event) => event.type === 'activity' ? event.payload.activityId : null),
    Array(4).fill(`codex-item-${codexFileChangeFixture.itemId}`),
    'Codex start/live/complete revisions must retain one item activity ID'
)
const latestCodexLive = codexItemEvents[2]
assert.equal(latestCodexLive?.type === 'activity' ? (latestCodexLive.payload.data?.['changes'] as unknown[])?.length : null, 2)
assert.match(String(latestCodexLive?.type === 'activity' ? latestCodexLive.payload.data?.['patch'] : ''), /\+newer/)
const codexTurnDiff = codexRuntimeEvents.findLast((event) => (
    event.type === 'activity' && event.payload.data?.['category'] === 'turn-diff'
))
assert.equal(codexTurnDiff?.type === 'activity' ? codexTurnDiff.payload.data?.['source'] : null, 'turn-final')
assert.equal(codexTurnDiff?.type === 'activity' ? codexTurnDiff.payload.data?.['authoritative'] : null, true)

let projectedCodexThread: AssistantThread = { ...codexThread, activities: [] }
const projectedCodexSession: AssistantSession = {
    id: 'codex-session',
    title: 'Codex file changes',
    mode: 'work',
    projectPath: 'C:\\workspace',
    playgroundLabId: null,
    pendingLabRequest: null,
    archived: false,
    createdAt: outOfOrderLifecycleFixture.startedAt,
    updatedAt: outOfOrderLifecycleFixture.startedAt,
    activeThreadId: projectedCodexThread.id,
    threadIds: [projectedCodexThread.id],
    threads: [projectedCodexThread]
}
const serviceDeps = {
    planBuffers: new Map<string, string>(),
    assistantTextBuffers: new Map<string, string>(),
    isAssistantTextSuppressed: () => false,
    findSessionByThreadId: () => projectedCodexSession,
    requireThread: () => projectedCodexThread,
    findThreadRecord: () => ({ session: projectedCodexSession, thread: projectedCodexThread }),
    queueAssistantTextDelta: () => undefined,
    flushAssistantTextDelta: () => undefined,
    appendEvent: (type: AssistantDomainEvent['type'], _occurredAt: string, payload: Record<string, unknown>) => {
        if (type !== 'thread.activity.appended') return
        const activity = payload['activity'] as AssistantActivity
        const index = projectedCodexThread.activities.findIndex((entry) => entry.id === activity.id)
        projectedCodexThread = {
            ...projectedCodexThread,
            activities: index >= 0
                ? projectedCodexThread.activities.map((entry, entryIndex) => entryIndex === index ? activity : entry)
                : [...projectedCodexThread.activities, activity]
        }
        projectedCodexSession.threads = [projectedCodexThread]
    },
    updateLatestTurnAssistantMessage: () => undefined
}
for (const event of codexItemEvents) handleAssistantRuntimeEvent(event, serviceDeps)
assert.equal(projectedCodexThread.activities.length, 1, 'service projection must replace Codex revisions by stable item activity ID')
const projectedCodexFileChange = projectedCodexThread.activities[0]!
assert.equal(projectedCodexFileChange.payload?.['status'], 'completed')
assert.equal(projectedCodexFileChange.payload?.['source'], 'provider-result')
assert.equal(projectedCodexFileChange.payload?.['authoritative'], true)
assert.equal((projectedCodexFileChange.payload?.['changes'] as unknown[])?.length, 2)
handleAssistantRuntimeEvent(codexItemEvents[1]!, serviceDeps)
assert.equal(projectedCodexThread.activities[0]?.payload?.['status'], 'completed', 'late live event cannot regress projected completion')
assert.equal(projectedCodexThread.activities[0]?.payload?.['source'], 'provider-result')

const reconciliationActivities: AssistantActivity[] = [
    {
        id: 'codex-item-a',
        kind: 'file-change',
        tone: 'tool',
        summary: 'Edited a',
        turnId: codexFileChangeFixture.turnId,
        createdAt: outOfOrderLifecycleFixture.startedAt,
        payload: { ...latestLive, itemId: 'a', paths: ['src/a.ts'] }
    },
    {
        id: 'codex-item-b',
        kind: 'file-change',
        tone: 'tool',
        summary: 'Edited b',
        turnId: codexFileChangeFixture.turnId,
        createdAt: outOfOrderLifecycleFixture.startedAt,
        payload: { ...latestLive, itemId: 'b', paths: ['src/b.ts'] }
    }
]
assert.equal(
    findFileChangeReconciliationTarget(reconciliationActivities, codexFileChangeFixture.turnId, {
        category: 'turn-diff',
        patch: '--- a/src/b.ts\n+++ b/src/b.ts\n@@ -1 +1 @@\n-old\n+new\n'
    })?.id,
    'codex-item-b',
    'final turn diff must reconcile by path overlap instead of latest-item guesswork'
)
assert.equal(
    findFileChangeReconciliationTarget(reconciliationActivities, codexFileChangeFixture.turnId, {
        category: 'turn-diff',
        patch: '--- a/src/a.ts\n+++ b/src/a.ts\n--- a/src/b.ts\n+++ b/src/b.ts\n'
    }),
    null,
    'a final diff overlapping multiple item activities must remain separate'
)
assert.equal(
    findFileChangeReconciliationTarget(reconciliationActivities, codexFileChangeFixture.turnId, {
        category: 'turn-diff',
        patch: '--- a/src/unknown.ts\n+++ b/src/unknown.ts\n'
    }),
    null,
    'a final diff without path overlap must remain separate'
)

console.log('File-change lifecycle fixtures: ok')
