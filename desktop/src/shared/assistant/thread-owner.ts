import type { AssistantSession, AssistantThread } from './contracts'

/** Restore the owner's saved authority rather than copying a child's scope. */
export function resolveAgentThreadOwner(sessions: AssistantSession[], thread: AssistantThread): { session: AssistantSession; thread: AssistantThread } | null {
    if (thread.source !== 'subagent') return null
    const providerParentId = thread.providerParentThreadId
    const localParentId = thread.parentThreadId
    for (const session of sessions) {
        const parent = session.threads.find(candidate => candidate.id !== thread.id && (
            Boolean(providerParentId && candidate.providerThreadId === providerParentId)
            || Boolean(localParentId && candidate.id === localParentId)
        ))
        if (parent) return { session, thread: parent }
    }
    return null
}
