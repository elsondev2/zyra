import type { AssistantRealtimeVoiceEvent, RealtimeDomainEvent } from '../../../shared/assistant/contracts'

/** Preserve provider identities all the way to clients. A delayed old adapter
 * must never be relabeled with the owner or generation of a new call. */
export function canonicalVoicePresentationEvent(event: RealtimeDomainEvent, activeAdapterId: string | null): AssistantRealtimeVoiceEvent | null {
    if (event.adapterSessionId !== activeAdapterId) return null
    const identity = {
        adapterSessionId: event.adapterSessionId,
        realtimeSessionId: event.realtimeSessionId,
        realtimeSessionGeneration: event.realtimeSessionGeneration,
        threadId: event.realtimeProviderThreadId
    }
    if (event.type === 'realtime.session.error') return { ...identity, type: 'session.error', message: event.message }
    if (event.type === 'realtime.session.closed') return { ...identity, type: 'session.closed', reason: event.reason || undefined }
    if (event.type === 'realtime.transcript.suppressed') return { ...identity, type: 'transcript.suppressed', providerItemId: event.providerItemId, role: event.role }
    if (event.type === 'realtime.user.transcript.delta' || event.type === 'realtime.assistant.transcript.delta') {
        return { ...identity, type: 'transcript.delta', providerItemId: event.providerItemId,
            role: event.type.includes('.user.') ? 'user' : 'assistant', delta: event.delta,
            ...(event.transcriptSource ? { transcriptSource: event.transcriptSource } : {}) }
    }
    if (event.type === 'realtime.user.transcript.completed' || event.type === 'realtime.assistant.transcript.completed') {
        return { ...identity, type: 'transcript.done', providerItemId: event.providerItemId,
            role: event.type.includes('.user.') ? 'user' : 'assistant', text: event.text,
            ...(event.transcriptSource ? { transcriptSource: event.transcriptSource } : {}) }
    }
    return null
}
