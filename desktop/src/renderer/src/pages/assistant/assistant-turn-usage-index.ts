import type { AssistantMessage, AssistantSessionTurnUsageEntry } from '@shared/assistant/contracts'
import { reconcileAssistantUserTurnIds } from '@shared/assistant/turn-reconciliation'

export function buildAssistantTurnUsageIndex(
    messages: readonly AssistantMessage[],
    turns: readonly AssistantSessionTurnUsageEntry[]
): Map<string, AssistantSessionTurnUsageEntry> {
    const usageById = new Map(turns.map((turn) => [turn.id, turn]))
    if (messages.length === 0 || turns.length === 0) return usageById

    const users = messages.filter((message) => message.role === 'user')
    const reconciliation = reconcileAssistantUserTurnIds(users, turns)
    for (const user of users) {
        const resolvedTurnId = reconciliation.resolvedTurnIdByMessageId.get(user.id)
        const usage = resolvedTurnId ? usageById.get(resolvedTurnId) : null
        if (!usage) continue
        if (user.turnId) usageById.set(user.turnId, usage)
    }
    for (const [alias, resolvedTurnId] of reconciliation.turnIdAliases) {
        const usage = usageById.get(resolvedTurnId)
        if (usage) usageById.set(alias, usage)
    }
    return usageById
}
