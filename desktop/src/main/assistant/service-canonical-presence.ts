import type { AssistantLatestTurn, AssistantThreadState } from '../../shared/assistant/contracts'
import { normalizeAssistantMessageReferenceId } from '../../shared/assistant/message-identity'
import type { CanonicalAgentChatPresence } from './zyra-agent-server-worker'

const ACTIVE_CANONICAL_PRESENCE_STATES = new Set<CanonicalAgentChatPresence['state']>(['running', 'background'])
const ACTIVE_ASSISTANT_THREAD_STATES = new Set<AssistantThreadState>(['starting', 'running', 'waiting'])

type DesktopCanonicalPresence = CanonicalAgentChatPresence & { observedSequence?: number }

export function isCanonicalPresenceActive(presence?: CanonicalAgentChatPresence | null): boolean {
    return presence?.state === 'running' || presence?.state === 'background'
}

export function hasCanonicalUserInputAttention(presence?: CanonicalAgentChatPresence | null): boolean {
    return presence?.attention === 'input' || presence?.attention === 'user-input'
}

export function mergeCanonicalPresenceObservation(
    previous: DesktopCanonicalPresence | null | undefined,
    observed: CanonicalAgentChatPresence
): DesktopCanonicalPresence {
    const appliedSequence = Math.max(0, Number(previous?.latestSequence) || 0)
    const observedSequence = Math.max(
        appliedSequence,
        Number(previous?.observedSequence) || 0,
        Number(observed.latestSequence) || 0
    )
    return {
        ...observed,
        latestSequence: appliedSequence,
        observedSequence
    }
}

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
        hasPendingUserInputs: input.hasLocalPendingInput || hasCanonicalUserInputAttention(input.presence)
    }
}

export function mergeCanonicalPresenceLatestTurn(
    current: AssistantLatestTurn | null,
    presence?: CanonicalAgentChatPresence | null
): AssistantLatestTurn | null {
    const canonical = presence?.latestTurn
    if (!canonical) return current
    const canonicalAssistantMessageId = normalizeAssistantMessageReferenceId(canonical.assistantMessageId)
    if (!current || current.id !== canonical.id) {
        return {
            ...canonical,
            assistantMessageId: canonicalAssistantMessageId,
            usage: null
        }
    }
    return {
        ...current,
        ...canonical,
        assistantMessageId: canonicalAssistantMessageId || current.assistantMessageId,
        effort: current.effort,
        serviceTier: current.serviceTier,
        usage: current.usage || null
    }
}
