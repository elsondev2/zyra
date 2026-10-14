import { useSyncExternalStore } from 'react'
import { VOICE_AGENT_STATUS_CHANGED_EVENT, VOICE_AGENT_STATUS_STORAGE_KEY, readVoiceAgentStatusPreference } from './voice-agent-status-preference'

function subscribe(onChange: () => void): () => void {
    const onStorage = (event: StorageEvent) => {
        if (event.key === VOICE_AGENT_STATUS_STORAGE_KEY || event.key === null) onChange()
    }
    window.addEventListener(VOICE_AGENT_STATUS_CHANGED_EVENT, onChange)
    window.addEventListener('storage', onStorage)
    return () => {
        window.removeEventListener(VOICE_AGENT_STATUS_CHANGED_EVENT, onChange)
        window.removeEventListener('storage', onStorage)
    }
}

export function useVoiceAgentStatusPreference(): boolean {
    return useSyncExternalStore(subscribe, readVoiceAgentStatusPreference, () => false)
}
