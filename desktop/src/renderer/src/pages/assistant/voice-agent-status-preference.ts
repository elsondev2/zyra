export const VOICE_AGENT_STATUS_STORAGE_KEY = 'zyra:voice-agent-status:v1'
export const VOICE_AGENT_STATUS_CHANGED_EVENT = 'zyra:voice-agent-status-changed'

export function readVoiceAgentStatusPreference(): boolean {
    try {
        return globalThis.localStorage?.getItem(VOICE_AGENT_STATUS_STORAGE_KEY) === 'true'
    } catch {
        return false
    }
}

export function writeVoiceAgentStatusPreference(enabled: boolean): void {
    try {
        globalThis.localStorage?.setItem(VOICE_AGENT_STATUS_STORAGE_KEY, String(enabled))
        if (typeof window !== 'undefined') window.dispatchEvent(new Event(VOICE_AGENT_STATUS_CHANGED_EVENT))
    } catch {
        // Presentation settings must not interrupt a voice conversation.
    }
}
