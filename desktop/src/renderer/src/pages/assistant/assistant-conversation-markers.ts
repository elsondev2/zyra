import type { AssistantSessionTurnUsageEntry } from '@shared/assistant/contracts'
import type { TimelineDisplayRow } from './assistant-timeline-helpers'

export const ASSISTANT_CONVERSATION_IDLE_GAP_MS = 60 * 60 * 1000

function lastActivityTime(row: TimelineDisplayRow): number {
    const time = Date.parse(row.createdAt || '')
    if (row.kind === 'message') return Math.max(time, Date.parse(row.message.updatedAt) || time)
    if (row.kind === 'turn-work-summary') return row.rows.reduce((latest, nested) => Math.max(latest, lastActivityTime(nested) || latest), Math.max(time, Date.parse(row.completedAt || '') || time))
    if (row.kind === 'activity') return Math.max(time, Date.parse(String(row.activity.payload?.completedAt || '')) || time)
    if ('activities' in row) return row.activities.reduce((latest, activity) => Math.max(latest, Date.parse(activity.createdAt) || latest, Date.parse(String(activity.payload?.completedAt || '')) || latest), time)
    return time
}

/** Decorate settled work grouping, never put conversation boundaries inside Work. */
export function addAssistantConversationMarkers(
    rows: TimelineDisplayRow[],
    turns?: ReadonlyMap<string, AssistantSessionTurnUsageEntry>
): TimelineDisplayRow[] {
    const result: TimelineDisplayRow[] = []
    // Index once: legacy prompts can have no turn ID, but share requestedAt.
    const byRequestedAt = new Map<string, AssistantSessionTurnUsageEntry | null>()
    for (const turn of turns?.values() || []) {
        const existing = byRequestedAt.get(turn.requestedAt)
        if (!byRequestedAt.has(turn.requestedAt) || existing?.id === turn.id) byRequestedAt.set(turn.requestedAt, turn)
        else byRequestedAt.set(turn.requestedAt, null)
    }
    let previousModel: string | null = null
    let latestActivity = Number.NaN
    for (const row of rows) {
        if (row.kind === 'message' && row.message.role === 'user' && !row.workBoundaryOnly) {
            const time = Date.parse(row.createdAt)
            if (Number.isFinite(latestActivity) && time - latestActivity >= ASSISTANT_CONVERSATION_IDLE_GAP_MS) {
                result.push({ kind: 'conversation-time', id: `conversation-time-${row.id}`, createdAt: row.createdAt })
            }
            const turn = (row.message.turnId ? turns?.get(row.message.turnId) : null)
                || byRequestedAt.get(row.createdAt)
            const model = turn?.model.trim() || null
            if (previousModel && model && model !== previousModel) {
                result.push({ kind: 'model-change', id: `model-change-${row.id}`, createdAt: row.createdAt, previousModel, model })
            }
            // Unknown historical models break the comparison; never label them
            // with today's selected model or imply a switch we cannot prove.
            previousModel = model
        }
        result.push(row)
        const time = lastActivityTime(row)
        if (Number.isFinite(time)) latestActivity = Number.isFinite(latestActivity) ? Math.max(latestActivity, time) : time
    }
    return result
}

export function formatAssistantConversationTime(value: string, now = new Date(), locale?: string): string {
    const date = new Date(value)
    if (!Number.isFinite(date.getTime())) return ''
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(day); yesterday.setDate(day.getDate() - 1)
    const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
    const label = dateDay === day.getTime() ? 'Today' : dateDay === yesterday.getTime() ? 'Yesterday'
        : date.toLocaleDateString(locale, { day: 'numeric', month: 'short', ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' as const } : {}) })
    return `${label} ${date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`
}
