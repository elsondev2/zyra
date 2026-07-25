import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { AssistantActivity, AssistantDomainEvent, AssistantSnapshot } from '../src/shared/assistant/contracts'
import { AssistantActivityDeltaBuffer } from '../src/main/assistant/assistant-activity-delta-buffer'
import {
    analyzeAssistantReadResult,
    buildAssistantReadPreview
} from '../src/shared/assistant/read-activity'
import { isAssistantToolLifecycleStartEvent } from '../src/shared/assistant/tool-lifecycle'
import { coalesceAssistantPersistenceEvents } from '../src/main/assistant/persistence-event-batching'
import {
    collapseAssistantDeltaEvents,
    isAssistantStreamingPresentationEvent
} from '../src/renderer/src/lib/assistant/event-batching'
import {
    assistantStreamPresentation,
    mergeAssistantPresentationText
} from '../src/renderer/src/lib/assistant/assistant-stream-presentation'
import {
    getAssistantInitialVisibleText,
    getAssistantStreamRevealCount,
    revealAssistantStreamText
} from '../src/renderer/src/pages/assistant/useAssistantVisibleText'

function event(
    sequence: number,
    type: AssistantDomainEvent['type'],
    payload: Record<string, unknown>
): AssistantDomainEvent {
    return {
        sequence,
        eventId: `event-${sequence}`,
        type,
        occurredAt: `2026-07-25T00:00:${String(sequence).padStart(2, '0')}.000Z`,
        sessionId: 'session-1',
        threadId: 'thread-1',
        payload
    }
}

const textDeltaA = event(1, 'thread.message.assistant.delta', {
    threadId: 'thread-1',
    messageId: 'message-1',
    delta: 'Hello '
})
const unrelatedUpdate = event(2, 'thread.updated', {
    threadId: 'thread-1',
    patch: { updatedAt: '2026-07-25T00:00:02.000Z' }
})
const textDeltaB = event(3, 'thread.message.assistant.delta', {
    threadId: 'thread-1',
    messageId: 'message-1',
    delta: 'world'
})
const collapsed = collapseAssistantDeltaEvents([textDeltaA, unrelatedUpdate, textDeltaB])
assert.equal(collapsed.length, 2, 'interleaved deltas should project as one authoritative update')
assert.equal(collapsed[0]?.sequence, 2, 'unrelated events must retain sequence order')
assert.equal(collapsed[1]?.sequence, 3)
assert.equal(collapsed[1]?.payload['delta'], 'Hello world')
assert.equal(isAssistantStreamingPresentationEvent(textDeltaA), true)

const streamingActivity: AssistantActivity = {
    id: 'activity-1',
    kind: 'assistant.internal',
    tone: 'tool',
    summary: 'Internal message',
    detail: 'Checking the project',
    turnId: 'turn-1',
    createdAt: '2026-07-25T00:00:01.000Z',
    payload: { status: 'streaming', output: 'Checking the project' }
}
const activityEvent = event(4, 'thread.activity.appended', {
    threadId: 'thread-1',
    activity: streamingActivity
})
assert.equal(isAssistantStreamingPresentationEvent(activityEvent), true)

const editStartEvent = event(5, 'thread.activity.appended', {
    threadId: 'thread-1',
    activity: {
        id: 'edit-activity',
        kind: 'file-change',
        tone: 'tool',
        summary: 'Editing files',
        turnId: 'turn-1',
        createdAt: '2026-07-25T00:00:05.000Z',
        payload: { status: 'running', toolLifecyclePhase: 'start', paths: ['src/app.ts'] }
    }
})
const editEndEvent = event(6, 'thread.activity.appended', {
    threadId: 'thread-1',
    activity: {
        id: 'edit-activity',
        kind: 'file-change',
        tone: 'tool',
        summary: 'Edited file',
        turnId: 'turn-1',
        createdAt: '2026-07-25T00:00:05.000Z',
        payload: { status: 'completed', toolLifecyclePhase: 'end', paths: ['src/app.ts'] }
    }
})
assert.equal(isAssistantToolLifecycleStartEvent(editStartEvent), true)
assert.deepEqual(
    collapseAssistantDeltaEvents([editStartEvent, editEndEvent]).map((entry) => entry.sequence),
    [5, 6],
    'a fast completion must not erase Pi’s tool start lifecycle boundary'
)

