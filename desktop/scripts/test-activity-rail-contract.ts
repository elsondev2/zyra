import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AssistantActivity, AssistantMessage, AssistantSessionTurnUsageEntry } from '../src/shared/assistant/contracts'
import { AssistantInlineDiffPreview } from '../src/renderer/src/pages/assistant/AssistantInlineDiffPreview'
import { TimelineToolCallCard } from '../src/renderer/src/pages/assistant/AssistantTimelineToolCallCard'
import {
    AssistantFileChangeStatusPill,
    resolveAssistantFileChangeStatus
} from '../src/renderer/src/pages/assistant/AssistantFileChangeStatusPill'
import {
    buildBaseCheckpoints,
    resolveTimelineMinimapHeight,
    resolveTimelineMinimapIndexFromPointer,
    resolveTimelineMinimapMarkerWidth,
    resolveTimelineMinimapWindow,
    TIMELINE_MINIMAP_MAX_MARKERS
} from '../src/renderer/src/pages/assistant/AssistantTimelineCheckpointRail'
import { TimelineTurnWorkSummary } from '../src/renderer/src/pages/assistant/AssistantTimelineWorkSummary'
import { TimelineVoiceTaskStatus } from '../src/renderer/src/pages/assistant/AssistantTimelineVoiceTask'
import { IssueLogRow } from '../src/renderer/src/pages/assistant/AssistantPageHelpers'
import { sanitizeThoughtContent, TimelineCommandCheckpointGroup, TimelineContextCompactionMarker, TimelineMessage, TimelineThought, TimelineThoughtGroup, TimelineWorkTraceGroup } from '../src/renderer/src/pages/assistant/AssistantTimelineRows'
import { COLLAPSED_TOOL_CALL_COUNT, TimelineToolCallList } from '../src/renderer/src/pages/assistant/AssistantTimelineToolCalls'
import { stripProposedPlanBlocks } from '../src/renderer/src/pages/assistant/assistant-proposed-plan'
import { getTerminalOutputHeightClass } from '../src/renderer/src/pages/assistant/assistant-timeline-layout'
import { groupTimelineRowsIntoWorkSummaries } from '../src/renderer/src/pages/assistant/assistant-turn-work'
import {
    didAssistantTimelineWorkComplete,
    resolveAssistantTimelineDisclosureAnchorMode
} from '../src/renderer/src/pages/assistant/assistant-timeline-scroll-events'
import {
    buildTimelineRows,
    countRunningCommandActivities,
    findRelatedCommandActivityId,
    getActivityAgentSurface,
    getActivityElapsed,
    getActivityStatus,
    getCommandCheckpointAction,
    getCommandJobId,
    getContextCompactionStatus,
    getTimelineEntries,
    isCommandCheckpointActivity,
    isInternalAssistantActivity,
    isModelNoticeActivity
} from '../src/renderer/src/pages/assistant/assistant-timeline-helpers'

const iso = (millisecond: number) => new Date(Date.parse('2026-07-10T09:52:00.000Z') + millisecond).toISOString()

function message(input: {
    id: string
    role: AssistantMessage['role']
    turnId: string
    millisecond: number
    text: string
    timelineSequence?: number
}): AssistantMessage {
    return {
        id: input.id,
        role: input.role,
        text: input.text,
        turnId: input.turnId,
        streaming: false,
        timelineSequence: input.timelineSequence,
        createdAt: iso(input.millisecond),
        updatedAt: iso(input.millisecond)
    }
}

function activity(input: {
    id: string
    turnId: string
    millisecond: number
    internal?: boolean
    tone?: AssistantActivity['tone']
    timelineSequence?: number
}): AssistantActivity {
    return {
        id: input.id,
        kind: input.internal ? 'assistant.internal' : 'command',
        tone: input.tone || 'tool',
        summary: input.internal ? 'Internal message' : 'Ran command',
        detail: input.internal ? `Thought ${input.id}` : `Command ${input.id}`,
        turnId: input.turnId,
        timelineSequence: input.timelineSequence,
        createdAt: iso(input.millisecond),
        payload: input.internal
            ? { category: 'assistant-internal', output: `Thought ${input.id}`, status: 'completed' }
            : { command: `echo ${input.id}`, output: input.id, status: 'completed' }
    }
}

const runningCompactionActivity: AssistantActivity = {
    id: 'context-compaction-lifecycle',
    kind: 'context.compaction',
    tone: 'tool',
    summary: 'AUTO-COMPACTING',
    detail: 'Conversation context is being compacted.',
    turnId: 'turn-compaction',
    createdAt: iso(0),
    payload: { category: 'context-compaction', status: 'running', startedAt: iso(0) }
}
const completedCompactionActivity: AssistantActivity = {
    ...runningCompactionActivity,
    summary: 'AUTO-COMPACTED',
    payload: { ...runningCompactionActivity.payload, status: 'completed', completedAt: iso(1200) }
}
const cancelledCompactionActivity: AssistantActivity = {
    ...completedCompactionActivity,
    tone: 'warning',
    summary: 'AUTO-COMPACTION CANCELLED',
    payload: { ...completedCompactionActivity.payload, status: 'cancelled' }
}
assert.equal(getContextCompactionStatus(runningCompactionActivity), 'running')
assert.equal(getContextCompactionStatus(completedCompactionActivity), 'completed')
assert.equal(getContextCompactionStatus(cancelledCompactionActivity), 'cancelled')
assert.equal(renderToStaticMarkup(createElement(TimelineContextCompactionMarker, { activity: runningCompactionActivity })).includes('AUTO-COMPACTING'), true)
assert.equal(renderToStaticMarkup(createElement(TimelineContextCompactionMarker, { activity: completedCompactionActivity })).includes('AUTO-COMPACTED'), true)
assert.equal(renderToStaticMarkup(createElement(TimelineContextCompactionMarker, { activity: cancelledCompactionActivity })).includes('AUTO-COMPACTION CANCELLED'), true)

const compactWarningMarkup = renderToStaticMarkup(createElement(IssueLogRow, {
    activity: cancelledCompactionActivity,
    activities: [
        cancelledCompactionActivity,
        { ...cancelledCompactionActivity, id: 'context-compaction-lifecycle-2' },
        { ...cancelledCompactionActivity, id: 'context-compaction-lifecycle-3' }
    ],
    count: 3,
    compact: true,
    onDismiss: () => {},
    onShowMore: () => {}
}))
assert.equal(compactWarningMarkup.includes('min-h-8'), true, 'chat warning rows use the slim compact layout')
assert.equal(compactWarningMarkup.includes('line-clamp-2'), false, 'chat warning rows remain on one line')
assert.equal(compactWarningMarkup.includes('>Details<'), false, 'the compact warning row itself opens details without a redundant action')
assert.equal(compactWarningMarkup.indexOf('x3') < compactWarningMarkup.indexOf('Dismiss warning options'), true, 'the repeat count appears before the warning actions menu')

const turnId = 'turn-devscope-sequence'
const messages = [
    message({ id: 'user', role: 'user', turnId, millisecond: 0, text: 'Run the harness checks.' }),
    message({ id: 'progress-one', role: 'assistant', turnId, millisecond: 100, text: 'I’ll inspect the repository and run a few safe commands.' }),
    message({ id: 'progress-two', role: 'assistant', turnId, millisecond: 400, text: 'The first batch passed. I’m running the project tests now.' }),
    message({ id: 'final', role: 'assistant', turnId, millisecond: 700, text: '## Harness results\n\n| Check | Result |\n| --- | --- |\n| Tests | Passed |' })
]
const activities = [
    activity({ id: 'tool-build', turnId, millisecond: 600 }),
    activity({ id: 'tool-tests', turnId, millisecond: 500 }),
    activity({ id: 'thought-hidden', turnId, millisecond: 350, internal: true }),
    activity({ id: 'tool-files', turnId, millisecond: 300 }),
    activity({ id: 'tool-location', turnId, millisecond: 200 })
]

