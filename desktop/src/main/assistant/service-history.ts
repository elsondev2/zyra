import type { AssistantLatestTurn, AssistantMessage, AssistantThread } from '../../shared/assistant/contracts'

type UserTurnEntry = {
    message: AssistantMessage
    index: number
    turnId: string | null
}

type AssistantDeleteMessagePlan = {
    rollbackTurnCount: number | null
    removedTurnIds: string[]
    deletedWindow: {
        startCreatedAt: string
        endCreatedAt: string | null
        includesThreadTail: boolean
    }
    patch: Pick<
        AssistantThread,
        | 'messages'
        | 'activities'
        | 'proposedPlans'
        | 'pendingApprovals'
        | 'pendingUserInputs'
        | 'activePlan'
        | 'lastSeenCompletedTurnId'
        | 'latestTurn'
        | 'state'
        | 'lastError'
        | 'updatedAt'
    >
}

function getSortedMessages(thread: AssistantThread): AssistantMessage[] {
    return [...thread.messages].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
}

function inferTurnIdForUserMessage(messages: AssistantMessage[], index: number, targetMessageId: string, fallbackTurnId: string | null): string | null {
    for (let cursor = index + 1; cursor < messages.length; cursor += 1) {
        if (messages[cursor]?.role === 'user') break
        if (messages[cursor]?.turnId) return messages[cursor].turnId
    }

    return messages[index]?.id === targetMessageId ? fallbackTurnId : null
}

function getUserTurnEntries(messages: AssistantMessage[], targetMessageId: string, fallbackTurnId: string | null): UserTurnEntry[] {
    return messages
        .map((message, index) => message.role === 'user'
            ? {
                message,
                index,
                turnId: inferTurnIdForUserMessage(messages, index, targetMessageId, fallbackTurnId)
            }
            : null
        )
        .filter((entry): entry is UserTurnEntry => Boolean(entry))
}

function getNextUserMessageIndex(messages: AssistantMessage[], index: number): number {
    for (let cursor = index + 1; cursor < messages.length; cursor += 1) {
        if (messages[cursor]?.role === 'user') return cursor
    }

    return messages.length
}

function getLatestRemainingTurn(threadMessages: AssistantMessage[], orderedTurnIds: string[], removedTurnIds: Set<string>, occurredAt: string): AssistantLatestTurn | null {
    const remainingTurnIds = orderedTurnIds.filter((turnId) => !removedTurnIds.has(turnId))
    const latestRemainingTurnId = remainingTurnIds[remainingTurnIds.length - 1] || null
    if (!latestRemainingTurnId) return null

    const latestRemainingAssistantMessage = [...threadMessages]
        .reverse()
        .find((message) => message.role === 'assistant' && message.turnId === latestRemainingTurnId) || null

    return {
        id: latestRemainingTurnId,
        state: 'completed',
        requestedAt: latestRemainingAssistantMessage?.createdAt || occurredAt,
        startedAt: latestRemainingAssistantMessage?.createdAt || null,
        completedAt: latestRemainingAssistantMessage?.updatedAt || occurredAt,
        assistantMessageId: latestRemainingAssistantMessage?.id || null,
        effort: null,
        serviceTier: null,
        usage: null
    }
}

function getRemainingLatestTurn(
    thread: AssistantThread,
    threadMessages: AssistantMessage[],
    orderedTurnIds: string[],
    removedTurnIds: Set<string>,
    occurredAt: string
): AssistantLatestTurn | null {
    if (thread.latestTurn && !removedTurnIds.has(thread.latestTurn.id)) {
        return thread.latestTurn
    }

    return getLatestRemainingTurn(threadMessages, orderedTurnIds, removedTurnIds, occurredAt)
}

