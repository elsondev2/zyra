import type { AgentRunState, AgentTranscriptPage, AssistantActivity, AssistantMessage, AssistantSessionTurnUsageEntry } from '@shared/assistant/contracts'
import { getAssistantInterruptionLabel } from '@shared/assistant/interruption'
import { groupTimelineRowsIntoWorkSummaries } from './assistant-turn-work'
import type { TimelineRenderRow } from './assistant-timeline-helpers'
import { projectAssistantAgentLiveToolActivity, projectAssistantAgentTranscriptActivities, projectAssistantAgentTranscriptMessages } from './assistant-agent-presentation'

const TERMINAL = new Set<AgentRunState['status']>(['completed', 'failed', 'cancelled', 'interrupted'])

/** Adapt saved child messages to the same Work grouping policy as root chat.
 * No independent child lifecycle or keyword-inferred completion state. */
export function projectAssistantAgentChat(run: AgentRunState, transcript: AgentTranscriptPage | null) {
    const terminal = TERMINAL.has(run.status)
    const sourceMessages = transcript ? projectAssistantAgentTranscriptMessages(transcript.entries) : []
    const sourceActivities = transcript ? projectAssistantAgentTranscriptActivities(transcript.entries) : []
    const result = String(run.result?.text || '').trim()
    const hasResult = Boolean(result) && sourceMessages.some(message => message.role === 'assistant'
        && (message.text.trim() === result || message.text.includes(result) || result.includes(message.text.trim())))
    const historyHasLaterPages = transcript?.nextAfter != null
    const resultFallback = terminal && !historyHasLaterPages && Boolean(result) && !hasResult
    if (resultFallback) sourceMessages.push({ index: Number.MAX_SAFE_INTEGER - 1, role: 'assistant', text: result, timestamp: run.completedAt, phase: 'final_answer' })
    const firstMessage = sourceMessages[0]
    const openingRequestPresent = firstMessage?.role === 'user'
        && !sourceActivities.some(activity => activity.index < firstMessage.index)
    // A user follow-up later in the transcript is not the opening delegation.
    // Keep the original fallback stable as forward pages reveal those follow-ups.
    const fallbackTask = !openingRequestPresent && Boolean(run.goal.trim())
    if (fallbackTask) sourceMessages.unshift({ index: -1, role: 'user', text: run.goal, timestamp: run.queuedAt || run.createdAt })
    const liveActivity = !terminal ? projectAssistantAgentLiveToolActivity(run.activity, run.heartbeatAt || run.startedAt || run.createdAt) : null
    if (liveActivity && !sourceActivities.some(activity => activity.activity.id === liveActivity.id)) {
        sourceActivities.push({ index: Number.MAX_SAFE_INTEGER - 2, partIndex: 0, toolCallId: liveActivity.id,
            summary: liveActivity.summary, detail: liveActivity.detail || null, status: 'running', timestamp: liveActivity.createdAt, activity: liveActivity })
    }
    const events = [
        ...sourceMessages.map(message => ({ kind: 'message' as const, index: message.index, message })),
        ...sourceActivities.map(activity => ({ kind: 'activity' as const, index: activity.index, activity: activity.activity }))
    ].sort((left, right) => left.index - right.index)
    const rows: TimelineRenderRow[] = []
    const messages: AssistantMessage[] = []
    let turnId = `agent-turn:${run.agentRunId}:initial`
    // An empty request is a presentation boundary only, never a blank chat bubble.
    if (!sourceMessages.some(message => message.role === 'user')) {
        const message: AssistantMessage = { id: `${turnId}:boundary`, role: 'user', text: '', turnId,
            streaming: false, createdAt: run.createdAt, updatedAt: run.createdAt }
        messages.push(message)
        rows.push({ kind: 'message', id: message.id, createdAt: message.createdAt, message, workBoundaryOnly: true })
    }
    let fallbackTaskId: string | null = null
    let resultFallbackId: string | null = null
    for (const event of events) {
        if (event.kind === 'message') {
            const source = event.message
            const id = `agent-transcript:${run.agentRunId}:${source.index}:${source.role}`
            if (source.role === 'user') turnId = `agent-turn:${run.agentRunId}:${source.index}`
            const message: AssistantMessage = { id, role: source.role, text: source.text, turnId, streaming: false,
                createdAt: source.timestamp || run.createdAt, updatedAt: source.timestamp || run.createdAt,
                ...(source.phase ? { phase: source.phase } : {}) }
            messages.push(message)
            rows.push({ kind: 'message', id, createdAt: message.createdAt, message })
            if (fallbackTask && source.index === -1) fallbackTaskId = id
            if (resultFallback && source.index === Number.MAX_SAFE_INTEGER - 1) resultFallbackId = id
        } else {
            const activity = { ...event.activity, turnId }
            rows.push({ kind: 'activity', id: activity.id, createdAt: activity.createdAt, activity })
        }
    }
    if (!terminal) rows.push({ kind: 'working', id: `agent-working:${run.agentRunId}`, createdAt: run.startedAt || run.createdAt })
    const endedAt = run.completedAt || run.heartbeatAt || run.startedAt || run.createdAt
    if (!historyHasLaterPages && (run.status === 'failed' || run.status === 'cancelled' || run.status === 'interrupted')) {
        const interruption = run.error?.interruption || { kind: run.status === 'cancelled' ? 'stopped' as const : 'interrupted' as const, source: 'system' as const,
            ...(run.error?.code === 'CHILD_MAX_TURNS' ? { reason: 'turn-limit' as const } : {}) }
        const activity: AssistantActivity = { id: `agent-outcome:${run.agentRunId}`, kind: 'error', tone: run.status === 'failed' ? 'error' : 'warning',
            turnId, createdAt: endedAt, summary: run.error?.message || (run.status === 'failed' ? 'Agent failed' : getAssistantInterruptionLabel(interruption)),
            turnTerminalOutcome: run.status === 'failed' ? 'failed' : 'interrupted',
            payload: { status: run.status === 'failed' ? 'failed' : 'cancelled', interruption } }
        rows.push({ kind: 'activity', id: activity.id, createdAt: endedAt, activity })
    }
    const latestAssistant = messages.findLast(message => message.role === 'assistant')
    const latestUsage: AssistantSessionTurnUsageEntry = {
        id: turnId, sessionId: run.rootSessionId, threadId: run.agentRunId, model: run.selectedModel,
        state: historyHasLaterPages ? 'running' : run.status === 'completed' ? 'completed' : run.status === 'failed' ? 'error' : terminal ? 'interrupted' : 'running',
        requestedAt: run.queuedAt || run.createdAt, startedAt: run.startedAt, completedAt: terminal ? endedAt : null,
        assistantMessageId: latestAssistant?.id || null, usage: null, updatedAt: endedAt
    }
    const groupedRows = groupTimelineRowsIntoWorkSummaries({ rows, messages, turnUsageById: new Map([[turnId, latestUsage]]),
        latestAssistantMessageId: latestAssistant?.id || null, latestTurnStartedAt: run.startedAt || run.createdAt,
        isWorking: !terminal || historyHasLaterPages })
    return {
        rows: groupedRows.map(row => historyHasLaterPages && row.kind === 'turn-work-summary' && row.running
            ? { ...row, running: false, completedAt: null } : row),
        fallbackTaskId, resultFallbackId, terminal,
        hasAssistant: Boolean(latestAssistant), messageCount: sourceMessages.length,
        activityCount: sourceActivities.length,
        hasSavedMessages: Boolean(transcript?.entries.length)
    }
}
