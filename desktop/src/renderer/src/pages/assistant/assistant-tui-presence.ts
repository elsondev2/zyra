import type { AssistantSession } from '@shared/assistant/contracts'

type CanonicalPresence = { clients: Array<{ surface: string; clientId?: string; displayName?: string }> }

export function assistantMobileDevices(presence: CanonicalPresence | null | undefined): string[] {
    const devices = new Map<string, string>()
    for (const client of presence?.clients || []) {
        if (String(client.surface || '').trim().toLowerCase() !== 'mobile') continue
        const name = client.displayName?.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '').trim().slice(0, 96) || 'Android phone'
        devices.set(client.clientId || name, name)
    }
    return [...devices.values()]
}

export function assistantSessionMobileDevices(session: AssistantSession): string[] {
    return assistantMobileDevices({ clients: session.threads.flatMap(thread => thread.canonicalPresence?.clients || []) })
}

export function hasAssistantTuiPresence(presence: CanonicalPresence | null | undefined): boolean {
    return (presence?.clients || []).some((client) => String(client.surface || '').trim().toLowerCase() === 'tui')
}

export function isAssistantSessionOpenInTui(session: AssistantSession): boolean {
    return session.threads.some((thread) => hasAssistantTuiPresence(thread.canonicalPresence))
}

/** Explicit service-owned call state, independent of merely attached mobile clients. */
export function assistantMobileVoiceDevice(voice: { deviceName: string } | null | undefined): string | null {
    if (!voice) return null
    return voice.deviceName.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '').trim().slice(0, 96) || 'Android phone'
}
