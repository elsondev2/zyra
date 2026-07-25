import type { AssistantThread } from '../../shared/assistant/contracts'

type AssistantThreadIdentity = Pick<AssistantThread, 'id' | 'providerThreadId'>

function normalizeThreadId(value: string | null | undefined): string {
    return String(value || '').trim()
}

/**
 * Returns the canonical cross-surface thread ID.
 *
 * Pi persists this value as its session ID. Older desktop chats may only have
 * the local database key, so that key remains a compatibility fallback.
 */
export function getAssistantCanonicalThreadId(thread: AssistantThreadIdentity): string {
    return normalizeThreadId(thread.providerThreadId) || normalizeThreadId(thread.id)
}

/** Accept both the canonical Pi ID and the existing desktop database key. */
export function matchesAssistantThreadId(thread: AssistantThreadIdentity, candidate: string | null | undefined): boolean {
    const normalizedCandidate = normalizeThreadId(candidate)
    if (!normalizedCandidate) return false
    return normalizeThreadId(thread.id) === normalizedCandidate
        || getAssistantCanonicalThreadId(thread) === normalizedCandidate
}
