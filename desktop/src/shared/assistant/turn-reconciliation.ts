const ASSISTANT_CANONICAL_TURN_REPLAY_WINDOW_MS = 10_000

type AssistantUserTurnBoundary = {
    id: string
    turnId: string | null
    createdAt: string
}

type AssistantPersistedTurnBoundary = {
    id: string
    requestedAt: string
    completedAt?: string | null
}

export type AssistantTurnReconciliation = {
    resolvedTurnIdByMessageId: Map<string, string>
    turnIdAliases: Map<string, string>
}

function timestamp(value: string): number | null {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : null
}

export function findAssistantPersistedTurnAt(
    turns: readonly AssistantPersistedTurnBoundary[],
    createdAt: string,
    completionGraceMs = 0
): AssistantPersistedTurnBoundary | null {
    const activityTimestamp = timestamp(createdAt)
    if (activityTimestamp === null) return null
    for (let index = turns.length - 1; index >= 0; index -= 1) {
        const turn = turns[index]!
        const requestedAt = timestamp(turn.requestedAt)
        if (requestedAt === null || requestedAt > activityTimestamp) continue
        const nextRequestedAt = index + 1 < turns.length ? timestamp(turns[index + 1]!.requestedAt) : null
        if (nextRequestedAt !== null && activityTimestamp >= nextRequestedAt) continue
        const completedAt = turn.completedAt ? timestamp(turn.completedAt) : null
        if (completedAt !== null && activityTimestamp > completedAt + Math.max(0, completionGraceMs)) return null
        return turn
    }
    return null
}

export function reconcileAssistantUserTurnIds(
    users: readonly AssistantUserTurnBoundary[],
    persistedTurns: readonly AssistantPersistedTurnBoundary[]
): AssistantTurnReconciliation {
    const persistedById = new Map(persistedTurns.map((turn) => [turn.id, turn]))
    const unclaimedPersistedTurnIds = new Set(persistedTurns.map((turn) => turn.id))
    const resolvedTurnIdByMessageId = new Map<string, string>()
    const turnIdAliases = new Map<string, string>()
    const matchedPersistedTurnIdByUserIndex = new Map<number, string>()

    const applyPersistedMatch = (user: AssistantUserTurnBoundary, userIndex: number, turnId: string) => {
        resolvedTurnIdByMessageId.set(user.id, turnId)
        matchedPersistedTurnIdByUserIndex.set(userIndex, turnId)
        unclaimedPersistedTurnIds.delete(turnId)
        if (user.turnId && user.turnId !== turnId) turnIdAliases.set(user.turnId, turnId)
    }

    users.forEach((user, index) => {
        const userTimestamp = timestamp(user.createdAt)
        const previousUserTimestamp = index > 0 ? timestamp(users[index - 1]!.createdAt) : null
        const nextUserTimestamp = index + 1 < users.length ? timestamp(users[index + 1]!.createdAt) : null
        const directTurn = user.turnId && unclaimedPersistedTurnIds.has(user.turnId)
            ? persistedById.get(user.turnId)
            : null
        const exactTurn = directTurn || persistedTurns.find((turn) => (
            unclaimedPersistedTurnIds.has(turn.id)
            && turn.requestedAt === user.createdAt
        ))
        const nearbyTurn = exactTurn || (userTimestamp === null ? null : persistedTurns
            .filter((turn) => unclaimedPersistedTurnIds.has(turn.id))
            .map((turn) => ({ turn, requestedAt: timestamp(turn.requestedAt) }))
            .filter((candidate): candidate is { turn: AssistantPersistedTurnBoundary; requestedAt: number } => (
                candidate.requestedAt !== null
                && Math.abs(candidate.requestedAt - userTimestamp) <= ASSISTANT_CANONICAL_TURN_REPLAY_WINDOW_MS
                && (previousUserTimestamp === null || candidate.requestedAt > previousUserTimestamp)
                && (nextUserTimestamp === null || candidate.requestedAt < nextUserTimestamp)
            ))
            .sort((left, right) => (
                Math.abs(left.requestedAt - userTimestamp) - Math.abs(right.requestedAt - userTimestamp)
                || left.requestedAt - right.requestedAt
                || left.turn.id.localeCompare(right.turn.id)
            ))[0]?.turn || null)
        const resolvedTurnId = nearbyTurn?.id || user.turnId || `message:${user.id}`
        resolvedTurnIdByMessageId.set(user.id, resolvedTurnId)
        if (nearbyTurn) applyPersistedMatch(user, index, nearbyTurn.id)
    })

    // Compaction and reconnect can delay canonical user-message persistence well beyond
    // the timestamp replay window. Preserve one-to-one turn order between reliable
    // neighboring anchors instead of manufacturing an empty persisted turn plus a
    // second message-only turn for the same prompt.
    const persistedIndexById = new Map(persistedTurns.map((turn, index) => [turn.id, index]))
    const anchors = [...matchedPersistedTurnIdByUserIndex.entries()]
        .map(([userIndex, turnId]) => ({ userIndex, persistedIndex: persistedIndexById.get(turnId) ?? -1 }))
        .filter((anchor) => anchor.persistedIndex >= 0)
        .sort((left, right) => left.userIndex - right.userIndex)
    const boundaries = [
        { userIndex: -1, persistedIndex: -1 },
        ...anchors,
        { userIndex: users.length, persistedIndex: persistedTurns.length }
    ]
    for (let boundaryIndex = 0; boundaryIndex < boundaries.length - 1; boundaryIndex += 1) {
        const left = boundaries[boundaryIndex]!
        const right = boundaries[boundaryIndex + 1]!
        if (right.userIndex <= left.userIndex || right.persistedIndex <= left.persistedIndex) continue
        const outerSegment = left.userIndex < 0 || right.userIndex >= users.length
        if (outerSegment && (anchors.length === 0 || users.length !== persistedTurns.length)) continue
        const unmatchedUserIndices = Array.from(
            { length: right.userIndex - left.userIndex - 1 },
            (_, offset) => left.userIndex + offset + 1
        ).filter((index) => !matchedPersistedTurnIdByUserIndex.has(index))
        const unmatchedTurns = persistedTurns
            .slice(left.persistedIndex + 1, right.persistedIndex)
            .filter((turn) => unclaimedPersistedTurnIds.has(turn.id))
        if (unmatchedUserIndices.length === 0 || unmatchedUserIndices.length !== unmatchedTurns.length) continue
        unmatchedUserIndices.forEach((userIndex, offset) => {
            const user = users[userIndex]
            const turn = unmatchedTurns[offset]
            if (user && turn) applyPersistedMatch(user, userIndex, turn.id)
        })
    }

    return { resolvedTurnIdByMessageId, turnIdAliases }
}

export function resolveAssistantTurnIdAlias(turnId: string | null | undefined, aliases: Map<string, string>): string | null {
    if (!turnId) return null
    return aliases.get(turnId) || turnId
}
