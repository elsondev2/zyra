import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { createAssistantLongHistoryFixture } from './fixtures/assistant-long-history-fixture'
import { buildTimelineRows, getTimelineEntries } from '../src/renderer/src/pages/assistant/assistant-timeline-helpers'
import { groupTimelineRowsIntoWorkSummaries } from '../src/renderer/src/pages/assistant/assistant-turn-work'
import { computeStableAssistantTimelineRows } from '../src/renderer/src/pages/assistant/assistant-virtual-timeline-rows'
import {
    getAssistantTimelineDistanceFromEnd,
    isAssistantTimelineNearEnd,
    resolveAssistantTimelineScrollMode,
    shouldArmAssistantOlderHistoryLoad
} from '../src/renderer/src/pages/assistant/assistant-timeline-scroll-policy'
import { replaceAssistantTimelineActivityEntry } from '../src/renderer/src/pages/assistant/useAssistantTimelineEntries'

assert.equal(getAssistantTimelineDistanceFromEnd({ scrollHeight: 2_000, scrollTop: 1_100, clientHeight: 700 }), 200)
assert.equal(isAssistantTimelineNearEnd({ scrollHeight: 2_000, scrollTop: 1_220, clientHeight: 700 }), true, 'the 96px floor keeps a near-end reader attached')
assert.equal(isAssistantTimelineNearEnd({ scrollHeight: 2_000, scrollTop: 1_100, clientHeight: 700 }), false)
assert.equal(resolveAssistantTimelineScrollMode({ scrollHeight: 2_000, scrollTop: 1_220, clientHeight: 700 }), 'following-end')
assert.equal(resolveAssistantTimelineScrollMode({ scrollHeight: 2_000, scrollTop: 400, clientHeight: 700 }), 'free-scrolling')
assert.equal(shouldArmAssistantOlderHistoryLoad({ startupSettled: false, upwardIntent: true }), false, 'initial end positioning cannot trigger an older-page prepend')
assert.equal(shouldArmAssistantOlderHistoryLoad({ startupSettled: true, upwardIntent: false }), false, 'ordinary end-follow scroll events cannot trigger history loading')
assert.equal(shouldArmAssistantOlderHistoryLoad({ startupSettled: true, upwardIntent: true }), true, 'settled upward navigation can load one older page')

const snapshot = createAssistantLongHistoryFixture()
const thread = snapshot.sessions[0]!.threads[0]!
const activityFeed = [...thread.activities].reverse()
const derivationSamples: number[] = []
let entries = getTimelineEntries(thread.messages, activityFeed, thread.proposedPlans)
for (let sample = 0; sample < 3; sample += 1) {
    const startedAt = performance.now()
    entries = getTimelineEntries(thread.messages, activityFeed, thread.proposedPlans)
    derivationSamples.push(performance.now() - startedAt)
}
assert.equal(entries.length, 3_020, 'the 1,000-turn fixture keeps grouped tool rows while retaining every message and plan')

const renderRows = buildTimelineRows(entries, false, null)
const displayRows = groupTimelineRowsIntoWorkSummaries({
    rows: renderRows,
    messages: thread.messages,
    latestAssistantMessageId: thread.messages.findLast((message) => message.role === 'assistant')?.id || null,
    latestTurnStartedAt: null,
    isWorking: false
})
assert.equal(displayRows.length, 3_020)

const initialWindow = displayRows.slice(-120)
const stableInitial = computeStableAssistantTimelineRows(null, initialWindow)
const prependedWindow = displayRows.slice(-180, -120)
const stablePrepend = computeStableAssistantTimelineRows(stableInitial, [...prependedWindow, ...initialWindow])
assert.equal(stablePrepend.rows[prependedWindow.length], stableInitial.rows[0], 'a long-history prepend preserves the first previously visible row reference')
assert.equal(stablePrepend.rows.at(-1), stableInitial.rows.at(-1), 'a long-history prepend preserves the live-edge row reference')

