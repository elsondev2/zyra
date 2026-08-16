import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mock } from 'bun:test'

const userDataPath = mkdtempSync(join(tmpdir(), 'zyra-canonical-review-'))
const electronNoop = (): undefined => undefined
mock.module('electron', () => ({
    app: {
        getPath: () => userDataPath,
        isReady: () => true,
        on: electronNoop,
        once: electronNoop
    },
    BrowserWindow: class {
        static getAllWindows(): never[] { return [] }
        static fromWebContents(): null { return null }
    },
    screen: {
        getAllDisplays: () => [],
        getPrimaryDisplay: () => ({ bounds: { x: 0, y: 0, width: 1920, height: 1080 } })
    },
    nativeImage: { createFromBuffer: () => ({ isEmpty: () => true }) },
    webContents: { fromId: () => null },
    safeStorage: { isEncryptionAvailable: () => false }
}))

const canonicalChatId = 'canonical-review-chat'
const canonicalCreatedAt = '2026-08-04T08:00:00.000Z'
const canonicalModifiedAt = ['2026-08-04T08:01:00.000Z', '2026-08-04T08:02:00.000Z']
const patch = [
    '--- C:/fixture/src/review-index.ts',
    '+++ C:/fixture/src/review-index.ts',
    '@@ -1 +1 @@',
    '-old review',
    '+new review'
].join('\n')
const firstTurn = [
    {
        type: 'message',
        timestamp: '2026-08-04T08:00:00.000Z',
        message: { role: 'user', timestamp: 1_785_830_400_000, content: [{ type: 'text', text: 'Review this file' }] }
    },
    {
        type: 'message',
        timestamp: '2026-08-04T08:00:01.000Z',
        message: {
            role: 'assistant',
            timestamp: 1_785_830_401_000,
            content: [{
                type: 'toolCall',
                id: 'review-edit-call',
                name: 'edit',
                arguments: {
                    path: 'C:/fixture/src/review-index.ts',
                    edits: [{ oldText: 'old review', newText: 'new review' }]
                }
            }]
        }
    },
    {
        type: 'message',
        timestamp: '2026-08-04T08:00:02.000Z',
        message: {
            role: 'toolResult',
            timestamp: 1_785_830_402_000,
            toolCallId: 'review-edit-call',
            toolName: 'edit',
            isError: false,
            content: [{ type: 'text', text: 'Successfully replaced 1 block.' }],
            details: { diff: patch, patch }
        }
    },
    {
        type: 'message',
        timestamp: '2026-08-04T08:00:03.000Z',
        message: { role: 'assistant', timestamp: 1_785_830_403_000, content: [{ type: 'text', text: 'Review complete' }] }
    }
]
const secondTurn = [
    {
        type: 'message',
        timestamp: '2026-08-04T08:01:00.000Z',
        message: { role: 'user', timestamp: 1_785_830_460_000, content: [{ type: 'text', text: 'Review the follow-up' }] }
    },
    {
        type: 'message',
        timestamp: '2026-08-04T08:01:01.000Z',
        message: { role: 'assistant', timestamp: 1_785_830_461_000, content: [{ type: 'text', text: 'Follow-up complete' }] }
    }
]

