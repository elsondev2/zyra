import type { AssistantSession } from '@shared/assistant/contracts'

type CanonicalPresence = { clients: Array<{ surface: string }> }

export function hasAssistantTuiPresence(presence: CanonicalPresence | null | undefined): boolean {
    return (presence?.clients || []).some((client) => String(client.surface || '').trim().toLowerCase() === 'tui')
}

export function isAssistantSessionOpenInTui(session: AssistantSession): boolean {
    return session.threads.some((thread) => hasAssistantTuiPresence(thread.canonicalPresence))
}