function getRemainingLastSeenCompletedTurnId(
    thread: AssistantThread,
    orderedTurnIds: string[],
    removedTurnIds: Set<string>
): string | null {
    if (!thread.lastSeenCompletedTurnId || !removedTurnIds.has(thread.lastSeenCompletedTurnId)) {
        return thread.lastSeenCompletedTurnId
    }

    const latestTurnId = thread.latestTurn?.id || null
    const latestTurnCompleted = thread.latestTurn?.state === 'completed'
    const remainingTurnIds = orderedTurnIds.filter((turnId) => !removedTurnIds.has(turnId))

    for (let index = remainingTurnIds.length - 1; index >= 0; index -= 1) {
        const candidateTurnId = remainingTurnIds[index]
        if (candidateTurnId !== latestTurnId) return candidateTurnId
        if (latestTurnCompleted) return candidateTurnId
    }

    return null
}

function isWithinDeletedWindow(createdAt: string, startCreatedAt: string, endCreatedAt: string | null): boolean {
    if (createdAt < startCreatedAt) return false
    if (endCreatedAt && createdAt >= endCreatedAt) return false
    return true
}

export function buildDeleteMessagePlan(thread: AssistantThread, messageId: string, occurredAt: string): AssistantDeleteMessagePlan {
    const messages = getSortedMessages(thread)
    const targetIndex = messages.findIndex((message) => message.id === messageId && message.role === 'user')
    if (targetIndex < 0) {
        throw new Error('User message not found.')
    }

    const userTurnEntries = getUserTurnEntries(messages, messageId, thread.latestTurn?.id || null)
    const targetEntry = userTurnEntries.find((entry) => entry.message.id === messageId)
    if (!targetEntry) {
        throw new Error('Unable to resolve message turn.')
    }

    const orderedTurnIds = userTurnEntries
        .map((entry) => entry.turnId)
        .filter((turnId, index, array): turnId is string => Boolean(turnId) && array.indexOf(turnId) === index)

    const targetTurnIndex = targetEntry.turnId ? orderedTurnIds.indexOf(targetEntry.turnId) : -1
    const nextUserIndex = getNextUserMessageIndex(messages, targetIndex)
    const removedTurnIds = new Set(targetEntry.turnId ? [targetEntry.turnId] : [])
    const deletedWindowStartAt = targetEntry.message.createdAt
    const deletedWindowEndAt = nextUserIndex < messages.length ? messages[nextUserIndex]?.createdAt || null : null
    const includesThreadTail = nextUserIndex >= messages.length
    const keptMessages = messages.filter((_message, index) => index < targetIndex || index >= nextUserIndex)
    const latestTurn = getRemainingLatestTurn(thread, keptMessages, orderedTurnIds, removedTurnIds, occurredAt)
    const lastSeenCompletedTurnId = getRemainingLastSeenCompletedTurnId(thread, orderedTurnIds, removedTurnIds)

    const shouldKeepRecord = (turnId: string | null, createdAt: string): boolean => {
        if (turnId && removedTurnIds.has(turnId)) return false
        if (!turnId && isWithinDeletedWindow(createdAt, deletedWindowStartAt, deletedWindowEndAt)) return false
        return true
    }

    return {
        rollbackTurnCount: includesThreadTail && targetTurnIndex >= 0 ? 1 : null,
        removedTurnIds: [...removedTurnIds],
        deletedWindow: {
            startCreatedAt: deletedWindowStartAt,
            endCreatedAt: deletedWindowEndAt,
            includesThreadTail
        },
        patch: {
            messages: keptMessages,
            activities: thread.activities.filter((activity) => shouldKeepRecord(activity.turnId, activity.createdAt)),
            proposedPlans: thread.proposedPlans.filter((plan) => shouldKeepRecord(plan.turnId, plan.createdAt)),
            pendingApprovals: thread.pendingApprovals.filter((approval) => shouldKeepRecord(approval.turnId, approval.createdAt)),
            pendingUserInputs: thread.pendingUserInputs.filter((entry) => shouldKeepRecord(entry.turnId, entry.createdAt)),
            activePlan: thread.activePlan && thread.activePlan.turnId && removedTurnIds.has(thread.activePlan.turnId) ? null : thread.activePlan,
            lastSeenCompletedTurnId,
            latestTurn,
            state: includesThreadTail ? 'ready' : thread.state,
            lastError: includesThreadTail ? null : thread.lastError,
            updatedAt: occurredAt
        }
    }
}