const shortReadOutput = Array.from({ length: 8 }, (_, index) => `line ${index + 1}`).join('\n')
const shortReadPreview = buildAssistantReadPreview(shortReadOutput)
assert.equal(shortReadPreview.text, shortReadOutput, 'short Read output remains complete when expanded')
assert.equal(shortReadPreview.presentationTruncated, false)

const longReadOutput = Array.from({ length: 75 }, (_, index) => `line ${index + 1}`).join('\n')
const longReadPreview = buildAssistantReadPreview(longReadOutput)
assert.equal(longReadPreview.displayedLines, 50)
assert.equal(longReadPreview.totalReadLines, 75)
assert.equal(longReadPreview.presentationTruncated, true, 'expanded Read output is presentation-bounded to 50 lines')
assert.equal(longReadPreview.text.split('\n').at(-1), 'line 50')

const partialReadBody = Array.from({ length: 50 }, (_, index) => `line ${index + 51}`).join('\n')
const partialReadOutput = `${partialReadBody}\n\n[Showing lines 51-100 of 240. Use offset=101 to continue.]`
const partialRead = analyzeAssistantReadResult({
    args: { path: 'src/app.ts', offset: 51, limit: 50 },
    output: partialReadOutput,
    status: 'completed'
})
assert.equal(partialRead.readStartLine, 51)
assert.equal(partialRead.readEndLine, 100)
assert.equal(partialRead.readLineCount, 50)
assert.equal(partialRead.readTotalLines, 240)
assert.equal(partialRead.readComplete, false)
assert.equal(buildAssistantReadPreview(partialReadOutput).continuationNotice?.startsWith('[Showing lines 51-100'), true)

const assistantMainServiceSource = readFileSync(new URL('../src/main/assistant/service.ts', import.meta.url), 'utf8')
const assistantStoreSource = readFileSync(new URL('../src/renderer/src/lib/assistant/assistant-store-core.ts', import.meta.url), 'utf8')
assert.match(
    assistantMainServiceSource,
    /isAssistantToolLifecycleStartEvent\(event\)[\s\S]*?this\.flushBroadcastEvents\(\)/,
    'main IPC batching must flush a Pi tool start before a fast completion can join its batch'
)
assert.match(
    assistantStoreSource,
    /isAssistantToolLifecycleStartEvent\(event\)[\s\S]*?this\.flushPendingAssistantEvents\(\)/,
    'renderer projection must commit a new running tool row without the normal stream checkpoint delay'
)

assistantStreamPresentation.clear()
let presentationNotifications = 0
const unsubscribeMessage = assistantStreamPresentation.subscribe('message', 'message-1', () => {
    presentationNotifications += 1
})
assistantStreamPresentation.ingestEvent(textDeltaA)
assistantStreamPresentation.ingestEvent(textDeltaB)
assert.deepEqual(assistantStreamPresentation.getSnapshot('message', 'message-1'), {
    text: 'Hello world',
    streaming: true,
    revision: 2
})
assistantStreamPresentation.ingestEvent(event(5, 'thread.message.assistant.completed', {
    threadId: 'thread-1',
    messageId: 'message-1',
    text: 'Hello world!'
}))
assert.equal(assistantStreamPresentation.getSnapshot('message', 'message-1').text, 'Hello world!')
assert.equal(assistantStreamPresentation.getSnapshot('message', 'message-1').streaming, false)
assert.equal(presentationNotifications, 3)
unsubscribeMessage()