const entries = getTimelineEntries(messages, activities)
assert.deepEqual(
    entries.map((entry) => {
        if (entry.type === 'message') return entry.message.id
        if (entry.type === 'activity-group') return entry.activities.map((item) => item.id)
        if (entry.type === 'activity') return entry.activity.id
        return entry.id
    }),
    [
        'user',
        'progress-one',
        ['tool-location', 'tool-files'],
        'thought-hidden',
        'progress-two',
        ['tool-tests', 'tool-build'],
        'final'
    ],
    'the timeline must preserve narration -> tool batch -> narration -> tool batch -> final Markdown'
)
assert.equal(
    entries.some((entry) => entry.type === 'activity' && entry.activity.id === 'thought-hidden'),
    true,
    'model thought must remain a distinct collapsible row instead of merging into narration'
)
const thoughtEntry = entries.find((entry) => entry.type === 'activity' && entry.activity.id === 'thought-hidden')
assert.equal(thoughtEntry?.type === 'activity' && isInternalAssistantActivity(thoughtEntry.activity), true)
assert.deepEqual(
    entries.filter((entry) => entry.type === 'message' && entry.message.role === 'assistant').map((entry) => entry.type === 'message' ? entry.message.id : ''),
    ['progress-one', 'progress-two', 'final'],
    'intermediate assistant narration and the final answer must remain distinct visible messages'
)

const completedRows = buildTimelineRows(entries, false, null)
assert.equal(completedRows.map((row) => String(row.kind)).includes('turn-work-summary'), false, 'the conversation must not collapse into a turn summary rail')
assert.equal(completedRows.some((row) => row.kind === 'working'), false)

const workingRows = buildTimelineRows(entries.slice(0, -1), true, iso(0))
assert.equal(workingRows[1]?.kind, 'working', 'active work places its timer directly after the user request and before live work')
const activeTurnRows = groupTimelineRowsIntoWorkSummaries({
    rows: workingRows,
    messages: messages.slice(0, -1),
    latestAssistantMessageId: 'progress-two',
    latestTurnStartedAt: iso(0),
    isWorking: true
})
assert.deepEqual(
    activeTurnRows.map((row) => row.kind),
    ['message', 'turn-work-summary'],
    'live turns keep work and its state-aware narration in one disclosure shell'
)
const activeWorkSummary = activeTurnRows[1]
assert.equal(activeWorkSummary?.kind === 'turn-work-summary' && activeWorkSummary.running, true)
assert.equal(
    activeWorkSummary?.kind === 'turn-work-summary'
        ? activeWorkSummary.rows.some((row) => row.kind === 'working')
        : true,
    false,
    'the old standalone working indicator is absorbed by the live disclosure header'
)
assert.equal(
    activeWorkSummary?.kind === 'turn-work-summary' && activeWorkSummary.liveNarrationRow?.kind === 'message'
        ? activeWorkSummary.liveNarrationRow.message.id
        : null,
    'progress-two',
    'the latest real assistant narration also supplies the collapsed preview'
)
const expandedNarrationIndex = activeWorkSummary?.kind === 'turn-work-summary'
    ? activeWorkSummary.rows.findIndex((row) => row.kind === 'message' && row.message.id === 'progress-two')
    : -1
const laterToolIndex = activeWorkSummary?.kind === 'turn-work-summary'
    ? activeWorkSummary.rows.findIndex((row) => row.kind === 'activity-group' && row.activities.some((activity) => activity.id === 'tool-tests'))
    : -1
assert.equal(
    expandedNarrationIndex >= 0 && laterToolIndex > expandedNarrationIndex,
    true,
    'expanded work keeps narration in arrival order instead of forcing the latest narration to the bottom'
)

const endCompactionActivity: AssistantActivity = {
    ...runningCompactionActivity,
    id: 'context-compaction-after-final',
    turnId,
    createdAt: iso(800),
    payload: { ...runningCompactionActivity.payload, startedAt: iso(800) }
}
const compactingAfterFinalRows = groupTimelineRowsIntoWorkSummaries({
    rows: buildTimelineRows(getTimelineEntries(messages, [...activities, endCompactionActivity]), true, iso(0)),
    messages,
    latestAssistantMessageId: 'final',
    latestTurnStartedAt: iso(0),
    isWorking: true
})
const visibleFinalIndex = compactingAfterFinalRows.findIndex((row) => row.kind === 'message' && row.message.id === 'final')
const liveCompactionIndex = compactingAfterFinalRows.findIndex((row) => row.kind === 'activity' && row.activity.id === endCompactionActivity.id)
assert.equal(visibleFinalIndex > 0, true, 'a completed final response becomes a full timeline row before end-of-turn auto-compaction finishes')
assert.equal(liveCompactionIndex > visibleFinalIndex, true, 'running auto-compaction remains a separate marker after the already-visible final response')
assert.equal(
    compactingAfterFinalRows.some((row) => row.kind === 'turn-work-summary' && row.running),
    true,
    'the runtime may remain busy compacting without absorbing the settled final response back into Working'
)

const collapsedTurnRows = groupTimelineRowsIntoWorkSummaries({
    rows: completedRows,
    messages,
    latestAssistantMessageId: 'final',
    latestTurnStartedAt: iso(0),
    isWorking: false
})
assert.deepEqual(
    collapsedTurnRows.map((row) => row.kind),
    ['message', 'turn-work-summary', 'message'],
    'the request and final response remain visible while the entire working phase collapses between them'
)
const workSummary = collapsedTurnRows[1]
assert.equal(workSummary?.kind === 'turn-work-summary' ? workSummary.rows.length : 0, 5)

const aliasedCompletedCompaction: AssistantActivity = {
    ...completedCompactionActivity,
    id: 'context-compaction-app-server-turn-alias',
    turnId: 'app-server-turn-alias',
    createdAt: iso(450),
    payload: {
        ...completedCompactionActivity.payload,
        startedAt: iso(425),
        completedAt: iso(450)
    }
}
const collapsedRowsWithTurnAlias = groupTimelineRowsIntoWorkSummaries({
    rows: buildTimelineRows(getTimelineEntries(messages, [...activities, aliasedCompletedCompaction]), false, null),
    messages,
    latestAssistantMessageId: 'final',
    latestTurnStartedAt: iso(0),
    isWorking: false
})
assert.deepEqual(
    collapsedRowsWithTurnAlias.map((row) => row.kind),
    ['message', 'turn-work-summary', 'message'],
    'a live app-server compaction ID inside one canonical user/final boundary cannot expose the completed work'
)
assert.equal(
    collapsedRowsWithTurnAlias[1]?.kind === 'turn-work-summary'
        ? collapsedRowsWithTurnAlias[1].rows.some((row) => row.id === aliasedCompletedCompaction.id)
        : false,
    true,
    'the aliased lifecycle row remains available inside the completed work disclosure'
)

const pendingNextUser: AssistantMessage = {
    ...message({ id: 'pending-next-user', role: 'user', turnId: 'pending-next-turn', millisecond: 800, text: 'Start the next task.' }),
    turnId: null
}
const rowsAfterSendingNextMessage = groupTimelineRowsIntoWorkSummaries({
    rows: buildTimelineRows(getTimelineEntries([...messages, pendingNextUser], activities), true, pendingNextUser.createdAt),
    messages: [...messages, pendingNextUser],
    latestAssistantMessageId: null,
    latestTurnStartedAt: pendingNextUser.createdAt,
    isWorking: true
})
const summariesAfterSendingNextMessage = rowsAfterSendingNextMessage.filter((row) => row.kind === 'turn-work-summary')
assert.equal(summariesAfterSendingNextMessage.length, 2, 'sending a new message keeps the previous Worked for disclosure mounted beside the new working disclosure')
assert.equal(new Set(summariesAfterSendingNextMessage.map((row) => row.id)).size, 2, 'the pending turn cannot reuse the previous completed work summary identity')
assert.equal(
    summariesAfterSendingNextMessage[0]?.kind === 'turn-work-summary' ? summariesAfterSendingNextMessage[0].turnId : null,
    turnId,
    'the preserved historical disclosure remains attached to its completed turn'
)
assert.equal(
    summariesAfterSendingNextMessage[1]?.kind === 'turn-work-summary' ? summariesAfterSendingNextMessage[1].turnId : 'unexpected',
    null,
    'an optimistic user message waits for its own turn ID instead of borrowing the previous turn ID'
)

