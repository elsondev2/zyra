import {
    DEFAULT_INSTRUCTOR_VOICE_INSTRUCTIONS,
    type AssistantRealtimeVoiceEvent
} from '../../shared/assistant/contracts'

const MAX_INSTRUCTOR_INSTRUCTIONS_LENGTH = 8_000
const MAX_WEBRTC_SDP_LENGTH = 512_000

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function asString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value : null
}

export function normalizeInstructorVoiceInstructions(value: unknown): string {
    const instructions = typeof value === 'string' ? value.trim() : ''
    if (!instructions) return DEFAULT_INSTRUCTOR_VOICE_INSTRUCTIONS
    if (instructions.length > MAX_INSTRUCTOR_INSTRUCTIONS_LENGTH) {
        throw new Error(`Instructor instructions must be ${MAX_INSTRUCTOR_INSTRUCTIONS_LENGTH.toLocaleString()} characters or fewer.`)
    }
    return instructions
}

export function normalizeWebRtcOfferSdp(value: unknown): string {
    const sdp = typeof value === 'string' ? value : ''
    if (!sdp || !sdp.trimStart().startsWith('v=0')) {
        throw new Error('A browser-generated WebRTC offer is required.')
    }
    if (sdp.length > MAX_WEBRTC_SDP_LENGTH) {
        throw new Error('The WebRTC offer is too large.')
    }
    // SDP is a line-oriented wire format. Preserve the browser-generated CRLF terminator;
    // trimming it causes OpenAI's SDP parser to fail with an unexpected EOF.
    return sdp
}

export function buildInstructorAppServerArgs(): string[] {
    return ['app-server', '--enable', 'realtime_conversation']
}

export function buildInstructorThreadStartParams(cwd: string, instructions: string) {
    return {
        cwd,
        approvalPolicy: 'never',
        sandbox: 'read-only',
        ephemeral: true,
        developerInstructions: instructions
    } as const
}

export function buildInstructorRealtimeStartParams(threadId: string, sdp: string, instructions: string) {
    return {
        threadId,
        outputModality: 'audio',
        includeStartupContext: false,
        prompt: instructions,
        version: 'v1',
        transport: {
            type: 'webrtc',
            sdp
        }
    } as const
}

export function parseInstructorRealtimeNotification(method: string, payloadValue: unknown): AssistantRealtimeVoiceEvent | null {
    const payload = asRecord(payloadValue) || {}
    const threadId = asString(payload['threadId']) || undefined

    if (method === 'thread/realtime/started') {
        return {
            type: 'session.started',
            threadId,
            realtimeSessionId: asString(payload['realtimeSessionId']) || undefined
        }
    }
    if (method === 'thread/realtime/transcript/delta') {
        const delta = asString(payload['delta'])
        if (!delta) return null
        return {
            type: 'transcript.delta',
            threadId,
            role: asString(payload['role']) || 'assistant',
            delta
        }
    }
    if (method === 'thread/realtime/transcript/done') {
        const text = asString(payload['text'])
        if (!text) return null
        return {
            type: 'transcript.done',
            threadId,
            role: asString(payload['role']) || 'assistant',
            text
        }
    }
    if (method === 'thread/realtime/error') {
        return {
            type: 'session.error',
            threadId,
            message: asString(payload['message']) || 'Codex realtime voice failed.'
        }
    }
    if (method === 'thread/realtime/closed') {
        return {
            type: 'session.closed',
            threadId,
            reason: asString(payload['reason']) || undefined
        }
    }
    return null
}
