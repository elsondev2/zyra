import { assistantStore } from '@/lib/assistant/assistant-store-core'
import { getSortableTimestamp, isAssistantDraftSession } from './assistant-sessions-rail-utils'

function orderedSessionIds(): string[] {
    return assistantStore.getState().snapshot.sessions
        .filter(session => !session.archived && !isAssistantDraftSession(session))
        .sort((left, right) => getSortableTimestamp(right.createdAt) - getSortableTimestamp(left.createdAt) || left.id.localeCompare(right.id))
        .map(session => session.id)
}

export function cycleAssistantChat(direction: 1 | -1): boolean {
    const ids = orderedSessionIds()
    if (ids.length < 2) return false
    const current = assistantStore.getState().snapshot.selectedSessionId
    const index = current ? ids.indexOf(current) : -1
    const nextIndex = index < 0 ? (direction > 0 ? 0 : ids.length - 1) : (index + direction + ids.length) % ids.length
    const next = ids[nextIndex]
    if (!next) return false
    void assistantStore.selectSession(next)
    return true
}

export function selectAssistantChatAt(index: number): boolean {
    const id = orderedSessionIds()[index]
    if (!id) return false
    void assistantStore.selectSession(id)
    return true
}