const freshTurnId = 'turn-after-stale-running-ledger'
const freshTurnStartedAt = iso(900)
const freshUser = message({
    id: 'fresh-user-after-stale-running-ledger',
    role: 'user',
    turnId: freshTurnId,
    millisecond: 900,
    text: 'Run one more independent task.'
})
const staleRunningUsage: AssistantSessionTurnUsageEntry = {
    id: turnId,
    sessionId: 'session-activity-rail',
    threadId: 'thread-activity-rail',
    model: 'openai-codex/gpt-5.5',
    state: 'running',
    requestedAt: iso(0),
    startedAt: iso(0),
    completedAt: null,
    assistantMessageId: 'final',
    effort: 'high',
    serviceTier: null,
    usage: null,
    updatedAt: iso(800)
}
const rowsWithStaleRunningLedger = groupTimelineRowsIntoWorkSummaries({
    rows: buildTimelineRows(getTimelineEntries([...messages, freshUser], activities), true, freshTurnStartedAt),
    messages: [...messages, freshUser],
    turnUsageById: new Map([[turnId, staleRunningUsage]]),
    latestAssistantMessageId: null,
    latestTurnStartedAt: freshTurnStartedAt,
    isWorking: true
})
const summaryAfterStaleRunningLedger = rowsWithStaleRunningLedger.find((row) => (
    row.kind === 'turn-work-summary' && row.running
))
assert.equal(
    summaryAfterStaleRunningLedger?.kind === 'turn-work-summary' ? summaryAfterStaleRunningLedger.turnId : null,
    freshTurnId,
    'the newest visible prompt must outrank a stale running turn ledger entry'
)
assert.equal(
    summaryAfterStaleRunningLedger?.kind === 'turn-work-summary' ? summaryAfterStaleRunningLedger.startedAt : null,
    freshTurnStartedAt,
    'a new prompt timer must not inherit the stale turn start time'
)
assert.equal(
    rowsWithStaleRunningLedger.some((row) => (
        row.kind === 'turn-work-summary' && !row.running && row.turnId === turnId
    )),
    true,
    'completed work remains collapsed while the independent next turn is running'
)
const workSummaryMarkup = renderToStaticMarkup(createElement(TimelineTurnWorkSummary, {
    startedAt: iso(0),
    completedAt: iso(60_000),
    children: createElement('div', null, 'Chronological work')
}))
assert.equal(workSummaryMarkup.includes('Worked for 1m'), true)
assert.equal(workSummaryMarkup.includes('data-state="closed"'), true, 'completed work is collapsed by default')
assert.equal(workSummaryMarkup.includes('transition-duration:320ms'), true, 'work disclosure uses the calmer long-form motion timing')
assert.equal(workSummaryMarkup.includes('Collapse work'), false, 'work uses one disclosure control instead of repeating a footer action')
const workSummarySource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantTimelineWorkSummary.tsx', import.meta.url), 'utf8')
assert.equal(workSummarySource.includes("expanded && 'sticky top-0 z-10 bg-sparkle-bg/95 backdrop-blur-md'"), true, 'the expanded work header remains reachable while scrolling through long work')
assert.equal(workSummarySource.includes('if (!wasRunning || running) return'), true, 'work auto-collapses exactly when a running turn completes')
assert.equal(workSummarySource.includes('statusTextRef.current.textContent = formatWorkSummaryStatus'), true, 'the live work timer updates its own text without reconciling the expanded work subtree')
assert.equal(workSummarySource.includes('duration={WORK_SUMMARY_MOTION_MS} crispContent'), true, 'large work disclosures animate height without fading and compositing the complete work subtree')
assert.equal(workSummarySource.includes('setNowIso'), false, 'the shared work disclosure does not schedule a React render every second')
const runningWorkSummaryMarkup = renderToStaticMarkup(createElement(TimelineTurnWorkSummary, {
    startedAt: new Date().toISOString(),
    completedAt: null,
    running: true,
    children: createElement('div', null, 'Live implementation work')
}))
assert.equal(runningWorkSummaryMarkup.includes('Working for'), true, 'the shared disclosure presents its live elapsed state')
assert.equal(runningWorkSummaryMarkup.includes('data-state="open"'), true, 'live work starts expanded and remains user-collapsible')

const interruptedTurnId = 'turn-interrupted-without-final'
const interruptedPrompt: AssistantMessage = {
    ...message({ id: 'interrupted-user', role: 'user', turnId: interruptedTurnId, millisecond: 800, text: 'Start work, then stop.' }),
    turnId: null
}
const interruptedNarration = message({ id: 'interrupted-progress', role: 'assistant', turnId: interruptedTurnId, millisecond: 850, text: 'I am working on it.' })
const interruptedTool = activity({ id: 'interrupted-tool', turnId: interruptedTurnId, millisecond: 900 })
const raceTaggedTool = activity({ id: 'interrupted-tool-with-next-turn-id', turnId: 'next-turn-id', millisecond: 910 })
const interruptedUsage: AssistantSessionTurnUsageEntry = {
    id: interruptedTurnId,
    sessionId: 'session-interrupted',
    threadId: 'thread-interrupted',
    model: 'test-model',
    state: 'interrupted',
    requestedAt: interruptedPrompt.createdAt,
    startedAt: interruptedPrompt.createdAt,
    completedAt: iso(1800),
    assistantMessageId: interruptedNarration.id,
    usage: null,
    updatedAt: iso(1800)
}
const interruptedRows = groupTimelineRowsIntoWorkSummaries({
    rows: buildTimelineRows(getTimelineEntries([interruptedPrompt, interruptedNarration], [raceTaggedTool, interruptedTool]), false, null),
    messages: [interruptedPrompt, interruptedNarration],
    turnUsageById: new Map([[interruptedTurnId, interruptedUsage]]),
    latestAssistantMessageId: null,
    latestTurnStartedAt: null,
    isWorking: false
})
assert.deepEqual(interruptedRows.map((row) => row.kind), ['message', 'turn-work-summary'], 'legacy interrupted turns collapse even when the user prompt has no turn ID and only progress narration exists')
const interruptedSummary = interruptedRows[1]
assert.equal(interruptedSummary?.kind === 'turn-work-summary' ? interruptedSummary.outcome : null, 'interrupted')
assert.equal(interruptedSummary?.kind === 'turn-work-summary'
    ? interruptedSummary.rows.some((row) => (
        (row.kind === 'activity' && row.activity.id === raceTaggedTool.id)
        || (row.kind === 'activity-group' && row.activities.some((entry) => entry.id === raceTaggedTool.id))
    ))
    : false, true, 'legacy prompt boundaries retain work rows that were race-tagged with the following turn ID')
const interruptedMarkup = renderToStaticMarkup(createElement(TimelineTurnWorkSummary, {
    startedAt: interruptedPrompt.createdAt,
    completedAt: iso(1800),
    outcome: 'interrupted',
    children: createElement('div', null, 'Interrupted work')
}))
assert.equal(interruptedMarkup.includes('Worked for'), true)
assert.equal(interruptedMarkup.includes('Interrupted'), true)
assert.equal(interruptedMarkup.includes('data-state="closed"'), true)

const orphanTurnId = 'turn-no-final-response'
const orphanPrompt = message({ id: 'orphan-user', role: 'user', turnId: orphanTurnId, millisecond: 2000, text: 'Do work without a final response.' })
const orphanTool = activity({ id: 'orphan-tool', turnId: orphanTurnId, millisecond: 2200 })
const orphanRows = groupTimelineRowsIntoWorkSummaries({
    rows: buildTimelineRows(getTimelineEntries([orphanPrompt], [orphanTool]), false, null),
    messages: [orphanPrompt],
    latestAssistantMessageId: null,
    latestTurnStartedAt: null,
    isWorking: false
})
assert.equal(orphanRows[1]?.kind === 'turn-work-summary' ? orphanRows[1].outcome : null, 'no-response', 'historical orphan turns receive a truthful no-response work summary')

const timelineSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantTimeline.tsx', import.meta.url), 'utf8')
const virtualTimelineSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantVirtualTimeline.tsx', import.meta.url), 'utf8')
const historyStoreSource = readFileSync(new URL('../src/renderer/src/lib/assistant/assistant-store-core.ts', import.meta.url), 'utf8')
const historyStateSource = readFileSync(new URL('../src/renderer/src/lib/assistant/assistant-history-state.ts', import.meta.url), 'utf8')
assert.equal(timelineSource.includes('<AssistantVirtualTimeline'), true, 'the timeline delegates mounting and measurement to the virtual list owner')
assert.equal(virtualTimelineSource.includes('<LegendList'), true, 'long histories render through LegendList rather than renderer-only slicing')
assert.equal(virtualTimelineSource.includes('maintainVisibleContentPosition={{ data: true, size: false }}'), true, 'database-page prepends preserve the measured visible anchor without correcting ordinary row resizes under the pointer')
assert.equal(virtualTimelineSource.includes('itemLayout: !disclosureLayoutActive'), true, 'user disclosures suspend item-layout end-follow while their row height animates')
assert.equal(virtualTimelineSource.includes('layout: !disclosureLayoutActive'), true, 'viewport layout follow cannot compete with an active disclosure anchor')
assert.equal(virtualTimelineSource.includes("addEventListener('pointerdown', handleTimelinePointerDown"), true, 'timeline controls suspend layout follow before their React click changes row height')
assert.equal(virtualTimelineSource.includes('ASSISTANT_TIMELINE_DISCLOSURE_TOGGLE_EVENT'), true, 'automatic work collapse uses the same bounded disclosure window')
assert.equal(virtualTimelineSource.includes('completionFollowTimerRef'), true, 'turn completion owns one bounded post-layout end correction through work collapse and Markdown handoff')
assert.equal(virtualTimelineSource.includes("scrollModeRef.current !== 'following-end'"), true, 'completion follow only activates when the viewer was already following the response end')
assert.equal(virtualTimelineSource.includes('COMPLETION_END_FOLLOW_DELAYS_MS'), false, 'turn completion cannot replay a viewport correction ladder')
assert.equal(historyStoreSource.includes('getHistoryPage({'), true, 'earlier history comes from the main-process SQLite page contract')
assert.equal(historyStateSource.includes('5 * 60_000'), true, 'recent thread detail is retained for a bounded five-minute idle window')
assert.equal(timelineSource.includes('compactLiveNarration: true'), true, 'the staged preview remains mounted so it can retain the last settled narration')
assert.equal(timelineSource.includes("expanded && 'hidden'"), true, 'expanded work hides the compact preview and uses only chronological work rows')
const compactNarrationMarkup = renderToStaticMarkup(createElement(TimelineMessage, {
    message: messages[1],
    compactLiveNarration: true
}))
assert.equal(compactNarrationMarkup.includes('line-clamp-3'), true, 'collapsed narration is capped at three lines')
assert.equal(compactNarrationMarkup.includes('Show full narration'), false, 'compact narration is a preview rather than a second disclosure')
assert.equal(compactNarrationMarkup.includes('aria-expanded'), false, 'compact narration cannot create a duplicate expandable control')
const streamingCompactNarrationMarkup = renderToStaticMarkup(createElement(TimelineMessage, {
    message: { ...messages[1], text: 'Narrating live work', streaming: true },
    compactLiveNarration: true
}))
assert.equal(streamingCompactNarrationMarkup.includes('Narrating live work'), true, 'compact work narration paints its paced live text before settlement')
const activeWorkMarkup = renderToStaticMarkup(createElement(TimelineTurnWorkSummary, {
    startedAt: messages[0].createdAt,
    completedAt: null,
    running: true,
    children: createElement('div', null, 'Active work'),
    renderLiveNarration: () => createElement(TimelineMessage, {
        message: messages[1],
        compactLiveNarration: true
    })
}))
assert.equal((activeWorkMarkup.match(/aria-expanded=/g) || []).length, 1, 'an active turn exposes exactly one work disclosure')
const timelineRowsSourceForNarration = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantTimelineRows.tsx', import.meta.url), 'utf8')
assert.equal(timelineRowsSourceForNarration.includes("message.role !== 'assistant' || message.streaming"), true, 'the settled narration snapshot waits for completion while paced live text remains visible')
const timelineCssSource = readFileSync(new URL('../src/renderer/src/index.css', import.meta.url), 'utf8')
assert.equal(timelineCssSource.includes('assistantNarrationShimmer 6.5s ease-in-out infinite'), true, 'collapsed narration uses a deliberately slow shimmer')
assert.equal(timelineCssSource.includes('assistantNarrationIn 420ms'), true, 'settled narration changes use a measured seamless handoff')

assert.equal(didAssistantTimelineWorkComplete(
    [{ id: 'active-summary', kind: 'turn-work-summary', running: true, turnId: 'turn-live' }],
    [{ id: 'active-summary', kind: 'turn-work-summary', running: false, turnId: 'turn-live' }]
), true, 'the same work summary detects its running-to-completed transition')
assert.equal(didAssistantTimelineWorkComplete(
    [{ id: 'active-fallback', kind: 'turn-work-summary', running: true, turnId: 'turn-live' }],
    [{ id: 'persisted-turn-live', kind: 'turn-work-summary', running: false, turnId: 'turn-live' }]
), true, 'turn identity preserves completion detection when projection changes the summary row id')
assert.equal(didAssistantTimelineWorkComplete(
    [{ id: 'older-summary', kind: 'turn-work-summary', running: false, turnId: 'turn-old' }],
    [{ id: 'new-summary', kind: 'turn-work-summary', running: false, turnId: 'turn-new' }]
), false, 'ordinary historical row changes never force end-follow')

assert.equal(resolveAssistantTimelineDisclosureAnchorMode({
    expanding: true,
    hasWorkRow: true,
    userMessageVisibilityRatio: 0.7,
    dominantMessageVisibleHeight: 0,
    viewportHeight: 800
}), 'preserve-user', 'expansion keeps a meaningfully visible user prompt fixed in the viewport')
assert.equal(resolveAssistantTimelineDisclosureAnchorMode({
    expanding: true,
    hasWorkRow: true,
    userMessageVisibilityRatio: 0,
    dominantMessageVisibleHeight: 500,
    viewportHeight: 800
}), 'center-work', 'expansion from lower in the turn settles around the work region instead of the final message')
assert.equal(resolveAssistantTimelineDisclosureAnchorMode({
    expanding: false,
    hasWorkRow: true,
    userMessageVisibilityRatio: 0,
    dominantMessageVisibleHeight: 320,
    viewportHeight: 800
}), 'preserve-message', 'collapse preserves the message occupying a substantial part of the viewport')
assert.equal(resolveAssistantTimelineDisclosureAnchorMode({
    expanding: false,
    hasWorkRow: true,
    userMessageVisibilityRatio: 0,
    dominantMessageVisibleHeight: 80,
    viewportHeight: 800
}), 'preserve-trigger', 'collapse falls back to the disclosure header when no message dominates the viewport')

assert.equal(resolveTimelineMinimapHeight(8, 800), 56, 'the minimap uses compact eight-pixel checkpoint spacing')
assert.deepEqual(
    resolveTimelineMinimapWindow(100, 50),
    { startIndex: 36, endIndex: 64, hiddenBefore: 36, hiddenAfter: 36 },
    'long chats expose a centered rolling minimap window'
)
assert.equal(TIMELINE_MINIMAP_MAX_MARKERS, 28, 'the minimap never accumulates an unbounded dash field')
assert.equal(resolveTimelineMinimapIndexFromPointer({ itemCount: 8, railTop: 100, railHeight: 56, pointerY: 124 }), 3)
assert.deepEqual(
    [0, 1, 2, 3].map((distance) => resolveTimelineMinimapMarkerWidth(distance)),
    [24, 17, 14, 12],
    'every checkpoint, including the current one, follows the same hover wave'
)

const legacyUserMessage: AssistantMessage = { ...messages[0], turnId: null }
const legacyFailedCommand = activity({ id: 'legacy-failed-command', turnId, millisecond: 250, tone: 'error' })
const legacyRows = buildTimelineRows(
    getTimelineEntries([legacyUserMessage, ...messages.slice(1)], [legacyFailedCommand, ...activities]),
    false,
    null
)
const legacyCollapsedRows = groupTimelineRowsIntoWorkSummaries({
    rows: legacyRows,
    messages: [legacyUserMessage, ...messages.slice(1)],
    latestAssistantMessageId: 'final',
    latestTurnStartedAt: iso(0),
    isWorking: false
})
assert.equal(
    legacyCollapsedRows.some((row) => row.kind === 'turn-work-summary'),
    true,
    'legacy prompts without turn IDs still collapse completed narration, checks, and failed commands into their work summary'
)
assert.equal(
    buildBaseCheckpoints(legacyRows).length,
    1,
    'legacy prompts without turn IDs remain eligible minimap checkpoints'
)

