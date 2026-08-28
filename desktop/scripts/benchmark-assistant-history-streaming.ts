import { performance } from 'node:perf_hooks'
import { createAssistantLongHistoryFixture } from './fixtures/assistant-long-history-fixture'
import {
    boundAssistantActiveHistoryWindow,
    type AssistantRetainedHistory
} from '../src/renderer/src/lib/assistant/assistant-history-state'
import { estimateAssistantTimelineCollectionsCharacters } from '../src/renderer/src/lib/assistant/session-hydration-cache'
import { buildTimelineRows, getTimelineEntries } from '../src/renderer/src/pages/assistant/assistant-timeline-helpers'
import { groupTimelineRowsIntoWorkSummaries } from '../src/renderer/src/pages/assistant/assistant-turn-work'

const WARMUP_SAMPLES = 3
const MEASURED_SAMPLES = 7
const MAX_BENCHMARK_MS = 5_000

function median(values: number[]): number {
    const sorted = [...values].sort((left, right) => left - right)
    return sorted[Math.floor(sorted.length / 2)]!
}

function measureProjection(history: Pick<AssistantRetainedHistory, 'messages' | 'activities' | 'proposedPlans'>): number {
    const activityFeed = [...history.activities].reverse()
    const samples: number[] = []
    for (let sample = 0; sample < WARMUP_SAMPLES + MEASURED_SAMPLES; sample += 1) {
        const startedAt = performance.now()
        const entries = getTimelineEntries(history.messages, activityFeed, history.proposedPlans)
        const rows = buildTimelineRows(entries, false, null)
        groupTimelineRowsIntoWorkSummaries({
            rows,
            messages: history.messages,
            latestAssistantMessageId: history.messages.at(-1)?.id || null,
            latestTurnStartedAt: null,
            isWorking: false
        })
        const elapsed = performance.now() - startedAt
        if (elapsed > MAX_BENCHMARK_MS) throw new Error(`History projection exceeded ${MAX_BENCHMARK_MS}ms safety stop.`)
        if (sample >= WARMUP_SAMPLES) samples.push(elapsed)
    }
    return median(samples)
}

const scale = [1, 15, 90, 180, 360, 1_000].map((turns) => {
    const thread = createAssistantLongHistoryFixture(turns, 4_096).sessions[0]!.threads[0]!
    return {
        turns,
        records: thread.messages.length + thread.activities.length + thread.proposedPlans.length,
        projectionMedianMs: Number(measureProjection(thread as AssistantRetainedHistory).toFixed(2))
    }
})

const fullThread = createAssistantLongHistoryFixture(1_000, 4_096).sessions[0]!.threads[0]!
const fullHistory: AssistantRetainedHistory = {
    threadId: fullThread.id,
    messages: fullThread.messages,
    activities: fullThread.activities,
    proposedPlans: fullThread.proposedPlans,
    pageInfo: { oldestCursor: 'fixture-oldest', newestCursor: null, hasOlder: true, hasNewer: false, turnCount: 1_000 },
    initialLoading: false,
    loadingOlder: false,
    loadingNewer: false,
    loadOlderError: null,
    loadNewerError: null,
    fullyLoaded: false,
    lastUsedAt: Date.now(),
    shellRevision: 'fixture'
}
const bounded = boundAssistantActiveHistoryWindow(fullHistory, 'older')
const fullRecords = fullHistory.messages.length + fullHistory.activities.length + fullHistory.proposedPlans.length
const boundedRecords = bounded.messages.length + bounded.activities.length + bounded.proposedPlans.length
const fullProjectionMedianMs = measureProjection(fullHistory)
const boundedProjectionMedianMs = measureProjection(bounded)

console.log(JSON.stringify({
    protocol: { warmups: WARMUP_SAMPLES, samples: MEASURED_SAMPLES, safetyStopMs: MAX_BENCHMARK_MS },
    scale,
    residentWindow: {
        fullRecords,
        boundedRecords,
        boundedCharacters: estimateAssistantTimelineCollectionsCharacters(bounded),
        fullProjectionMedianMs: Number(fullProjectionMedianMs.toFixed(2)),
        boundedProjectionMedianMs: Number(boundedProjectionMedianMs.toFixed(2)),
        recordReductionPercent: Number((((fullRecords - boundedRecords) / fullRecords) * 100).toFixed(1)),
        projectionReductionPercent: Number((((fullProjectionMedianMs - boundedProjectionMedianMs) / fullProjectionMedianMs) * 100).toFixed(1))
    }
}, null, 2))
