import { useMemo, useRef } from 'react'
import type { AssistantActivity, AssistantMessage, AssistantProposedPlan } from '@shared/assistant/contracts'
import { getTimelineEntries, shouldRenderMessage, type TimelineEntry } from './assistant-timeline-helpers'

type TimelineEntriesCache = {
    messages: AssistantMessage[]
    activities: AssistantActivity[]
    proposedPlans: AssistantProposedPlan[]
    entries: TimelineEntry[]
}

function findLastMessageEntryIndex(entries: TimelineEntry[]): number {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
        if (entries[index]?.type === 'message') {
            return index
        }
    }
    return -1
}

function haveStableMessagePrefix(previous: AssistantMessage[], next: AssistantMessage[], prefixLength: number): boolean {
    for (let index = 0; index < prefixLength; index += 1) {
        if (previous[index] !== next[index]) {
            return false
        }
    }
    return true
}

export function useAssistantTimelineEntries(
    messages: AssistantMessage[],
    activities: AssistantActivity[],
    proposedPlans: AssistantProposedPlan[] = []
): TimelineEntry[] {
    const cacheRef = useRef<TimelineEntriesCache | null>(null)

    return useMemo(() => {
        const cached = cacheRef.current
        if (cached) {
            if (cached.messages === messages && cached.activities === activities && cached.proposedPlans === proposedPlans) {
                return cached.entries
            }

            if (cached.activities === activities && cached.proposedPlans === proposedPlans && cached.messages.length > 0) {
                const previousLastMessage = cached.messages[cached.messages.length - 1]
                const nextLastMessage = messages[messages.length - 1]

                if (
                    messages.length === cached.messages.length
                    && nextLastMessage
                    && previousLastMessage
                    && haveStableMessagePrefix(cached.messages, messages, Math.max(0, messages.length - 1))
                    && previousLastMessage.id === nextLastMessage.id
                ) {
                    const messageEntryIndex = findLastMessageEntryIndex(cached.entries)
                    if (
                        messageEntryIndex >= 0
                        && cached.entries[messageEntryIndex]?.id === nextLastMessage.id
                        && shouldRenderMessage(nextLastMessage)
                    ) {
                        const nextEntries = [...cached.entries]
                        nextEntries[messageEntryIndex] = {
                            id: nextLastMessage.id,
                            createdAt: nextLastMessage.createdAt,
                            type: 'message',
                            message: nextLastMessage
                        }
                        cacheRef.current = { messages, activities, proposedPlans, entries: nextEntries }
                        return nextEntries
                    }
                }

                if (
                    messages.length === cached.messages.length + 1
                    && haveStableMessagePrefix(cached.messages, messages, cached.messages.length)
                ) {
                    const appendedMessage = messages[messages.length - 1]
                    if (
                        appendedMessage.role === 'assistant'
                        && appendedMessage.turnId
                    ) {
                        const entries = getTimelineEntries(messages, activities, proposedPlans)
                        cacheRef.current = { messages, activities, proposedPlans, entries }
                        return entries
                    }
                    if (!shouldRenderMessage(appendedMessage)) {
                        cacheRef.current = { messages, activities, proposedPlans, entries: cached.entries }
                        return cached.entries
                    }
                    const nextEntries = [
                        ...cached.entries,
                        {
                            id: appendedMessage.id,
                            createdAt: appendedMessage.createdAt,
                            type: 'message' as const,
                            message: appendedMessage
                        }
                    ]
                    cacheRef.current = { messages, activities, proposedPlans, entries: nextEntries }
                    return nextEntries
                }
            }
        }

        const entries = getTimelineEntries(messages, activities, proposedPlans)
        cacheRef.current = { messages, activities, proposedPlans, entries }
        return entries
    }, [activities, messages, proposedPlans])
}
