export type RealtimeInputSpeechBoundary = {
    kind: 'started' | 'stopped'
    providerItemId: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null
}

function asText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : ''
}

function providerItemId(payload: Record<string, unknown>): string {
    const turn = asRecord(payload.turn)
    const item = asRecord(payload.item)
    const id = asText(payload.item_id)
        || asText(payload.turn_id)
        || asText(turn?.id)
        || asText(item?.id)
    return id.length <= 512 ? id : ''
}

export function readRealtimeInputSpeechBoundary(value: unknown): RealtimeInputSpeechBoundary | null {
    const payload = asRecord(value)
    const type = asText(payload?.type)
    if (type !== 'input_audio_buffer.speech_started' && type !== 'input_audio_buffer.speech_stopped') return null
    const itemId = payload ? providerItemId(payload) : ''
    if (!itemId) return null
    return {
        kind: type.endsWith('speech_started') ? 'started' : 'stopped',
        providerItemId: itemId
    }
}

export function readCompletedRealtimeUserTranscriptId(value: unknown): string | null {
    const payload = asRecord(value)
    if (!payload) return null
    const type = asText(payload.type)
    const turn = asRecord(payload.turn)
    const item = asRecord(payload.item)
    const explicitRole = asText(turn?.role) || asText(item?.role) || asText(payload.role)
    const isUserCompletion = type.endsWith('.input_audio_transcription.completed')
        || type.endsWith('.input_audio_transcription.done')
        || (type === 'turn.done' && explicitRole === 'user')
    if (!isUserCompletion) return null
    return providerItemId(payload) || null
}

export function buildRecoveredRealtimeUserTranscript(providerItemIdValue: string, transcript: string) {
    const providerItemId = providerItemIdValue.trim()
    const text = transcript.trim()
    if (!providerItemId || providerItemId.length > 512 || !text) return null
    return {
        type: 'zyra.input_audio_transcription.completed',
        item_id: providerItemId,
        role: 'user',
        transcript: text
    }
}