let timelineVersion = 0
const historyRequests: Array<{ before: string | null; version: number }> = []
const { ZyraPiRuntime } = await import('../src/main/assistant/zyra-pi-runtime')
ZyraPiRuntime.prototype.listCanonicalChats = async () => [{
    version: 1,
    canonicalChatId,
    sessionPath: 'C:/fixture/.zyra/sessions/canonical-review.jsonl',
    project: 'C:/fixture',
    cwd: 'C:/fixture',
    title: 'Canonical Review fixture',
    createdAt: canonicalCreatedAt,
    modifiedAt: canonicalModifiedAt[timelineVersion]!,
    messageCount: timelineVersion === 0 ? 4 : 6,
    displayMessageCount: timelineVersion === 0 ? 2 : 4,
    toolCallCount: 1,
    errorCount: 0,
    imageCount: 0,
    entryCount: timelineVersion === 0 ? 4 : 6,
    archived: false
}]
ZyraPiRuntime.prototype.readCanonicalChatHistory = async (_session, _project, options = {}) => {
    const before = options.before || null
    historyRequests.push({ before, version: timelineVersion })
    if (timelineVersion === 1) {
        const entries = [...firstTurn, ...secondTurn]
        return {
            chat: {
                version: 1,
                canonicalChatId,
                sessionPath: 'C:/fixture/.zyra/sessions/canonical-review.jsonl',
                project: 'C:/fixture',
                cwd: 'C:/fixture',
                title: 'Canonical Review fixture',
                createdAt: canonicalCreatedAt,
                modifiedAt: canonicalModifiedAt[1]!,
                messageCount: 6,
                displayMessageCount: 4,
                toolCallCount: 1,
                errorCount: 0,
                imageCount: 0,
                entryCount: 6,
                archived: false
            },
            entries,
            pageInfo: { startCursor: '0', endCursor: '6', oldestCursor: null, hasOlder: false, totalEntries: 6 }
        }
    }
    const older = before === '2'
    return {
        chat: {
            version: 1,
            canonicalChatId,
            sessionPath: 'C:/fixture/.zyra/sessions/canonical-review.jsonl',
            project: 'C:/fixture',
            cwd: 'C:/fixture',
            title: 'Canonical Review fixture',
            createdAt: canonicalCreatedAt,
            modifiedAt: canonicalModifiedAt[0]!,
            messageCount: 4,
            displayMessageCount: 2,
            toolCallCount: 1,
            errorCount: 0,
            imageCount: 0,
            entryCount: 4,
            archived: false
        },
        entries: older ? firstTurn.slice(0, 2) : firstTurn.slice(2),
        pageInfo: older
            ? { startCursor: '0', endCursor: '2', oldestCursor: null, hasOlder: false, totalEntries: 4 }
            : { startCursor: '2', endCursor: '4', oldestCursor: '2', hasOlder: true, totalEntries: 4 }
    }
}
ZyraPiRuntime.prototype.prewarm = async () => []
let historyBodyReads = 0
const toolOutputSearches: string[] = []
ZyraPiRuntime.prototype.searchCanonicalToolOutputs = async (_session, _project, query) => {
    toolOutputSearches.push(query)
    return query === 'provider-only-output' ? [{ toolCallId: 'review-edit-call' }] : []
}
ZyraPiRuntime.prototype.readCanonicalHistoryEntryBody = async (_session, _project, ref) => {
    historyBodyReads += 1
    const isEdit = ref.entryId === 'entry:deferred-edit-result'
    return {
        entry: {
            type: 'message',
            id: isEdit ? 'entry:deferred-edit-result' : 'entry:deferred-read-result',
            message: isEdit ? {
                id: 'message:deferred-edit-result',
                role: 'toolResult',
                toolCallId: 'deferred-edit-call',
                toolName: 'edit',
                isError: false,
                content: [{ type: 'text', text: 'Successfully replaced 1 block.' }],
                details: { patch, diff: patch }
            } : {
                id: 'message:deferred-read-result',
                role: 'toolResult',
                toolCallId: 'deferred-read-call',
                toolName: 'read',
                isError: false,
                content: [{ type: 'text', text: 'deferred file contents' }]
            }
        }
    }
}

