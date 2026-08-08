import type { AssistantLatestTurn, AssistantThreadState } from '../../shared/assistant/contracts'
import type { CanonicalAgentChatPresence } from './zyra-agent-server-worker'

const ACTIVE_CANONICAL_PRESENCE_STATES = new Set<CanonicalAgentChatPresence['state']>(['running', 'background'])
const ACTIVE_ASSISTANT_THREAD_STATES = new Set<AssistantThreadState>(['starting', 'running', 'waiting'])

/**
 * Reconcile the persisted Desktop shell with the server-owned canonical worker.
 * Detached chats keep their persisted terminal state so an absent worker does not
 * rewrite ordinary history. Live canonical presence wins for active transitions.
 */
export function resolveCanonicalPresenceThreadState(input: {
    currentState: AssistantThreadState
    previousPresence?: CanonicalAgentChatPresence | null
    presence?: CanonicalAgentChatPresence | null
}): AssistantThreadState {
    const { currentState, previousPresence, presence } = input
    if (!presence) return currentState
    if (presence.state === 'running') return 'running'
    if (presence.state === 'background') return 'waiting'
    if (
        presence.state === 'ready'
        && (
            ACTIVE_ASSISTANT_THREAD_STATES.has(currentState)
            || (previousPresence ? ACTIVE_CANONICAL_PRESENCE_STATES.has(previousPresence.state) : false)
        )
    ) {
        return 'ready'
    }
    return currentState
}

export function resolveCanonicalPresenceAttention(input: {
    currentHasPendingApprovals: boolean
    currentHasPendingUserInputs: boolean
    hasLocalPendingApproval: boolean
    hasLocalPendingInput: boolean
    presence?: CanonicalAgentChatPresence | null
}): { hasPendingApprovals: boolean; hasPendingUserInputs: boolean } {
    const canonicalAttentionReported = Boolean(
        input.presence
        && Object.prototype.hasOwnProperty.call(input.presence, 'attention')
    )
    if (!canonicalAttentionReported) {
        return {
            hasPendingApprovals: input.currentHasPendingApprovals || input.hasLocalPendingApproval,
            hasPendingUserInputs: input.currentHasPendingUserInputs || input.hasLocalPendingInput
        }
    }
    return {
        hasPendingApprovals: input.hasLocalPendingApproval || input.presence?.attention === 'approval',
        hasPendingUserInputs: input.hasLocalPendingInput || input.presence?.attention === 'input'
    }
}

export function mergeCanonicalPresenceLatestTurn(
    current: AssistantLatestTurn | null,
    presence?: CanonicalAgentChatPresence | null
): AssistantLatestTurn | null {
    const canonical = presence?.latestTurn
    if (!canonical) return current
    if (!current || current.id !== canonical.id) {
        return {
            ...canonical,
            usage: null
        }
    }
    return {
        ...current,
        ...canonical,
        assistantMessageId: canonical.assistantMessageId || current.assistantMessageId,
        effort: current.effort,
        serviceTier: current.serviceTier,
        usage: current.usage || null
    }
}
