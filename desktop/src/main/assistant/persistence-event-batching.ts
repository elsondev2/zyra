import type { AssistantDomainEvent, AssistantSnapshot } from '../../shared/assistant/contracts'

export type PendingAssistantPersistenceEvent = {
    event: AssistantDomainEvent
    snapshot: AssistantSnapshot
}

function readMessageId(event: AssistantDomainEvent): string {
    const message = event.payload['message']
    const messageId = message && typeof message === 'object'
        ? String((message as Record<string, unknown>)['id'] || '')
        : ''
    return String(event.payload['messageId'] || messageId)
}

function readActivityId(event: AssistantDomainEvent): string {
    const activity = event.payload['activity']
    if (!activity || typeof activity !== 'object') return ''
    return String((activity as Record<string, unknown>)['id'] || '')
}

function getReplaceablePersistenceKey(event: AssistantDomainEvent): string | null {
    const threadId = String(event.threadId || event.payload['threadId'] || '')
    if (!threadId) return null

    if (
        event.type === 'thread.message.assistant.delta'
        || event.type === 'thread.message.assistant.completed'
    ) {
        const messageId = readMessageId(event)
        return messageId ? `message:${threadId}:${messageId}` : null
    }

    if (event.type === 'thread.activity.appended') {
        const activityId = readActivityId(event)
        return activityId ? `activity:${threadId}:${activityId}` : null
    }

    return null
}

/**
 * Persistence stores current rows rather than an append-only event journal. Keep
 * only the newest complete snapshot for repeated updates to one streaming row.
 * Superseded entries are removed in-place and the newest entry remains in
 * sequence order so snapshot metadata can never move backwards.
 */
export function coalesceAssistantPersistenceEvents(
    entries: PendingAssistantPersistenceEvent[]
): PendingAssistantPersistenceEvent[] {
    if (entries.length < 2) return entries

    const coalesced: Array<PendingAssistantPersistenceEvent | null> = []
    const latestIndexByKey = new Map<string, number>()

    for (const entry of entries) {
        const key = getReplaceablePersistenceKey(entry.event)
        if (key) {
            const previousIndex = latestIndexByKey.get(key)
            if (previousIndex !== undefined) coalesced[previousIndex] = null
            latestIndexByKey.set(key, coalesced.length)
        }
        coalesced.push(entry)
    }

    return coalesced.filter((entry): entry is PendingAssistantPersistenceEvent => entry !== null)
}