const voiceTurnId = 'shared-turn:voice-conversation'
const simpleVoiceMessages: AssistantMessage[] = [
    { ...message({ id: 'voice_user_simple', role: 'user', turnId: voiceTurnId, millisecond: 3000, text: 'How are you?' }), modality: 'voice' },
    { ...message({ id: 'voice_assistant_progress', role: 'assistant', turnId: voiceTurnId, millisecond: 3100, text: 'I am doing well.' }), modality: 'voice' },
    { ...message({ id: 'voice_assistant_final', role: 'assistant', turnId: voiceTurnId, millisecond: 3200, text: 'How can I help?' }), modality: 'voice' }
]
const simpleVoiceDisplayRows = groupTimelineRowsIntoWorkSummaries({
    rows: buildTimelineRows(getTimelineEntries(simpleVoiceMessages, []), false, null),
    messages: simpleVoiceMessages,
    latestAssistantMessageId: 'voice_assistant_final',
    latestTurnStartedAt: iso(3000),
    isWorking: false
})
assert.equal(
    simpleVoiceDisplayRows.some((row) => row.kind === 'turn-work-summary'),
    false,
    'ordinary Voice back-and-forth must remain conversational even when more than one assistant transcript item lands in the turn'
)

const voiceTaskActivity: AssistantActivity = {
    id: 'voice-strong-task:task-voice-action',
    kind: 'voice.strong-task',
    tone: 'tool',
    summary: 'Primary agent finished',
    detail: 'Verified result',
    turnId: 'task-voice-action',
    createdAt: iso(3050),
    payload: {
        status: 'completed',
        source: 'voice',
        sourceProviderItemId: 'provider-voice-action',
        startedAt: iso(3050),
        completedAt: iso(3650)
    }
}
const actionableVoiceMessages: AssistantMessage[] = [
    {
        ...message({ id: 'voice_user_action', role: 'user', turnId: 'voice-action-turn', millisecond: 3000, text: 'Run the check.' }),
        modality: 'voice',
        providerItemId: 'provider-voice-action'
    },
    { ...message({ id: 'voice_assistant_action', role: 'assistant', turnId: 'voice-action-turn', millisecond: 3700, text: 'The check passed.' }), modality: 'voice' }
]
const actionableVoiceRows = groupTimelineRowsIntoWorkSummaries({
    rows: buildTimelineRows(getTimelineEntries(actionableVoiceMessages, [voiceTaskActivity]), false, null),
    messages: actionableVoiceMessages,
    latestAssistantMessageId: 'voice_assistant_action',
    latestTurnStartedAt: iso(3000),
    isWorking: false
})
assert.deepEqual(
    actionableVoiceRows.map((row) => row.kind),
    ['message', 'activity', 'message'],
    'actionable Voice work uses its explicit primary-agent lifecycle row instead of the generic turn timer'
)
const voiceTaskMarkup = renderToStaticMarkup(createElement(TimelineVoiceTaskStatus, { activity: voiceTaskActivity }))
assert.equal(voiceTaskMarkup.includes('Primary agent finished'), true)
assert.equal(voiceTaskMarkup.includes('Worked for'), false, 'Voice task status must describe the owner and state instead of showing an ambiguous generic timer')

const sameTimeEntries = getTimelineEntries(
    [message({ id: 'same-time-user', role: 'user', turnId: 'same-time', millisecond: 900, text: 'Keep source order.' })],
    [
        activity({ id: 'a-third', turnId: 'same-time', millisecond: 1000 }),
        activity({ id: 'm-second', turnId: 'same-time', millisecond: 1000 }),
        activity({ id: 'z-first', turnId: 'same-time', millisecond: 1000 })
    ]
)
const sameTimeGroup = sameTimeEntries.find((entry) => entry.type === 'activity-group')
assert.deepEqual(
    sameTimeGroup?.type === 'activity-group' ? sameTimeGroup.activities.map((item) => item.id) : [],
    ['a-third', 'm-second', 'z-first'],
    'legacy equal-timestamp activities use the canonical ID tiebreaker when no timeline sequence exists'
)

const failedToolEntries = getTimelineEntries([], [
    activity({ id: 'failed-tool', turnId: 'failed-turn', millisecond: 1200, tone: 'error' }),
    activity({ id: 'successful-tool', turnId: 'failed-turn', millisecond: 1100 })
])
assert.deepEqual(
    failedToolEntries.length === 1 && failedToolEntries[0]?.type === 'activity-group'
        ? failedToolEntries[0].activities.map((item) => item.id)
        : [],
    ['successful-tool', 'failed-tool'],
    'failed command rows must remain inside the same chronological tool-call batch'
)

const boundaryEntries = getTimelineEntries([], [
    activity({ id: 'turn-two-tool', turnId: 'turn-two', millisecond: 1400 }),
    activity({ id: 'turn-one-tool', turnId: 'turn-one', millisecond: 1300 })
])
assert.equal(boundaryEntries.length, 2, 'adjacent tools from different turns must never merge into one batch')
assert.equal(boundaryEntries.every((entry) => entry.type === 'activity'), true)

const managedCommand = activity({ id: 'managed-command', turnId: 'managed-turn', millisecond: 1500 })
managedCommand.payload = {
    command: 'npm run check',
    result: { details: { jobId: 'cmd-7', status: 'running' } },
    status: 'completed'
}
const commandCheckpoint: AssistantActivity = {
    ...activity({ id: 'managed-checkpoint', turnId: 'managed-turn', millisecond: 1600 }),
    kind: 'command.checkpoint',
    summary: 'Checked command',
    detail: 'cmd-7',
    payload: {
        category: 'command-checkpoint',
        args: { action: 'status', jobId: 'cmd-7' },
        commandAction: 'status',
        jobId: 'cmd-7',
        status: 'completed'
    }
}
const checkpointEntries = getTimelineEntries([], [commandCheckpoint, managedCommand])
assert.deepEqual(
    checkpointEntries.map((entry) => entry.type === 'activity' ? entry.activity.id : entry.id),
    ['managed-command', 'managed-checkpoint'],
    'a command check must render as its own quiet timeline divider instead of joining a tool-card batch'
)
assert.equal(isCommandCheckpointActivity(commandCheckpoint), true)
assert.equal(getCommandCheckpointAction(commandCheckpoint), 'status')
assert.equal(
    findRelatedCommandActivityId(commandCheckpoint, [commandCheckpoint, managedCommand]),
    managedCommand.id,
    'the checkpoint link must resolve to the originating managed command'
)

const legacyCheckpoint: AssistantActivity = {
    ...commandCheckpoint,
    id: 'legacy-managed-checkpoint',
    kind: 'command',
    payload: { args: { action: 'status', jobId: 'cmd-7' }, status: 'completed' }
}
assert.equal(isCommandCheckpointActivity(legacyCheckpoint), true, 'persisted pre-fix status rows must upgrade in the renderer')
assert.equal(findRelatedCommandActivityId(legacyCheckpoint, [legacyCheckpoint, managedCommand]), managedCommand.id)

const secondCommandCheckpoint: AssistantActivity = {
    ...commandCheckpoint,
    id: 'managed-checkpoint-two',
    createdAt: iso(1650),
    payload: {
        ...commandCheckpoint.payload,
        jobId: 'cmd-8',
        args: { action: 'status', jobId: 'cmd-8' },
        status: 'running'
    }
}
const checkpointRows = buildTimelineRows(
    getTimelineEntries([], [commandCheckpoint, secondCommandCheckpoint]),
    false,
    null
)
assert.equal(checkpointRows.length, 1)
assert.equal(checkpointRows[0]?.kind, 'command-checkpoint-group')
assert.equal(
    checkpointRows[0]?.kind === 'command-checkpoint-group' ? checkpointRows[0].activities.length : 0,
    2,
    'adjacent completed and running command checks collapse into one expandable row'
)
const checkpointGroupMarkup = renderToStaticMarkup(createElement(TimelineCommandCheckpointGroup, {
    activities: [commandCheckpoint, secondCommandCheckpoint],
    targetActivityIdByCheckpointId: new Map<string, string | null>(),
    onRevealCommand: () => undefined
}))
assert.equal(checkpointGroupMarkup.includes('Checked 1 command'), true)
assert.equal(checkpointGroupMarkup.includes('Checking on 1 more'), true, 'completed and running checks share one collapsed status summary')

const unrelatedOutput = activity({ id: 'unrelated-output', turnId: 'managed-turn', millisecond: 1700 })
unrelatedOutput.payload = { command: 'echo cmd-7', output: 'cmd-7', status: 'completed' }
assert.equal(getCommandJobId(unrelatedOutput), '', 'command-looking output text must not create a managed-job link')
assert.equal(isCommandCheckpointActivity(unrelatedOutput), false)