const { AssistantService, projectCanonicalTimeline } = await import('../src/main/assistant/service')
const service = new AssistantService()
try {
    const snapshot = await service.getSnapshot()
    const deferredProjection = projectCanonicalTimeline([
        {
            type: 'message', id: 'entry:deferred-read-call', timestamp: canonicalCreatedAt,
            message: {
                id: 'message:deferred-read-call', role: 'assistant', timestamp: Date.parse(canonicalCreatedAt),
                content: [{ type: 'toolCall', id: 'deferred-read-call', name: 'read', arguments: { path: 'large-fixture.txt' } }]
            }
        },
        {
            type: 'message', id: 'entry:deferred-read-result', timestamp: canonicalCreatedAt,
            historyBodyRef: {
                version: 1,
                canonicalChatId,
                entryIndex: 77,
                entryId: 'entry:deferred-read-result',
                entrySha256: 'a'.repeat(64),
                toolCallId: 'deferred-read-call',
                toolName: 'read',
                bodyBytes: 500_000,
                contentTypes: ['text'],
                imageCount: 0
            },
            message: {
                id: 'message:deferred-read-result', role: 'toolResult', toolCallId: 'deferred-read-call',
                toolName: 'read', isError: false, timestamp: Date.parse(canonicalCreatedAt), content: []
            }
        }
    ], canonicalChatId, 'deferred-key', canonicalCreatedAt, 0, 'C:/fixture')
    const deferredActivity = deferredProjection.activities.find((activity) => activity.id === 'zyra-tool-deferred-read-call')
    assert.equal(deferredActivity?.payload?.output, undefined, 'canonical projection must not persist a deferred tool body')
    assert.equal((deferredActivity?.payload?.historyBodyRef as { canonicalChatId?: string })?.canonicalChatId, canonicalChatId)
    const thread = snapshot.sessions
        .flatMap((session) => session.threads)
        .find((candidate) => candidate.providerThreadId === canonicalChatId)
    assert.ok(thread, 'canonical chat catalog rows must create a Desktop compatibility thread')
    await (service as any).persistence.projectCanonicalReviewTimeline({
        threadId: thread.id,
        messages: [],
        activities: [deferredActivity]
    })
    const hydratedBody = await service.hydrateHistoryBody({
        activityId: deferredActivity!.id,
        ref: deferredActivity!.payload!.historyBodyRef as any
    })
    assert.equal(hydratedBody.body.payload.output, 'deferred file contents')
    await service.hydrateHistoryBody({ activityId: deferredActivity!.id, ref: deferredActivity!.payload!.historyBodyRef as any })
    assert.equal(historyBodyReads, 1, 'the main process retains only recently requested historical bodies in its LRU cache')

    const deferredEditProjection = projectCanonicalTimeline([
        {
            type: 'message', id: 'entry:deferred-edit-call', timestamp: canonicalCreatedAt,
            message: {
                id: 'message:deferred-edit-call', role: 'assistant', timestamp: Date.parse(canonicalCreatedAt),
                content: [{
                    type: 'toolCall', id: 'deferred-edit-call', name: 'edit',
                    arguments: { path: 'C:/fixture/src/review-index.ts', edits: [{ oldText: 'old review', newText: 'new review' }] }
                }]
            }
        },
        {
            type: 'message', id: 'entry:deferred-edit-result', timestamp: canonicalCreatedAt,
            historyBodyRef: {
                version: 1,
                canonicalChatId,
                entryIndex: 78,
                entryId: 'entry:deferred-edit-result',
                entrySha256: 'b'.repeat(64),
                toolCallId: 'deferred-edit-call',
                toolName: 'edit',
                bodyBytes: 500_000,
                contentTypes: ['text'],
                imageCount: 0
            },
            message: {
                id: 'message:deferred-edit-result', role: 'toolResult', toolCallId: 'deferred-edit-call',
                toolName: 'edit', isError: false, timestamp: Date.parse(canonicalCreatedAt)
            }
        }
    ], canonicalChatId, 'deferred-edit-key', canonicalCreatedAt, 0, 'C:/fixture')
    const deferredEditActivity = deferredEditProjection.activities.find((activity) => activity.id === 'zyra-tool-deferred-edit-call')!
    await (service as any).persistence.projectCanonicalReviewTimeline({
        threadId: thread.id,
        messages: [],
        activities: [deferredEditActivity]
    })
    const hydratedEdit = await service.hydrateHistoryBody({
        activityId: deferredEditActivity.id,
        ref: deferredEditActivity.payload!.historyBodyRef as any
    })
    assert.equal(hydratedEdit.body.payload.patch, patch, 'file-change patches hydrate only when their historical body is requested')
    assert.equal(hydratedEdit.body.payload.authoritative, true)
    assert.equal(historyBodyReads, 2)
    await (service as any).persistence.projectCanonicalReviewTimeline({
        threadId: thread.id,
        messages: [],
        activities: [],
        removedActivityIds: [deferredActivity!.id, deferredEditActivity.id]
    })

    const firstReview = await service.getReviewIndex(thread.id)
    assert.equal(firstReview.index.totalTurns, 1)
    assert.equal(firstReview.index.turns[0]?.prompt?.text, 'Review this file')
    assert.equal(firstReview.index.turns[0]?.response?.text, 'Review complete')
    assert.equal(firstReview.index.turns[0]?.changes.length, 1)
    assert.equal(firstReview.index.turns[0]?.changes[0]?.filePath.replace(/\\/g, '/').endsWith('/src/review-index.ts'), true)
    assert.equal(firstReview.index.turns[0]?.changes[0]?.additions, 1)
    assert.equal(firstReview.index.turns[0]?.changes[0]?.deletions, 1)
    assert.deepEqual(historyRequests.map((request) => request.before), [null, '2'], 'Review must read every canonical page on first open')
    const indexedEditActivity = await (service as any).persistence.readActivity(thread.id, 'zyra-tool-review-edit-call')
    assert.equal(indexedEditActivity?.turnId, firstReview.index.turns[0]!.id)
    const directMergedSearch = await (service as any).persistence.mergeSearchTurnIds(thread.id, [], ['zyra-tool-review-edit-call'])
    assert.deepEqual(directMergedSearch.turnIds, [firstReview.index.turns[0]!.id])
    const deferredOutputSearch = await service.searchTurns(thread.id, 'provider-only-output')
    assert.deepEqual(toolOutputSearches, ['provider-only-output'])
    assert.deepEqual(deferredOutputSearch.result.turnIds, [firstReview.index.turns[0]!.id], 'search merges matching deferred canonical output back into Review turns')

    const firstTurnDetail = await service.getTurnDetail(thread.id, firstReview.index.turns[0]!.id)
    assert.deepEqual(firstTurnDetail.detail.messages.map((message) => message.text), ['Review this file', 'Review complete'])
    assert.equal(firstTurnDetail.detail.activities.some((activity) => activity.kind === 'file-change'), true)

    await service.getReviewIndex(thread.id)
    assert.equal(historyRequests.length, 3, 'an unchanged Review refresh checks only the latest canonical page')

    timelineVersion = 1
    const updatedReview = await service.getReviewIndex(thread.id)
    assert.equal(updatedReview.index.totalTurns, 2)
    assert.equal(updatedReview.index.turns[0]?.prompt?.text, 'Review the follow-up')
    assert.equal(updatedReview.index.turns[1]?.changes.length, 1, 'incremental canonical refresh retains older indexed changes')
    assert.equal(historyRequests.length, 4, 'a later TUI turn is indexed from the latest page without rereading older pages')
} finally {
    service.dispose()
    await new Promise((resolve) => setTimeout(resolve, 300))
    rmSync(userDataPath, { recursive: true, force: true })
}

console.log('Assistant canonical Review history: ok')
