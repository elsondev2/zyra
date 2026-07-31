import type { AssistantThreadState } from '../../shared/assistant/contracts'
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