const firstRunningCommand = activity({ id: 'running-one', turnId: 'adaptive-output', millisecond: 1710 })
firstRunningCommand.payload = { command: 'first', output: '1\n2\n3\n4\n5\n6', status: 'running' }
const secondRunningCommand = activity({ id: 'running-two', turnId: 'adaptive-output', millisecond: 1720 })
secondRunningCommand.payload = { command: 'second', output: '1\n2', status: 'running' }
const runningCommandCheckpoint: AssistantActivity = {
    ...commandCheckpoint,
    id: 'running-command-checkpoint',
    payload: {
        ...commandCheckpoint.payload,
        toolName: 'bash',
        status: 'running'
    }
}
assert.equal(countRunningCommandActivities([firstRunningCommand]), 1)
assert.equal(countRunningCommandActivities([firstRunningCommand, secondRunningCommand]), 2)
assert.equal(
    countRunningCommandActivities([firstRunningCommand, runningCommandCheckpoint]),
    1,
    'running status/stop checkpoints do not represent additional command output previews'
)
assert.equal(getTerminalOutputHeightClass('running', 1), 'h-[6.875rem]', 'one running command shows five output lines')
assert.equal(getTerminalOutputHeightClass('running', 2), 'h-[1.875rem]', 'concurrent running commands collapse to one output line each')
assert.equal(getTerminalOutputHeightClass('success', 2), 'h-32 sm:h-36', 'completed output keeps its normal review height')

const sharedSurfaceActivity = activity({ id: 'shared-surface', turnId: 'surface-contract', millisecond: 1695 })
sharedSurfaceActivity.kind = 'search'
sharedSurfaceActivity.payload = {
    surface: {
        version: 1,
        kind: 'search',
        lifecycle: 'running',
        toolName: 'web_search',
        toolKey: 'web search',
        primaryText: 'Pi SDK',
        query: 'Pi SDK',
        paths: [],
        summary: 'Searching'
    }
}
assert.equal(getActivityAgentSurface(sharedSurfaceActivity)?.kind, 'search')
assert.equal(getActivityStatus(sharedSurfaceActivity), 'running', 'renderer status falls back to the shared surface descriptor')

const runningTimedCommand = activity({ id: 'running-timed-command', turnId: 'terminal-timing', millisecond: 1700 })
runningTimedCommand.payload = {
    command: 'npm test',
    status: 'running',
    startedAt: iso(1700)
}
assert.equal(
    getActivityElapsed(runningTimedCommand, iso(5200)),
    '3s',
    'running command elapsed time advances from its runtime start timestamp'
)
const completedTimedCommand = {
    ...runningTimedCommand,
    payload: {
        ...runningTimedCommand.payload,
        status: 'completed',
        completedAt: iso(5200),
        durationMs: 3500
    }
}
assert.equal(getActivityElapsed(completedTimedCommand, iso(9000)), '3.5s', 'completed command elapsed time freezes at the runtime duration')
const toolCardSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantTimelineToolCallCard.tsx', import.meta.url), 'utf8')
const inlineDiffPreviewSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantInlineDiffPreview.tsx', import.meta.url), 'utf8')
const inlineDiffSyntaxSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantInlineDiffSyntax.tsx', import.meta.url), 'utf8')
const animatedHeightSource = readFileSync(new URL('../src/renderer/src/components/ui/AnimatedHeight.tsx', import.meta.url), 'utf8')
assert.equal(resolveAssistantFileChangeStatus({ kind: 'update' }), 'modified')
assert.equal(resolveAssistantFileChangeStatus({ kind: 'add' }), 'untracked')
assert.equal(resolveAssistantFileChangeStatus({ kind: 'delete' }), 'deleted')
assert.equal(resolveAssistantFileChangeStatus({ kind: 'move' }), 'renamed')
assert.match(renderToStaticMarkup(createElement(AssistantFileChangeStatusPill, { status: 'modified' })), />M<\/span>/)
assert.match(renderToStaticMarkup(createElement(AssistantFileChangeStatusPill, { status: 'untracked' })), />U<\/span>/)
assert.match(renderToStaticMarkup(createElement(AssistantFileChangeStatusPill, { status: 'deleted' })), />D<\/span>/)
const newFileActivity = activity({ id: 'new-file-status', turnId: 'file-status', millisecond: 1690 })
newFileActivity.kind = 'file-change'
newFileActivity.summary = 'Edited file'
newFileActivity.detail = 'src/new-file.ts'
newFileActivity.payload = {
    category: 'file-change',
    status: 'completed',
    paths: ['src/new-file.ts'],
    createdPaths: ['src/new-file.ts'],
    changes: [{ path: 'src/new-file.ts', kind: 'add', isNew: true }],
    additions: 4,
    deletions: 2,
    startedAt: iso(200),
    completedAt: iso(1500),
    durationMs: 1300,
    authoritative: true
}
const newFileMarkup = renderToStaticMarkup(createElement(TimelineToolCallCard, { activity: newFileActivity }))
assert.equal(newFileMarkup.includes('Edited file'), false, 'file rows use path and Git-style status instead of a repeated action label')
assert.equal(newFileMarkup.includes('aria-label="New / untracked"'), true, 'new files use a U status pill')
assert.equal(newFileMarkup.indexOf('aria-label="New / untracked"') < newFileMarkup.indexOf('+4'), true, 'the status pill stays attached to the path before right-side metrics')
assert.equal(newFileMarkup.indexOf('+4') < newFileMarkup.indexOf('1.3s'), true, 'diff counts sit beside and before the far-right elapsed time')
const partialReadActivity = activity({ id: 'partial-read', turnId: 'read-presentation', millisecond: 1692 })
partialReadActivity.kind = 'file-read'
partialReadActivity.summary = 'Read file'
partialReadActivity.detail = 'src/large-file.ts'
partialReadActivity.payload = {
    status: 'completed',
    toolName: 'read',
    paths: ['src/large-file.ts'],
    output: `${Array.from({ length: 50 }, (_, index) => `line ${index + 51}`).join('\n')}\n\n[Showing lines 51-100 of 240. Use offset=101 to continue.]`,
    readStartLine: 51,
    readEndLine: 100,
    readLineCount: 50,
    readTotalLines: 240,
    readComplete: false,
    readTruncated: true,
    readIsImage: false,
    durationMs: 4
}
const partialReadMarkup = renderToStaticMarkup(createElement(TimelineToolCallCard, { activity: partialReadActivity }))
assert.equal(partialReadMarkup.includes('src/large-file.ts'), true, 'collapsed Read rows lead with the file path')
assert.equal(partialReadMarkup.includes('(line 51 to 100)'), true, 'partial Read rows put a plain parenthetical line range beside the path')
assert.equal(partialReadMarkup.includes('bg-sky-400/[0.04]'), false, 'Read line ranges are plain text rather than pills')
assert.match(partialReadMarkup, />Read<\/span>/, 'collapsed Read rows identify the operation instead of showing elapsed time')
assert.equal(partialReadMarkup.includes('4ms'), false, 'Read rows do not spend their quiet right edge on millisecond timing')
assert.equal(toolCardSource.includes('buildAssistantReadPreview(authoritativeRawOutput)'), true, 'expanded Read output uses the bounded specialized preview')
assert.equal(toolCardSource.includes('Showing first ${readPreview.displayedLines} of ${readPreview.totalReadLines} lines returned by Read.'), true, 'expanded long reads explain the 50-line presentation cap')
assert.equal(toolCardSource.includes('bg-sky-400 shadow-'), false, 'new-file blue dots are removed')
assert.equal(toolCardSource.includes('TimelineEditedFileRow'), false, 'expanded file changes do not add a duplicate file row')
assert.equal(toolCardSource.includes('Diff preview'), false, 'expanded file changes do not add a wrapper heading above the native diff header')
assert.equal(toolCardSource.includes("'relative mt-1 h-60 min-h-0 overflow-hidden'"), true, 'expanded file changes use a tight bounded diff viewport')
assert.equal(toolCardSource.includes('<AssistantInlineDiffPreview'), true, 'timeline cards use the lightweight inline diff instead of the rich sidebar renderer')
assert.equal(toolCardSource.includes('LazyPatchDiffViewer'), false, 'timeline cards do not load the worker-backed rich diff renderer')
assert.equal(toolCardSource.includes("duration={activity.kind === 'file-change' ? 220 : 240}"), true, 'inline diffs retain a short expand and collapse animation')
assert.equal(toolCardSource.includes("crispContent={activity.kind === 'file-change'}"), true, 'file diffs request the crisp disclosure path')
assert.equal(animatedHeightSource.includes("'grid transition-[grid-template-rows] ease-[cubic-bezier(0.2,0.8,0.2,1)]"), true, 'crisp disclosures animate grid height without opacity or transforms')
assert.equal(toolCardSource.includes('className="shrink-0 font-mono text-[9px]'), true, 'file elapsed time no longer reserves an oversized fixed-width gap')
assert.equal(inlineDiffPreviewSource.includes('MAX_INLINE_DIFF_ROWS = 100'), true, 'inline diff DOM work is capped at 100 lines')
assert.equal(inlineDiffPreviewSource.includes("[text-rendering:auto] [-webkit-font-smoothing:auto]"), true, 'inline diff text uses native crisp rendering')
assert.equal(inlineDiffPreviewSource.includes('@pierre/diffs'), false, 'inline diff has no rich-renderer dependency')
assert.equal(inlineDiffPreviewSource.includes("lazy(() => import('./AssistantInlineDiffSyntax')"), true, 'syntax grammars load only when an inline preview opens')
assert.equal(inlineDiffPreviewSource.includes('More lines — open full diff'), true, 'the truncation row opens the full sidebar diff')
assert.equal(inlineDiffSyntaxSource.includes('PrismLight as SyntaxHighlighter'), true, 'capped inline rows retain syntax highlighting')
assert.equal(inlineDiffSyntaxSource.includes("textShadow: 'none'"), true, 'syntax tokens explicitly remove theme text shadows')
const inlineDiffMarkup = renderToStaticMarkup(createElement(AssistantInlineDiffPreview, {
    patch: 'diff --git a/src/new-file.ts b/src/new-file.ts\n--- a/src/new-file.ts\n+++ b/src/new-file.ts\n@@ -1 +1 @@\n-old\n+new',
    displayPath: 'src/new-file.ts',
    additions: 1,
    deletions: 1,
    onOpenFullDiff: () => undefined
}))
assert.equal(inlineDiffMarkup.includes('src/new-file.ts'), true, 'inline diff keeps its compact file header')
assert.equal(inlineDiffMarkup.includes('Open full diff for src/new-file.ts in side panel'), true, 'inline diff keeps the sidebar action beside its counts')
assert.equal(inlineDiffMarkup.includes('&gt;+1&lt;'), false, 'inline diff count text is rendered as ordinary text rather than serialized markup')
assert.match(inlineDiffMarkup, />\+1<\/span>/)
assert.match(inlineDiffMarkup, />-1<\/span>/)
assert.equal(toolCardSource.includes('commandTimestamp'), false, 'collapsed command rows do not expose calendar date or time')
assert.equal(toolCardSource.includes('formatAssistantDateTime(activityStartedAt)'), true, 'expanded command details show the real command start timestamp')
assert.equal(toolCardSource.includes("window.setInterval(() => setNowIso(new Date().toISOString()), 1000)"), true, 'running command cards refresh elapsed time once per second')
assert.equal(toolCardSource.includes("'w-14 shrink-0 text-right font-mono text-[9px] tabular-nums transition-colors'"), true, 'command durations share a fixed right-aligned numeric column')
assert.equal(toolCardSource.includes("'text-white/16 group-hover:text-white/24'"), true, 'completed command durations stay visually quiet until row hover')
assert.equal(toolCardSource.includes("{elapsed || ''}"), true, 'commands without timing data still reserve the duration column')
assert.equal(toolCardSource.includes('inline-flex w-4 shrink-0 items-center justify-center'), true, 'every tool row reserves the same trailing chevron endpoint')
assert.equal(
    toolCardSource.indexOf('{completedWithoutOutput ? (') < toolCardSource.indexOf('{isRead ? ('),
    true,
    'variable status badges stay before the final operation/status column instead of shifting its endpoint'
)

