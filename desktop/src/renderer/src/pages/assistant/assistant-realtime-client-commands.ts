import type { AssistantRealtimeVoiceClientCommandEvent } from '@shared/assistant/contracts'

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
