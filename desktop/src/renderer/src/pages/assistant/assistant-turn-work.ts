import type { AssistantActivity, AssistantMessage, AssistantSessionTurnUsageEntry } from '@shared/assistant/contracts'
import {
    getContextCompactionStatus,
    isContextCompactionActivity,
    isModelNoticeActivity,
    type TimelineDisplayRow,
    type TimelineRenderRow,
    type TimelineTurnWorkSummaryRow
} from './assistant-timeline-helpers'

function isVoiceConversationMessage(message: AssistantMessage): boolean {
    return message.modality === 'voice'
        || message.id.startsWith('voice_')
        || message.id.startsWith('voice-live-')
}

function getRowTurnId(row: TimelineRenderRow): string | null {
    if (row.kind === 'message') return row.message.turnId
    if (row.kind === 'plan') return row.plan.turnId
    if (row.kind === 'activity') return row.activity.turnId
    if (
        row.kind === 'activity-group'
        || row.kind === 'thought-group'
        || row.kind === 'command-checkpoint-group'
        || row.kind === 'work-trace-group'
    ) return row.activities[0]?.turnId || null
    return null
}

type ProjectedTerminalOutcome = 'interrupted' | 'failed'

function getProjectedActivityTerminalOutcome(activity: AssistantActivity): ProjectedTerminalOutcome | null {
    const stopReason = String(activity.payload?.stopReason || '').trim().toLowerCase()
    const status = String(activity.payload?.status || '').trim().toLowerCase()
    if (
        stopReason === 'aborted'
        || stopReason === 'cancelled'
        || stopReason === 'canceled'
        || stopReason === 'interrupted'
        || stopReason === 'stopped'
        || status === 'cancelled'
        || status === 'canceled'
        || status === 'aborted'
        || status === 'interrupted'
        || status === 'stopped'
    ) return 'interrupted'
    if (
        activity.kind === 'error'
        && (activity.tone === 'error' || stopReason === 'error' || status === 'failed' || status === 'error')
    ) return 'failed'
    return null
}

function getProjectedTurnTerminalOutcome(rows: TimelineRenderRow[], turnId: string): ProjectedTerminalOutcome | null {
    for (let rowIndex = rows.length - 1; rowIndex >= 0; rowIndex -= 1) {
        const row = rows[rowIndex]
        if (getRowTurnId(row) !== turnId) continue
        const activities = row.kind === 'activity'
            ? [row.activity]
            : 'activities' in row
                ? row.activities
                : []
        for (let activityIndex = activities.length - 1; activityIndex >= 0; activityIndex -= 1) {
            const activity = activities[activityIndex]
            if (!activity) continue
            const outcome = getProjectedActivityTerminalOutcome(activity)
            if (outcome) return outcome
        }
    }
    return null
}

function rowMustStayVisible(row: TimelineRenderRow): boolean {
    if (row.kind === 'working') return true
    if (row.kind === 'activity') return isModelNoticeActivity(row.activity)
    if (row.kind === 'activity-group') {
        return row.activities.some(isModelNoticeActivity)
    }
    return false
}

function getRowCompletedAt(row: TimelineRenderRow): string {
    if (row.kind === 'message') return row.message.updatedAt || row.createdAt
    if (row.kind === 'plan') return row.plan.updatedAt || row.createdAt
    if (row.kind === 'activity') {
        return typeof row.activity.payload?.completedAt === 'string'
            ? row.activity.payload.completedAt
            : row.createdAt
    }
    if ('activities' in row) {
        return row.activities.reduce((latest, activity) => (
            activity.createdAt.localeCompare(latest) > 0 ? activity.createdAt : latest
        ), row.createdAt)
    }
    return row.createdAt || ''
}

function inferLegacyUserTurnId(
    userMessage: AssistantMessage,
    boundaryRows: TimelineRenderRow[],
    turnUsageById: ReadonlyMap<string, AssistantSessionTurnUsageEntry> | undefined
): string | null {
    if (userMessage.turnId) return userMessage.turnId

    const boundaryTurnIds = new Set(boundaryRows.map(getRowTurnId).filter((value): value is string => Boolean(value)))
    const exactUsageMatches = [...(turnUsageById?.values() || [])].filter((usage) => (
        usage.requestedAt === userMessage.createdAt
    ))
    const exactBoundaryMatch = exactUsageMatches.find((usage) => boundaryTurnIds.has(usage.id))
    if (exactBoundaryMatch) return exactBoundaryMatch.id
    if (exactUsageMatches.length === 1) return exactUsageMatches[0]?.id || null

    return boundaryRows.map(getRowTurnId).find((turnId) => turnId && turnUsageById?.has(turnId)) || null
}

