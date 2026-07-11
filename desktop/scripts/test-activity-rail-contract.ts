import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AssistantActivity, AssistantMessage } from '../src/shared/assistant/contracts'
import { TimelineToolCallCard } from '../src/renderer/src/pages/assistant/AssistantTimelineToolCallCard'
import {
    buildBaseCheckpoints,
    resolveTimelineMinimapHeight,
    resolveTimelineMinimapIndexFromPointer,
    resolveTimelineMinimapMarkerWidth
} from '../src/renderer/src/pages/assistant/AssistantTimelineCheckpointRail'
import { TimelineTurnWorkSummary } from '../src/renderer/src/pages/assistant/AssistantTimelineWorkSummary'
import { sanitizeThoughtContent, TimelineCommandCheckpointGroup, TimelineMessage, TimelineThought, TimelineThoughtGroup, TimelineWorkTraceGroup } from '../src/renderer/src/pages/assistant/AssistantTimelineRows'
import { COLLAPSED_TOOL_CALL_COUNT, TimelineToolCallList } from '../src/renderer/src/pages/assistant/AssistantTimelineToolCalls'
import { stripProposedPlanBlocks } from '../src/renderer/src/pages/assistant/assistant-proposed-plan'
import { getTerminalOutputHeightClass } from '../src/renderer/src/pages/assistant/assistant-timeline-layout'
import { groupTimelineRowsIntoWorkSummaries } from '../src/renderer/src/pages/assistant/assistant-turn-work'
import { resolveAssistantTimelineDisclosureAnchorMode } from '../src/renderer/src/pages/assistant/assistant-timeline-scroll-events'
import {
    buildTimelineRows,
    countRunningCommandActivities,
    findRelatedCommandActivityId,
    getActivityElapsed,
    getCommandCheckpointAction,
    getCommandJobId,
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
const runningWorkSummaryMarkup = renderToStaticMarkup(createElement(TimelineTurnWorkSummary, {
    startedAt: new Date().toISOString(),
    completedAt: null,
    running: true,
    children: createElement('div', null, 'Live implementation work')
}))
assert.equal(runningWorkSummaryMarkup.includes('Working for'), true, 'the shared disclosure presents its live elapsed state')
assert.equal(runningWorkSummaryMarkup.includes('data-state="open"'), true, 'live work starts expanded and remains user-collapsible')
const timelineSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantTimeline.tsx', import.meta.url), 'utf8')
assert.equal(timelineSource.includes('compactLiveNarration: true'), true, 'the staged preview remains mounted so it can retain the last settled narration')
assert.equal(timelineSource.includes("expanded && 'hidden'"), true, 'expanded work hides the compact preview and uses only chronological work rows')
const compactNarrationMarkup = renderToStaticMarkup(createElement(TimelineMessage, {
    message: messages[1],
    compactLiveNarration: true
}))
assert.equal(compactNarrationMarkup.includes('line-clamp-3'), true, 'collapsed narration is capped at three lines')
assert.equal(compactNarrationMarkup.includes('Show full narration'), true, 'the compact preview can reveal its complete narration without opening work')
const timelineRowsSourceForNarration = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantTimelineRows.tsx', import.meta.url), 'utf8')
assert.equal(timelineRowsSourceForNarration.includes("message.role !== 'assistant' || message.streaming"), true, 'a replacement narration waits until streaming completes before entering the compact preview')
const timelineCssSource = readFileSync(new URL('../src/renderer/src/index.css', import.meta.url), 'utf8')
assert.equal(timelineCssSource.includes('assistantNarrationShimmer 6.5s ease-in-out infinite'), true, 'collapsed narration uses a deliberately slow shimmer')
assert.equal(timelineCssSource.includes('assistantNarrationIn 420ms'), true, 'settled narration changes use a measured seamless handoff')

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
    ['z-first', 'm-second', 'a-third'],
    'equal timestamps must restore the newest-first activity feed to append order without sorting by arbitrary IDs'
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
assert.equal(toolCardSource.includes('commandTimestamp'), false, 'collapsed command rows do not expose calendar date or time')
assert.equal(toolCardSource.includes('formatAssistantDateTime(activityStartedAt)'), true, 'expanded command details show the real command start timestamp')
assert.equal(toolCardSource.includes("window.setInterval(() => setNowIso(new Date().toISOString()), 1000)"), true, 'running command cards refresh elapsed time once per second')
assert.equal(toolCardSource.includes("'w-14 shrink-0 text-right font-mono text-[9px] tabular-nums transition-colors'"), true, 'command durations share a fixed right-aligned numeric column')
assert.equal(toolCardSource.includes("'text-white/16 group-hover:text-white/24'"), true, 'completed command durations stay visually quiet until row hover')
assert.equal(toolCardSource.includes("{elapsed || ''}"), true, 'commands without timing data still reserve the duration column')
assert.equal(toolCardSource.includes('inline-flex w-4 shrink-0 items-center justify-center'), true, 'every tool row reserves the same trailing chevron endpoint')
assert.equal(
    toolCardSource.indexOf('{completedWithoutOutput ? (') < toolCardSource.indexOf('{isTerminalLikeTool ? ('),
    true,
    'variable status badges stay before the final duration column instead of shifting its endpoint'
)

const waitingCommand = activity({ id: 'waiting-command', turnId: 'terminal-details', millisecond: 1730 })
waitingCommand.detail = 'npm test'
waitingCommand.payload = { command: 'npm test', toolName: 'bash', status: 'running' }
const waitingCommandMarkup = renderToStaticMarkup(createElement(TimelineToolCallCard, {
    activity: waitingCommand,
    runningCommandCount: 1
}))
assert.equal(waitingCommandMarkup.includes('waiting for output...'), true)
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

const conversationTimelinePaneSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantConversationTimelinePane.tsx', import.meta.url), 'utf8')
assert.equal(conversationTimelinePaneSource.includes('[scrollbar-gutter:stable]'), true, 'the chat rail permanently reserves its scrollbar gutter to prevent horizontal nudging')

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

const checkpointRailSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantTimelineCheckpointRail.tsx', import.meta.url), 'utf8')
assert.equal(checkpointRailSource.includes('hidden w-[72px] md:block'), false, 'the chat minimap must not disappear at a desktop window-width breakpoint')
assert.equal(checkpointRailSource.includes('new MutationObserver(scheduleMeasure)'), true, 'the minimap remeasures when timeline rows mount or change')

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
