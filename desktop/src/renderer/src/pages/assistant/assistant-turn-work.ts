import type { AssistantMessage, AssistantSessionTurnUsageEntry } from '@shared/assistant/contracts'
import {
    isModelNoticeActivity,
    type TimelineDisplayRow,
    type TimelineRenderRow,
    type TimelineTurnWorkSummaryRow
} from './assistant-timeline-helpers'

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

function rowMustStayVisible(row: TimelineRenderRow): boolean {
    if (row.kind === 'working') return true
    if (row.kind === 'activity') return isModelNoticeActivity(row.activity)
    if (row.kind === 'activity-group') {
        return row.activities.some(isModelNoticeActivity)
    }
    return false
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
    const latestAssistantTurnId = latestAssistantMessageId
        ? messages.find((message) => message.id === latestAssistantMessageId)?.turnId || null
        : null
    const latestRenderedTurnId = [...rows].reverse().map(getRowTurnId).find(Boolean) || null
    const activeTurnId = isWorking ? runningTurnId || latestAssistantTurnId || latestRenderedTurnId : null
    const ranges = new Map<number, { endIndex: number; summary: TimelineTurnWorkSummaryRow }>()
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

        if (userIndex >= 0) {
            let endIndex = rows.length - 1
            for (let index = userIndex + 1; index < rows.length; index += 1) {
                const candidate = rows[index]
                if (candidate.kind === 'message' && candidate.message.role === 'user') {
                    endIndex = index - 1
                    break
                }
            }

            const activeRows = rows.slice(userIndex + 1, endIndex + 1)
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
            const startedAt = runningTurnId
                ? turnUsageById?.get(runningTurnId)?.startedAt || turnUsageById?.get(runningTurnId)?.requestedAt
                : null

            activeRange = {
                startIndex: userIndex + 1,
                endIndex,
                summary: {
                    kind: 'turn-work-summary',
                    id: `turn-work-summary-${activeTurnId || rows[userIndex]?.id || 'active'}`,
                    createdAt: workRows[0]?.createdAt || rows[userIndex]?.createdAt || latestTurnStartedAt || '',
                    turnId: activeTurnId,
                    startedAt: startedAt || latestTurnStartedAt || rows[userIndex]?.createdAt || '',
                    completedAt: null,
                    running: true,
                    rows: workRows,
                    liveNarrationRow
                },
                visibleRows
            }
        }
    }

    for (let finalIndex = 0; finalIndex < rows.length; finalIndex += 1) {
        const finalRow = rows[finalIndex]
        if (finalRow.kind !== 'message' || finalRow.message.role !== 'assistant' || !finalRow.message.turnId) continue
        const turnId = finalRow.message.turnId
        if (finalByTurn.get(turnId) !== finalRow.message.id) continue

        const usage = turnUsageById?.get(turnId)
        const isLatestFinal = finalRow.message.id === latestAssistantMessageId
        const turnCompleted = usage?.state === 'completed'
        const safeHistoricalFallback = turnId !== activeTurnId
            && !finalRow.message.streaming
            && usage?.state !== 'error'
            && usage?.state !== 'interrupted'
        if (!isLatestFinal && !turnCompleted && !safeHistoricalFallback) continue
        if (usage?.state === 'error' || usage?.state === 'interrupted') continue

        let userIndex = -1
        for (let index = finalIndex - 1; index >= 0; index -= 1) {
            const candidate = rows[index]
            if (
                candidate.kind === 'message'
                && candidate.message.role === 'user'
                && (candidate.message.turnId === turnId || !candidate.message.turnId)
            ) {
                userIndex = index
                break
            }
        }
        if (userIndex < 0 || finalIndex - userIndex <= 1) continue

        const workRows = rows.slice(userIndex + 1, finalIndex)
        if (
            workRows.length === 0
            || workRows.some((row) => {
                const rowTurnId = getRowTurnId(row)
                return (rowTurnId !== turnId && rowTurnId !== null) || rowMustStayVisible(row)
            })
        ) continue

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
                rows: workRows,
                liveNarrationRow: null
            }
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
            displayRows.push(range.summary)
            index = range.endIndex - 1
            continue
        }
        displayRows.push(rows[index])
    }
    return displayRows
}