const previousActivity = activityFeed[0]!
const nextActivity = {
    ...previousActivity,
    detail: `${previousActivity.detail || ''}:updated`,
    payload: { ...previousActivity.payload, output: 'updated without rebuilding 1,000 turns' }
}
const incrementalStartedAt = performance.now()
const incrementallyUpdatedEntries = replaceAssistantTimelineActivityEntry(entries, previousActivity, nextActivity)
const incrementalMs = performance.now() - incrementalStartedAt
assert.ok(incrementallyUpdatedEntries, 'a lifecycle update inside a grouped tool row uses the incremental projection path')
const changedEntryIndices = incrementallyUpdatedEntries!.flatMap((entry, index) => entry === entries[index] ? [] : [index])
assert.deepEqual(changedEntryIndices.length, 1, 'one tool lifecycle update changes exactly one virtual timeline entry')
const changedEntry = incrementallyUpdatedEntries![changedEntryIndices[0]!]!
assert.equal(
    changedEntry.type === 'activity-group'
        ? changedEntry.activities.some((activity) => activity === nextActivity)
        : changedEntry.type === 'activity' && changedEntry.activity === nextActivity,
    true,
    'the updated activity reaches its existing standalone or grouped row'
)
assert.ok(incrementalMs < 100, 'a single tool lifecycle update remains bounded on the 1,000-turn fixture')

const virtualTimelineSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantVirtualTimeline.tsx', import.meta.url), 'utf8')
assert.equal(virtualTimelineSource.includes('initialScrollAtEnd'), true, 'LegendList owns initial positioning at the newest row')
assert.equal(virtualTimelineSource.includes('onLoad={handleInitialLoad}'), true, 'history loading is armed only after LegendList reports initial layout and scrolling complete')
assert.equal(virtualTimelineSource.includes('INITIAL_END_FOLLOW_DELAYS_MS'), false, 'bootstrap positioning has no retry-timer ladder')
assert.equal(virtualTimelineSource.includes('COMPLETION_END_FOLLOW_DELAYS_MS'), false, 'completion positioning has no retry-timer ladder')
assert.equal(virtualTimelineSource.includes('scrollElement.scrollTop ='), false, 'the virtual list and native DOM never compete to own the viewport')
assert.equal(virtualTimelineSource.includes('previousContentInsetEndRef'), false, 'LegendList alone applies animated composer inset adjustments')
assert.equal(virtualTimelineSource.includes('maintainVisibleContentPosition={{ data: true, size: false }}'), true, 'prepends preserve their anchor without correcting ordinary row resizing under the pointer')
assert.equal(virtualTimelineSource.includes("addEventListener(ASSISTANT_TIMELINE_USER_JUMP_EVENT"), true, 'checkpoint and latest-button navigation explicitly leave live-follow mode')
assert.equal(virtualTimelineSource.includes('completionFollowTimerRef'), true, 'completion retains one bounded post-layout correction')
assert.equal(virtualTimelineSource.includes('if (endAlignmentFrameRef.current !== null) return'), true, 'end corrections coalesce to one animation frame')
assert.equal(virtualTimelineSource.includes('startupSettled && olderLoadIntent && props.hasOlder'), true, 'pagination still requires settled startup plus upward user intent')
assert.equal(virtualTimelineSource.includes('onStartReachedThreshold={1.25}'), true, 'older history prefetch starts more than one viewport before the visible boundary')
assert.equal(virtualTimelineSource.includes('<span className="sr-only" role="status">Loading earlier messages</span>'), true, 'normal older-history loading remains visually silent')
assert.equal(virtualTimelineSource.includes("props.loadOlderError ? 'Retry earlier messages'"), false, 'the visible pill is reserved for a real retry state')

console.log(JSON.stringify({
    fixture: { turns: 1_000, entries: entries.length, displayRows: displayRows.length },
    timelineDerivationMs: derivationSamples.map((value) => Number(value.toFixed(2))),
    incrementalActivityUpdateMs: Number(incrementalMs.toFixed(2))
}, null, 2))
console.log('Assistant timeline scroll contract: ok')
