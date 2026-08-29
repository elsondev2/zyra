import type { AssistantRealtimeVoiceClientCommandEvent, AssistantRealtimeVoiceEvent } from '@shared/assistant/contracts'

export type RealtimeVoiceClientCommandBinding = {
    adapterSessionId: string
    realtimeSessionId: string
    realtimeSessionGeneration: number
}

type SendableDataChannel = Pick<RTCDataChannel, 'readyState' | 'send'>

const MAX_COMMAND_MESSAGES = 32
const MAX_CONTEXT_CHUNK_BYTES = 500

export function isCurrentRealtimeVoiceClientCommand(
    event: AssistantRealtimeVoiceClientCommandEvent,
    binding: RealtimeVoiceClientCommandBinding | null
): boolean {
    return Boolean(binding
        && event.adapterSessionId === binding.adapterSessionId
        && event.realtimeSessionId === binding.realtimeSessionId
        && event.realtimeSessionGeneration === binding.realtimeSessionGeneration)
}

export function isCurrentRealtimeVoicePresentationEvent(
    event: AssistantRealtimeVoiceEvent,
    binding: RealtimeVoiceClientCommandBinding | null
): boolean {
    if (event.type !== 'composer.response.delta' && event.type !== 'composer.response.done') return false
    return Boolean(binding
        && event.adapterSessionId === binding.adapterSessionId
        && event.realtimeSessionId === binding.realtimeSessionId
        && event.realtimeSessionGeneration === binding.realtimeSessionGeneration)
}

export function normalizeRealtimeVoiceSpeechText(text: string): string {
    return text.normalize('NFKC').toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

export type CanonicalVoiceSpeechReplay = { canonicalMessageId: string; normalizedText: string }

export function consumeCanonicalVoiceSpeechReplay(
    pending: CanonicalVoiceSpeechReplay[],
    text: string
): { canonicalMessageId: string | null; remaining: CanonicalVoiceSpeechReplay[] } {
    const normalizedText = normalizeRealtimeVoiceSpeechText(text)
    const index = pending.findIndex((entry) => entry.normalizedText === normalizedText)
    if (index < 0) return { canonicalMessageId: null, remaining: pending }
    return {
        canonicalMessageId: pending[index]?.canonicalMessageId || null,
        remaining: pending.filter((_, entryIndex) => entryIndex !== index)
    }
}

export function readRealtimeVoiceAssistantCompletion(value: unknown): { providerItemId: string; text: string } | null {
    const payload = value && typeof value === 'object' ? value as Record<string, unknown> : null
    if (payload?.['type'] !== 'turn.done') return null
    const turn = payload['turn'] && typeof payload['turn'] === 'object'
        ? payload['turn'] as Record<string, unknown>
        : null
    const id = typeof turn?.['id'] === 'string' ? turn['id'].trim() : ''
    const role = String(turn?.['role'] || payload?.['role'] || '')
    const text = typeof turn?.['transcript'] === 'string' ? turn['transcript'].trim() : ''
    return role === 'assistant' && id && text
        ? { providerItemId: id.slice(0, 512), text }
        : null
}

export function readRealtimeVoiceProviderItemId(value: unknown): string | null {
    const payload = value && typeof value === 'object' ? value as Record<string, unknown> : null
    const turn = payload?.['turn'] && typeof payload['turn'] === 'object'
        ? payload['turn'] as Record<string, unknown>
        : null
    const item = payload?.['item'] && typeof payload['item'] === 'object'
        ? payload['item'] as Record<string, unknown>
        : null
    const valueId = turn?.['id'] || item?.['id'] || payload?.['turn_id'] || payload?.['item_id']
    const id = typeof valueId === 'string' ? valueId.trim() : ''
    return id ? id.slice(0, 512) : null
}

export function readRealtimeVoiceResponseActivity(value: unknown): 'started' | 'finished' | null {
    const payload = value && typeof value === 'object' ? value as Record<string, unknown> : null
    const type = typeof payload?.['type'] === 'string' ? payload['type'] : ''
    const turn = payload?.['turn'] && typeof payload['turn'] === 'object'
        ? payload['turn'] as Record<string, unknown>
        : null
    const item = payload?.['item'] && typeof payload['item'] === 'object'
        ? payload['item'] as Record<string, unknown>
        : null
    const role = String(turn?.['role'] || item?.['role'] || payload?.['role'] || '')

    if (type === 'input_audio_buffer.speech_started'
        || type === 'response.created'
        || type === 'output_transcript.added'
        || (type === 'turn.created' && role === 'assistant')) return 'started'
    if (type === 'response.done'
        || type === 'output_audio.done'
        || (type === 'turn.done' && role === 'assistant')) return 'finished'
    return null
}

export function sendRealtimeVoiceClientCommand(
    channel: SendableDataChannel | null,
    event: AssistantRealtimeVoiceClientCommandEvent,
    binding: RealtimeVoiceClientCommandBinding | null
): boolean {
    if (!channel || channel.readyState !== 'open' || !isCurrentRealtimeVoiceClientCommand(event, binding)) return false
    if (!isValidClientCommand(event)) return false
    for (const message of event.messages) channel.send(JSON.stringify(message))
    return true
}

function isValidClientCommand(event: AssistantRealtimeVoiceClientCommandEvent): boolean {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,511}$/.test(event.commandId)) return false
    if (event.canonicalMessageId !== undefined
        && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,511}$/.test(event.canonicalMessageId)) return false
    if (!Number.isSafeInteger(event.realtimeSessionGeneration) || event.realtimeSessionGeneration < 1) return false
    if (!Array.isArray(event.messages) || event.messages.length === 0 || event.messages.length > MAX_COMMAND_MESSAGES) return false
    return event.messages.every((message) => {
        if (message.type === 'session.close') return true
        if (message.type !== 'session.context.append'
            || (message.channel !== 'speakable' && message.channel !== 'commentary')
            || !Array.isArray(message.content)
            || message.content.length !== 1) return false
        const content = message.content[0]
        return content?.type === 'input_text'
            && typeof content.text === 'string'
            && content.text.length > 0
            && new TextEncoder().encode(content.text).byteLength <= MAX_CONTEXT_CHUNK_BYTES
    })
}
