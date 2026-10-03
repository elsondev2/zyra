import type { AssistantSnapshot } from '@shared/assistant/contracts'
import { assistantStore } from '@/lib/assistant/assistant-store-core'

export function findAssistantThreadLink(snapshot: AssistantSnapshot, targetId: string): string | null {
    const runId = targetId.startsWith('agent-run:') ? targetId.slice(10) : null
    const canonicalId = runId ? Object.values(snapshot.fleetByThreadId || {})
        .map(fleet => fleet.agents[runId]?.providerSessionId).find(Boolean) : targetId
    if (!canonicalId) return null
    for (const session of snapshot.sessions) {
        const thread = session.threads.find(thread => thread.id === canonicalId || thread.providerThreadId === canonicalId)
        if (thread) return `/assistant/chat/${encodeURIComponent(session.id)}/thread/${encodeURIComponent(thread.id)}`
    }
    return null
}

export async function openAssistantThreadLink(targetId: string, messageId?: string | null): Promise<void> {
    let snapshot = assistantStore.getState().snapshot
    let link = findAssistantThreadLink(snapshot, targetId)
    if (!link) {
        // A newly created child may not have appeared in the shell projection yet.
        await assistantStore.refresh()
        snapshot = assistantStore.getState().snapshot
        link = findAssistantThreadLink(snapshot, targetId)
    }
    if (!link) throw new Error('This thread is not available yet. Try again shortly.')
    location.hash = messageId ? `${link}?message=${encodeURIComponent(messageId.startsWith('zyra-thread-message:') ? messageId : `zyra-thread-message:${messageId}`)}` : link
}