const waitingCommand = activity({ id: 'waiting-command', turnId: 'terminal-details', millisecond: 1730 })
waitingCommand.detail = 'npm test'
waitingCommand.payload = { command: 'npm test', toolName: 'bash', status: 'running' }
const waitingCommandMarkup = renderToStaticMarkup(createElement(TimelineToolCallCard, {
    activity: waitingCommand,
    runningCommandCount: 1
}))
assert.equal(waitingCommandMarkup.includes('waiting for output...'), true)
const minimizedWaitingCommandMarkup = renderToStaticMarkup(createElement(TimelineToolCallCard, {
    activity: waitingCommand,
    runningCommandCount: 1,
    toolOutputDefaultMode: 'minimized'
}))
assert.equal(minimizedWaitingCommandMarkup.includes('data-state="closed"'), true, 'Minimized live tool output keeps running tools closed')
assert.equal(
    waitingCommandMarkup.includes('>bash</p>'),
    false,
    'command tool names must not consume a standalone line beneath terminal output'
)

const runningRawTool = activity({ id: 'running-raw-tool', turnId: 'terminal-details', millisecond: 1740 })
runningRawTool.kind = 'tool'
runningRawTool.summary = 'Running raw tool'
runningRawTool.detail = 'custom_tool'
runningRawTool.payload = { toolName: 'custom_tool', output: 'raw non-command output remains visible', status: 'running' }
const runningRawToolMarkup = renderToStaticMarkup(createElement(TimelineToolCallCard, {
    activity: runningRawTool,
    runningCommandCount: 1
}))
assert.equal(
    runningRawToolMarkup.includes('raw non-command output remains visible'),
    true,
    'raw non-command tool output stays inside its terminal output body'
)

const modelNotice = activity({ id: 'usage-notice', turnId: 'notice-turn', millisecond: 1750, tone: 'warning' })
modelNotice.kind = 'model.notice'
modelNotice.payload = { category: 'model-notice', noticeKind: 'usage-limit', model: 'gpt-5.5' }
assert.equal(isModelNoticeActivity(modelNotice), true)

assert.equal(COLLAPSED_TOOL_CALL_COUNT, 5)
const tenToolActivities = Array.from({ length: 10 }, (_, index) => activity({
    id: `collapsed-tool-${index + 1}`,
    turnId: 'collapsed-tools',
    millisecond: 1800 + index
}))
const collapsedToolsMarkup = renderToStaticMarkup(createElement(TimelineToolCallList, { activities: tenToolActivities }))
assert.equal(collapsedToolsMarkup.includes('Show all 10'), true, 'tool batches over five expose the DevScope-style expansion control')
assert.equal(collapsedToolsMarkup.includes('data-state="closed"'), true, 'older tool calls remain mounted inside the collapsed animated section')

const timelineRowsSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantTimelineRows.tsx', import.meta.url), 'utf8')
assert.equal(timelineRowsSource.includes('Loading chat...'), true)
assert.equal(timelineRowsSource.includes('h-full min-h-0'), true, 'chat loading state fills the conversation viewport before centering')
assert.equal(timelineRowsSource.includes('mt-2 flex items-center justify-between gap-3 px-1 opacity-100'), true, 'user message metadata and actions remain visible without hover')
assert.equal(timelineRowsSource.includes('statusTextRef.current.textContent = formatWorkingIndicatorStatus'), true, 'the standalone working timer updates without a once-per-second React commit')

const conversationTimelinePaneSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantConversationTimelinePane.tsx', import.meta.url), 'utf8')
const mountedVirtualTimelineSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantVirtualTimeline.tsx', import.meta.url), 'utf8')
const conversationPaneSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantConversationPane.tsx', import.meta.url), 'utf8')
assert.equal(mountedVirtualTimelineSource.includes('[scrollbar-gutter:stable]'), true, 'the virtual chat viewport permanently reserves its scrollbar gutter')
assert.equal(mountedVirtualTimelineSource.includes('AssistantVirtualTimelineMinimap'), false, 'the minimap stays out of the mounted chat path while scrolling is being tuned')
assert.equal(conversationTimelinePaneSource.includes('timelineRailHostRef'), false, 'the hidden minimap does not leave a portal host or resize observer mounted')
assert.equal(conversationPaneSource.includes('suppressMinimap='), false, 'the conversation no longer carries dead minimap visibility state')
assert.equal(mountedVirtualTimelineSource.includes('[overflow-anchor:none]'), true, 'older-message prepends use LegendList anchoring instead of browser scroll anchoring')

const chatSessionsRailSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantChatSessionsRail.tsx', import.meta.url), 'utf8')
assert.equal(chatSessionsRailSource.includes('resolveAssistantThreadStatusPill('), true, 'the mounted chat sidebar derives tags from real thread phase state')
assert.equal(chatSessionsRailSource.includes("'inline-flex h-4 shrink-0 items-center gap-1 rounded-full px-1.5"), true, 'actionable chat states render as compact pills')
assert.equal(chatSessionsRailSource.includes('inline-flex shrink-0 items-center gap-1.5'), true, 'the status pill and time form one closely spaced metadata group')
assert.equal(chatSessionsRailSource.includes('mr-0.5 w-8 shrink-0 text-right text-[11px]'), false, 'the time uses its natural width instead of preserving an invisible gap before its text')
assert.equal(
    chatSessionsRailSource.indexOf('<span>{statusPill.label}</span>') < chatSessionsRailSource.lastIndexOf('{timeLabel}'),
    true,
    'the status pill sits immediately before the chat time'
)
assert.equal(chatSessionsRailSource.includes('{busy ? ('), false, 'the mounted sidebar no longer uses a detached left busy dot')
assert.equal(chatSessionsRailSource.includes('.sort(compareSessionsByCreatedAtDescending)'), true, 'chat ranking uses session creation time instead of mutable activity time')
assert.equal(chatSessionsRailSource.includes('right.newestCreatedAt) - getSortableTimestamp(left.newestCreatedAt)'), true, 'project groups rank by their newest-created chat')
assert.equal(
    chatSessionsRailSource.includes('.sort((left, right) => getSortableTimestamp(getSessionLastActivityAt(right))'),
    false,
    'new messages and background activity cannot reshuffle the chat list'
)

const markdownRendererSource = readFileSync(new URL('../src/renderer/src/components/ui/MarkdownRenderer.tsx', import.meta.url), 'utf8')
assert.equal(markdownRendererSource.includes('const compiledMarkdown = new Map'), true, 'completed Markdown survives virtual-row remounts in a bounded compiled cache')
assert.equal(markdownRendererSource.includes('window.requestIdleCallback(drainMarkdownPreparation)'), true, 'newly loaded history prewarms immutable Markdown outside the scrolling hot path')
assert.equal(markdownRendererSource.includes('MAX_COMPILED_ENTRIES = 320'), true, 'the compiled Markdown cache has an explicit retention bound')
assert.equal(mountedVirtualTimelineSource.includes('markAssistantTimelineMotion'), false, 'scrolling does not downgrade or delay formatted Markdown')

const assistantPageHelpersSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantPageHelpers.tsx', import.meta.url), 'utf8')
assert.equal(assistantPageHelpersSource.includes('return createPortal('), true, 'error details render outside the chat rail')
assert.equal(assistantPageHelpersSource.includes('fixed inset-0 z-[2147482000]'), true, 'error details use an app-level modal backdrop')
assert.equal(assistantPageHelpersSource.includes('aria-modal="true"'), true, 'error details expose modal semantics')

const thoughtActivity = activity({ id: 'thought-motion', turnId: 'thought-turn', millisecond: 1760, internal: true })
thoughtActivity.detail = '**Planning quietly**\n\nA secondary thought body.'
thoughtActivity.payload = { ...thoughtActivity.payload, output: thoughtActivity.detail }
const thoughtMarkup = renderToStaticMarkup(createElement(TimelineThought, { activity: thoughtActivity }))
assert.equal(thoughtMarkup.includes('data-state="closed"'), true, 'thought body remains mounted so collapse motion can run')

const titleOnlyThought = activity({ id: 'thought-title-only', turnId: 'thought-title-only-turn', millisecond: 1770, internal: true })
titleOnlyThought.detail = '**Verifying git status for changes**\n\n<!-- -->\n'
titleOnlyThought.payload = { ...titleOnlyThought.payload, output: titleOnlyThought.detail }
assert.equal(sanitizeThoughtContent(titleOnlyThought.detail), '**Verifying git status for changes**')
const titleOnlyThoughtMarkup = renderToStaticMarkup(createElement(TimelineThought, { activity: titleOnlyThought }))
assert.equal(titleOnlyThoughtMarkup.includes('Verifying git status for changes'), true)
assert.equal(titleOnlyThoughtMarkup.includes('aria-expanded'), false, 'title-only thoughts render as a quiet line without an empty disclosure')
assert.equal(titleOnlyThoughtMarkup.includes('Thoughts'), false)

const secondThoughtActivity = activity({ id: 'thought-motion-two', turnId: 'thought-turn', millisecond: 1775, internal: true })
secondThoughtActivity.detail = '**Checking the result**\n\nOne more secondary detail.'
secondThoughtActivity.payload = { ...secondThoughtActivity.payload, output: secondThoughtActivity.detail }
const thoughtGroupRows = buildTimelineRows(
    getTimelineEntries([], [secondThoughtActivity, thoughtActivity]),
    false,
    null
)
assert.equal(thoughtGroupRows.length, 1)
assert.equal(thoughtGroupRows[0]?.kind, 'thought-group', 'adjacent thoughts collapse into one chronological disclosure')
const thoughtGroupMarkup = renderToStaticMarkup(createElement(TimelineThoughtGroup, {
    activities: [thoughtActivity, secondThoughtActivity]
}))
assert.equal(thoughtGroupMarkup.includes('Thoughts (2)'), true)
assert.equal(thoughtGroupMarkup.includes('data-state="closed"'), true)

const mixedTraceCheckpoint: AssistantActivity = {
    ...commandCheckpoint,
    id: 'thought-checkpoint',
    turnId: 'thought-turn',
    createdAt: iso(1768),
    payload: {
        ...commandCheckpoint.payload,
        jobId: 'cmd-thought',
        args: { action: 'status', jobId: 'cmd-thought' },
        status: 'completed'
    }
}
const mixedTraceRows = buildTimelineRows(
    getTimelineEntries([], [secondThoughtActivity, mixedTraceCheckpoint, thoughtActivity]),
    false,
    null
)
assert.equal(mixedTraceRows.length, 1)
assert.equal(mixedTraceRows[0]?.kind, 'work-trace-group', 'an uninterrupted thought and command-checkpoint run collapses together')
assert.deepEqual(
    mixedTraceRows[0]?.kind === 'work-trace-group' ? mixedTraceRows[0].activities.map((item) => item.id) : [],
    ['thought-motion', 'thought-checkpoint', 'thought-motion-two'],
    'expanded work traces preserve the original chronology'
)
const mixedTraceMarkup = renderToStaticMarkup(createElement(TimelineWorkTraceGroup, {
    activities: [thoughtActivity, mixedTraceCheckpoint, secondThoughtActivity],
    targetActivityIdByCheckpointId: new Map<string, string | null>(),
    onRevealCommand: () => undefined
}))
assert.equal(mixedTraceMarkup.includes('2 thoughts · 1 check'), true)
assert.equal(mixedTraceMarkup.includes('data-state="closed"'), true, 'mixed work traces stay collapsed by default')

const traceBoundaryRows = buildTimelineRows(
    getTimelineEntries(
        [message({ id: 'trace-narration', role: 'assistant', turnId: 'thought-turn', millisecond: 1765, text: 'A visible narration boundary.' })],
        [mixedTraceCheckpoint, thoughtActivity]
    ),
    false,
    null
)
assert.equal(
    traceBoundaryRows.some((row) => row.kind === 'work-trace-group'),
    false,
    'visible narration breaks mixed trace grouping'
)

const crossTypeSameTimeEntries = getTimelineEntries(
    [
        message({ id: 'same-time-progress', role: 'assistant', turnId: 'same-time-cross-type', millisecond: 1800, timelineSequence: 100, text: 'Starting.' }),
        message({ id: 'same-time-final', role: 'assistant', turnId: 'same-time-cross-type', millisecond: 1800, timelineSequence: 300, text: '## Finished' })
    ],
    [activity({ id: 'same-time-tool', turnId: 'same-time-cross-type', millisecond: 1800, timelineSequence: 200 })]
)
assert.deepEqual(
    crossTypeSameTimeEntries.map((entry) => entry.type === 'message' ? entry.message.id : entry.type === 'activity' ? entry.activity.id : entry.id),
    ['same-time-progress', 'same-time-tool', 'same-time-final'],
    'shared causal sequence must order messages and tool activity when timestamps are identical'
)

const exactMarkdown = '    indented code\n\n\n\nnext\n'
assert.equal(
    stripProposedPlanBlocks(exactMarkdown),
    exactMarkdown,
    'assistant Markdown without a proposed-plan control block must remain byte-for-byte unchanged'
)

console.log('DevScope-style activity timeline contract: ok')