assistantStreamPresentation.ingestEvent(activityEvent)
assert.deepEqual(assistantStreamPresentation.getSnapshot('activity', 'activity-1'), {
    text: 'Checking the project',
    streaming: true,
    revision: 1
})
assert.equal(mergeAssistantPresentationText('saved prefix ', 'new suffix'), 'saved prefix new suffix')
assert.equal(mergeAssistantPresentationText('Hello ', 'Hello world'), 'Hello world')
assert.equal(mergeAssistantPresentationText('Hello world', 'world'), 'Hello world')
assert.equal(mergeAssistantPresentationText('prefix overlap', 'overlap suffix'), 'prefix overlap suffix')

const bufferedActivityEntries: string[] = []
const activityBuffer = new AssistantActivityDeltaBuffer({
    flushDelayMs: 10_000,
    onFlush: (entry) => bufferedActivityEntries.push(entry.delta)
})
activityBuffer.queue({
    sessionId: 'session-1',
    threadId: 'thread-1',
    activityId: 'activity-1',
    turnId: 'turn-1',
    itemId: 'item-1',
    streamKind: 'reasoning_text',
    delta: 'Checking ',
    occurredAt: '2026-07-25T00:00:01.000Z'
})
activityBuffer.queue({
    sessionId: 'session-1',
    threadId: 'thread-1',
    activityId: 'activity-1',
    turnId: 'turn-1',
    itemId: 'item-1',
    streamKind: 'reasoning_text',
    delta: 'files',
    occurredAt: '2026-07-25T00:00:02.000Z'
})
activityBuffer.flush({ threadId: 'thread-1' })
assert.deepEqual(bufferedActivityEntries, ['Checking files'])
activityBuffer.dispose()

const fakeSnapshot = { snapshotSequence: 0 } as AssistantSnapshot
const persisted = coalesceAssistantPersistenceEvents([
    { event: textDeltaA, snapshot: fakeSnapshot },
    { event: unrelatedUpdate, snapshot: fakeSnapshot },
    { event: textDeltaB, snapshot: fakeSnapshot },
    { event: activityEvent, snapshot: fakeSnapshot },
    {
        event: event(5, 'thread.activity.appended', {
            threadId: 'thread-1',
            activity: {
                ...streamingActivity,
                detail: 'Checking the project files',
                payload: { status: 'completed', output: 'Checking the project files' }
            }
        }),
        snapshot: fakeSnapshot
    }
])
assert.deepEqual(persisted.map((entry) => entry.event.sequence), [2, 3, 5])

assert.equal(getAssistantInitialVisibleText('first burst', true), '')
assert.equal(getAssistantInitialVisibleText('settled response', false), 'settled response')
assert.equal(getAssistantInitialVisibleText('A'.repeat(500), true).length, 340)
assert.equal(getAssistantStreamRevealCount(100, 'stream', false), 10)
assert.equal(getAssistantStreamRevealCount(100, 'stream', true), 20)
let visible = ''
const target = 'A'.repeat(100)
let frames = 0
const normalBurstBudget = getAssistantStreamRevealCount(target.length, 'stream', false)
while (visible !== target && frames < 20) {
    const next = revealAssistantStreamText(visible, target, 'stream', false, normalBurstBudget)
    assert.ok(next.startsWith(visible), 'the visual stream must only reveal an additional prefix')
    visible = next
    frames += 1
}
assert.equal(visible, target)
assert.ok(frames <= 10, 'a normal burst should drain within its bounded visual lag')

visible = ''
frames = 0
const completionBurstBudget = getAssistantStreamRevealCount(target.length, 'stream', true)
while (visible !== target && frames < 20) {
    visible = revealAssistantStreamText(visible, target, 'stream', true, completionBurstBudget)
    frames += 1
}
assert.equal(visible, target)
assert.ok(frames <= 5, 'completion should drain its remaining text quickly')
assert.equal(revealAssistantStreamText('', '🙂 done', 'stream', false), '🙂', 'a frame must not split a surrogate pair')
assert.ok(revealAssistantStreamText('', 'one complete phrase, then more', 'chunks', false).length >= 4)

assistantStreamPresentation.clear()
console.log('Assistant streaming contracts passed.')