function getFinalAssistantIdByTurn(
    messages: AssistantMessage[],
    turnUsageById: ReadonlyMap<string, AssistantSessionTurnUsageEntry> | undefined,
    latestAssistantMessageId: string | null
): Map<string, string> {
    const finalByTurn = new Map<string, string>()
    for (const message of messages) {
        if (message.role === 'assistant' && message.turnId) finalByTurn.set(message.turnId, message.id)
    }
    for (const [turnId, usage] of turnUsageById || []) {
        if (usage.assistantMessageId) finalByTurn.set(turnId, usage.assistantMessageId)
    }
    if (latestAssistantMessageId) {
        const latest = messages.find((message) => message.id === latestAssistantMessageId)
        if (latest?.turnId) finalByTurn.set(latest.turnId, latestAssistantMessageId)
    }
    return finalByTurn
}

export function groupTimelineRowsIntoWorkSummaries(input: {
    rows: TimelineRenderRow[]
    messages: AssistantMessage[]
    turnUsageById?: ReadonlyMap<string, AssistantSessionTurnUsageEntry>
    latestAssistantMessageId: string | null
    latestTurnStartedAt: string | null
    isWorking: boolean
}): TimelineDisplayRow[] {
    const {
        rows,
        messages,
        turnUsageById,
        latestAssistantMessageId,
        latestTurnStartedAt,
        isWorking
    } = input
    const finalByTurn = getFinalAssistantIdByTurn(messages, turnUsageById, latestAssistantMessageId)
    const runningTurnId = [...(turnUsageById?.entries() || [])]
        .reverse()
        .find(([, usage]) => usage.state === 'running')?.[0] || null
    let latestUserIndex = -1
    for (let index = rows.length - 1; index >= 0; index -= 1) {
        const row = rows[index]
        if (row.kind === 'message' && row.message.role === 'user') {
            latestUserIndex = index
            break
        }
    }
    const latestUserRow = latestUserIndex >= 0 ? rows[latestUserIndex] : undefined
    const latestUserTurnId = latestUserRow?.kind === 'message'
        ? latestUserRow.message.turnId
        : null
    const latestBoundaryTurnId = [...rows.slice(latestUserIndex + 1)].reverse().map(getRowTurnId).find(Boolean) || null
    const activeTurnId = isWorking
        ? latestUserIndex >= 0
            ? latestUserTurnId || latestBoundaryTurnId
            : latestBoundaryTurnId || runningTurnId
        : null
    const activeFinalMessageId = activeTurnId ? finalByTurn.get(activeTurnId) || null : null
    const settledFinalIndex = activeFinalMessageId
        ? rows.findIndex((row) => (
            row.kind === 'message'
            && row.message.id === activeFinalMessageId
            && !row.message.streaming
            && Boolean(row.message.text.trim())
        ))
        : -1
    const finalPrecedesRunningCompaction = settledFinalIndex >= 0 && rows.slice(settledFinalIndex + 1).some((row) => (
        row.kind === 'activity'
        && isContextCompactionActivity(row.activity)
        && getContextCompactionStatus(row.activity) === 'running'
        && (!row.activity.turnId || row.activity.turnId === activeTurnId)
    ))
    const ranges = new Map<number, { endIndex: number; summary: TimelineTurnWorkSummaryRow; visibleRows?: TimelineRenderRow[] }>()
    let activeRange: {
        startIndex: number
        endIndex: number
        summary: TimelineTurnWorkSummaryRow
        visibleRows: TimelineRenderRow[]
    } | null = null

    if (isWorking) {
        let userIndex = -1
        for (let index = rows.length - 1; index >= 0; index -= 1) {
            const candidate = rows[index]
            if (
                candidate.kind === 'message'
                && candidate.message.role === 'user'
                && (!activeTurnId || candidate.message.turnId === activeTurnId || !candidate.message.turnId)
            ) {
                userIndex = index
                break
            }
        }

        const activeUserRow = userIndex >= 0 ? rows[userIndex] : null
        const activeUserMessage = activeUserRow?.kind === 'message'
            ? activeUserRow.message
            : null
        if (userIndex >= 0 && activeUserMessage && !isVoiceConversationMessage(activeUserMessage)) {
            let endIndex = rows.length - 1
            for (let index = userIndex + 1; index < rows.length; index += 1) {
                const candidate = rows[index]
                if (candidate.kind === 'message' && candidate.message.role === 'user') {
                    endIndex = index - 1
                    break
                }
            }

            const activeEndIndex = finalPrecedesRunningCompaction
                ? Math.min(endIndex, settledFinalIndex - 1)
                : endIndex
            const activeRows = rows.slice(userIndex + 1, activeEndIndex + 1)
            let latestNarrationIndex = -1
            for (let index = activeRows.length - 1; index >= 0; index -= 1) {
                const candidate = activeRows[index]
                if (
                    candidate.kind === 'message'
                    && candidate.message.role === 'assistant'
                    && candidate.message.text.trim()
                    && (!activeTurnId || candidate.message.turnId === activeTurnId || !candidate.message.turnId)
                ) {
                    latestNarrationIndex = index
                    break
                }
            }

            const liveNarrationRow = latestNarrationIndex >= 0 ? activeRows[latestNarrationIndex] || null : null
            const workRows = activeRows.filter((row) => (
                row.kind !== 'working'
                && !rowMustStayVisible(row)
            ))
            const visibleRows = activeRows.filter((row, index) => (
                row.kind !== 'working'
                && index !== latestNarrationIndex
                && rowMustStayVisible(row)
            ))
            const startedAt = activeTurnId
                ? turnUsageById?.get(activeTurnId)?.startedAt || turnUsageById?.get(activeTurnId)?.requestedAt
                : null

            activeRange = activeEndIndex >= userIndex + 1 && workRows.length > 0 ? {
                startIndex: userIndex + 1,
                endIndex: activeEndIndex,
                summary: {
                    kind: 'turn-work-summary',
                    id: `turn-work-summary-${activeTurnId || rows[userIndex]?.id || 'active'}`,
                    createdAt: workRows[0]?.createdAt || rows[userIndex]?.createdAt || latestTurnStartedAt || '',
                    turnId: activeTurnId,
                    startedAt: startedAt || latestTurnStartedAt || rows[userIndex]?.createdAt || '',
                    completedAt: null,
                    running: true,
                    outcome: null,
                    rows: workRows,
                    liveNarrationRow
                },
                visibleRows
            } : null
        }
    }

    for (let finalIndex = 0; finalIndex < rows.length; finalIndex += 1) {
        const finalRow = rows[finalIndex]
        if (finalRow.kind !== 'message' || finalRow.message.role !== 'assistant' || !finalRow.message.turnId) continue
        const turnId = finalRow.message.turnId
        if (finalByTurn.get(turnId) !== finalRow.message.id) continue

        const usage = turnUsageById?.get(turnId)
        const projectedTerminalOutcome = getProjectedTurnTerminalOutcome(rows, turnId)
        const isLatestFinal = finalRow.message.id === latestAssistantMessageId
        const turnCompleted = usage?.state === 'completed'
        const safeHistoricalFallback = turnId !== activeTurnId
            && !finalRow.message.streaming
            && usage?.state !== 'error'
            && usage?.state !== 'interrupted'
            && !projectedTerminalOutcome
        if (!isLatestFinal && !turnCompleted && !safeHistoricalFallback) continue
        if (usage?.state === 'error' || usage?.state === 'interrupted' || projectedTerminalOutcome) continue

        let userIndex = -1
        for (let index = finalIndex - 1; index >= 0; index -= 1) {
            const candidate = rows[index]
            if (candidate.kind !== 'message' || candidate.message.role !== 'user') continue
            if (candidate.message.turnId === turnId || !candidate.message.turnId) userIndex = index
            break
        }
        if (userIndex < 0 || finalIndex - userIndex <= 1) continue
        const matchedUserRow = rows[userIndex]
        const userMessage = matchedUserRow?.kind === 'message' ? matchedUserRow.message : null
        if (userMessage && isVoiceConversationMessage(userMessage)) continue

        const workRows = rows.slice(userIndex + 1, finalIndex)
        if (workRows.length === 0 || workRows.some(rowMustStayVisible)) continue

        const startedAt = usage?.startedAt
            || usage?.requestedAt
            || (isLatestFinal ? latestTurnStartedAt : null)
            || rows[userIndex]?.createdAt
            || workRows[0]?.createdAt
            || finalRow.createdAt
        const completedAt = finalRow.message.streaming
            ? finalRow.message.createdAt
            : usage?.completedAt || finalRow.message.updatedAt || finalRow.message.createdAt

        ranges.set(userIndex + 1, {
            endIndex: finalIndex,
            summary: {
                kind: 'turn-work-summary',
                id: `turn-work-summary-${turnId}`,
                createdAt: workRows[0]?.createdAt || finalRow.createdAt,
                turnId,
                startedAt,
                completedAt,
                running: false,
                outcome: 'completed',
                rows: workRows,
                liveNarrationRow: null
            }
        })
    }

    for (let userIndex = 0; userIndex < rows.length; userIndex += 1) {
        const userRow = rows[userIndex]
        if (userRow.kind !== 'message' || userRow.message.role !== 'user') continue
        if (isVoiceConversationMessage(userRow.message)) continue
        if (ranges.has(userIndex + 1)) continue

        let endIndex = rows.length
        for (let index = userIndex + 1; index < rows.length; index += 1) {
            const candidate = rows[index]
            if (candidate.kind === 'message' && candidate.message.role === 'user') {
                endIndex = index
                break
            }
        }

        const turnRows = rows.slice(userIndex + 1, endIndex)
        if (turnRows.length === 0) continue
        const turnId = inferLegacyUserTurnId(userRow.message, turnRows, turnUsageById)
        if (!turnId) continue

        const usage = turnUsageById?.get(turnId)
        const projectedTerminalOutcome = getProjectedTurnTerminalOutcome(turnRows, turnId)
        const terminalIncomplete = usage?.state === 'interrupted' || usage?.state === 'error' || Boolean(projectedTerminalOutcome)
        if (finalByTurn.has(turnId) && !terminalIncomplete) continue
        if (usage?.state === 'running' || (isWorking && turnId === activeTurnId)) continue
        const outcome = usage?.state === 'interrupted'
            ? 'interrupted'
            : usage?.state === 'error'
                ? 'failed'
                : projectedTerminalOutcome || 'no-response'
        const workRows = turnRows.filter((row) => row.kind !== 'working' && !rowMustStayVisible(row))
        const visibleRows = turnRows.filter((row) => row.kind !== 'working' && rowMustStayVisible(row))
        if (workRows.length === 0) continue

        const startedAt = usage?.startedAt
            || usage?.requestedAt
            || userRow.message.createdAt
            || workRows[0]?.createdAt
            || ''
        const lastWorkRow = workRows[workRows.length - 1]
        const completedAt = usage?.completedAt
            || (lastWorkRow ? getRowCompletedAt(lastWorkRow) : null)
            || userRow.message.updatedAt
            || userRow.message.createdAt

        ranges.set(userIndex + 1, {
            endIndex,
            summary: {
                kind: 'turn-work-summary',
                id: `turn-work-summary-${turnId}`,
                createdAt: workRows[0]?.createdAt || userRow.message.createdAt,
                turnId,
                startedAt,
                completedAt,
                running: false,
                outcome,
                rows: workRows,
                liveNarrationRow: null
            },
            visibleRows
        })
    }

    const displayRows: TimelineDisplayRow[] = []
    for (let index = 0; index < rows.length; index += 1) {
        if (activeRange && index === activeRange.startIndex) {
            displayRows.push(activeRange.summary, ...activeRange.visibleRows)
            index = activeRange.endIndex
            continue
        }
        const range = ranges.get(index)
        if (range) {
            displayRows.push(range.summary, ...(range.visibleRows || []))
            index = range.endIndex - 1
            continue
        }
        displayRows.push(rows[index])
    }
    return displayRows
}
