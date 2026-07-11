import { useMemo, useRef } from 'react'
import type { AssistantActivity, AssistantMessage, AssistantProposedPlan } from '@shared/assistant/contracts'
import { getTimelineEntries, shouldRenderMessage, type TimelineEntry } from './assistant-timeline-helpers'

type TimelineEntriesCache = {
    messages: AssistantMessage[]
    activities: AssistantActivity[]
    proposedPlans: AssistantProposedPlan[]
    entries: TimelineEntry[]
}

type TimelineSourceWindowCache = {
    sourceMessages: AssistantMessage[]
    sourceActivities: AssistantActivity[]
    sourceProposedPlans: AssistantProposedPlan[]
    messages: AssistantMessage[]
    activities: AssistantActivity[]
    proposedPlans: AssistantProposedPlan[]
    sourceItemLimit: number | null
}

const TIMELINE_SOURCE_WINDOW_OVERSCAN = 32

function getTimelineSourceWindow(
    cache: TimelineSourceWindowCache | null,
    messages: AssistantMessage[],
    activities: AssistantActivity[],
    proposedPlans: AssistantProposedPlan[],
    loadedEntryCount?: number
): TimelineSourceWindowCache {
    const sourceItemLimit = typeof loadedEntryCount === 'number'
        ? Math.max(0, loadedEntryCount + TIMELINE_SOURCE_WINDOW_OVERSCAN)
        : null

    if (
        cache
        && cache.sourceMessages === messages
        && cache.sourceActivities === activities
        && cache.sourceProposedPlans === proposedPlans
        && cache.sourceItemLimit === sourceItemLimit
    ) {
        return cache
    }

    if (sourceItemLimit === null || messages.length + activities.length + proposedPlans.length <= sourceItemLimit * 2) {
        return {
            sourceMessages: messages,
            sourceActivities: activities,
            sourceProposedPlans: proposedPlans,
            messages,
            activities,
            proposedPlans,
            sourceItemLimit
        }
    }

    return {
        sourceMessages: messages,
        sourceActivities: activities,
        sourceProposedPlans: proposedPlans,
        messages: messages.slice(-sourceItemLimit),
        activities: activities.slice(0, sourceItemLimit),
        proposedPlans: proposedPlans.slice(-sourceItemLimit),
        sourceItemLimit
    }
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
    proposedPlans: AssistantProposedPlan[] = [],
    loadedEntryCount?: number
): TimelineEntry[] {
    const cacheRef = useRef<TimelineEntriesCache | null>(null)
    const sourceWindowCacheRef = useRef<TimelineSourceWindowCache | null>(null)

    return useMemo(() => {
        const sourceWindow = getTimelineSourceWindow(
            sourceWindowCacheRef.current,
            messages,
            activities,
            proposedPlans,
            loadedEntryCount
        )
        sourceWindowCacheRef.current = sourceWindow
        const sourceMessages = sourceWindow.messages
        const sourceActivities = sourceWindow.activities
        const sourceProposedPlans = sourceWindow.proposedPlans
        const cached = cacheRef.current
        if (cached) {
            if (cached.messages === sourceMessages && cached.activities === sourceActivities && cached.proposedPlans === sourceProposedPlans) {
                return cached.entries
            }

            if (cached.activities === sourceActivities && cached.proposedPlans === sourceProposedPlans && cached.messages.length > 0) {
                const previousLastMessage = cached.messages[cached.messages.length - 1]
                const nextLastMessage = sourceMessages[sourceMessages.length - 1]

                if (
                    sourceMessages.length === cached.messages.length
                    && nextLastMessage
                    && previousLastMessage
                    && haveStableMessagePrefix(cached.messages, sourceMessages, Math.max(0, sourceMessages.length - 1))
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
                        cacheRef.current = { messages: sourceMessages, activities: sourceActivities, proposedPlans: sourceProposedPlans, entries: nextEntries }
                        return nextEntries
                    }
                }

                if (
                    sourceMessages.length === cached.messages.length + 1
                    && haveStableMessagePrefix(cached.messages, sourceMessages, cached.messages.length)
                ) {
                    const appendedMessage = sourceMessages[sourceMessages.length - 1]
                    if (
                        appendedMessage.role === 'assistant'
                        && appendedMessage.turnId
                    ) {
                        const entries = getTimelineEntries(sourceMessages, sourceActivities, sourceProposedPlans)
                        cacheRef.current = { messages: sourceMessages, activities: sourceActivities, proposedPlans: sourceProposedPlans, entries }
                        return entries
                    }
                    if (!shouldRenderMessage(appendedMessage)) {
                        cacheRef.current = { messages: sourceMessages, activities: sourceActivities, proposedPlans: sourceProposedPlans, entries: cached.entries }
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
                    cacheRef.current = { messages: sourceMessages, activities: sourceActivities, proposedPlans: sourceProposedPlans, entries: nextEntries }
                    return nextEntries
                }
            }
        }

        const entries = getTimelineEntries(sourceMessages, sourceActivities, sourceProposedPlans)
        cacheRef.current = { messages: sourceMessages, activities: sourceActivities, proposedPlans: sourceProposedPlans, entries }
        return entries
    }, [activities, loadedEntryCount, messages, proposedPlans])
}
