import {
    DEFAULT_INSTRUCTOR_REALTIME_VOICE,
    DEFAULT_INSTRUCTOR_VOICE_INSTRUCTIONS,
    INSTRUCTOR_REALTIME_VOICES,
    type AssistantRealtimeVoiceEvent,
    type AssistantSendRealtimeVoiceMessageInput,
    type InstructorRealtimeVoice
} from '../../shared/assistant/contracts'

const MAX_INSTRUCTOR_INSTRUCTIONS_LENGTH = 8_000
const MAX_WEBRTC_SDP_LENGTH = 512_000
const MAX_REALTIME_MESSAGE_LENGTH = 20_000
const MAX_REALTIME_IMAGE_COUNT = 4
const MAX_REALTIME_IMAGE_DATA_URL_LENGTH = 14_000_000
const MAX_REALTIME_IMAGE_DATA_TOTAL_LENGTH = 56_000_000
const REALTIME_IMAGE_DATA_URL = /^data:(image\/(?:png|jpeg|webp|gif));base64,[a-z0-9+/=]+$/i

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function asString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value : null
}

function asTranscriptDelta(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null
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
    return [
        'app-server',
        '--stdio',
        '-c',
        'mcp_servers={}',
        '--disable',
        'plugins',
        '--disable',
        'apps',
        '--enable',
        'realtime_conversation'
    ]
}

export function buildInstructorThreadStartParams(cwd: string, instructions: string) {
    return {
        cwd,
        approvalPolicy: 'never',
        sandbox: 'read-only',
        ephemeral: true,
        developerInstructions: instructions,
        serviceName: 'zyra_desktop'
    } as const
}

function normalizeInstructorRealtimeVoice(value: unknown): InstructorRealtimeVoice {
    return typeof value === 'string'
        && INSTRUCTOR_REALTIME_VOICES.includes(value as InstructorRealtimeVoice)
        ? value as InstructorRealtimeVoice
        : DEFAULT_INSTRUCTOR_REALTIME_VOICE
}

export function buildInstructorRealtimeStartParams(
    threadId: string,
    sdp: string,
    instructions: string,
    options: {
        voice?: unknown
        outputModality?: unknown
        initialItems?: Array<{ role: 'developer' | 'user' | 'assistant'; text: string }>
        clientManagedHandoffs?: boolean
    } = {}
) {
    return {
        threadId,
        // Subscription-backed WebRTC v3 currently requires audio output. Zyra's
        // text-only mode keeps this transport alive and suppresses local playback.
        outputModality: 'audio',
        includeStartupContext: false,
        ...(options.initialItems?.length ? { initialItems: options.initialItems } : {}),
        ...(options.clientManagedHandoffs !== undefined
            ? { clientManagedHandoffs: options.clientManagedHandoffs }
            : {}),
        prompt: instructions,
        version: 'v3',
        voice: normalizeInstructorRealtimeVoice(options.voice),
        codexResponseHandoffMode: 'bemTags',
        delegationAckFiller: false,
        transport: {
            type: 'webrtc',
            sdp
        }
    } as const
}

export function normalizeInstructorRealtimeMessage(input: AssistantSendRealtimeVoiceMessageInput) {
    const text = typeof input?.text === 'string' ? input.text.trim() : ''
    if (text.length > MAX_REALTIME_MESSAGE_LENGTH) {
        throw new Error(`Voice messages must be ${MAX_REALTIME_MESSAGE_LENGTH.toLocaleString()} characters or fewer.`)
    }

    const sourceImages = Array.isArray(input?.images) ? input.images : []
    if (sourceImages.length > MAX_REALTIME_IMAGE_COUNT) {
        throw new Error(`Voice messages support up to ${MAX_REALTIME_IMAGE_COUNT} images.`)
    }

    let totalDataLength = 0
    const images = sourceImages.map((image, index) => {
        const dataUrl = typeof image?.dataUrl === 'string' ? image.dataUrl.trim() : ''
        const match = REALTIME_IMAGE_DATA_URL.exec(dataUrl)
        if (!match || dataUrl.length > MAX_REALTIME_IMAGE_DATA_URL_LENGTH) {
            throw new Error(`Voice image ${index + 1} must be a PNG, JPEG, WebP, or GIF no larger than 10 MB.`)
        }
        const mimeType = match[1].toLowerCase()
        const declaredMimeType = typeof image?.mimeType === 'string' ? image.mimeType.trim().toLowerCase() : ''
        if (declaredMimeType && declaredMimeType !== mimeType) {
            throw new Error(`Voice image ${index + 1} has inconsistent image metadata.`)
        }
        totalDataLength += dataUrl.length
        return {
            name: typeof image?.name === 'string' ? image.name.trim().slice(0, 200) : '',
            mimeType,
            dataUrl
        }
    })

    if (totalDataLength > MAX_REALTIME_IMAGE_DATA_TOTAL_LENGTH) {
        throw new Error('The attached voice images exceed the 40 MB message limit.')
    }
    if (!text && images.length === 0) throw new Error('Type a message or attach an image first.')
    return { text, images }
}

export function buildInstructorRealtimeMessageTurnParams(
    threadId: string,
    input: ReturnType<typeof normalizeInstructorRealtimeMessage>
) {
    const prompt = input.text || `Inspect ${input.images.length === 1 ? 'this image' : 'these images'} and respond to what the user shared.`
    return {
        threadId,
        input: [
            { type: 'text' as const, text: prompt },
            ...input.images.map((image) => ({
                type: 'image' as const,
                url: image.dataUrl,
                detail: 'auto' as const
            }))
        ],
        approvalPolicy: 'never' as const,
        sandboxPolicy: { type: 'readOnly' as const }
    }
}

function realtimeProviderItemId(payload: Record<string, unknown>): string | undefined {
    return asString(payload['itemId'])
        || asString(payload['turnId'])
        || asString(asRecord(payload['item'])?.['id'])
        || undefined
}

export function parseInstructorRealtimeNotification(method: string, payloadValue: unknown): AssistantRealtimeVoiceEvent | null {
    const payload = asRecord(payloadValue) || {}
    const threadId = asString(payload['threadId']) || undefined

    if (method === 'thread/realtime/started') {
        return {
            type: 'session.started',
            threadId,
            realtimeSessionId: asString(payload['realtimeSessionId']) || undefined,
            realtimeVersion: asString(payload['version']) || undefined
        }
    }
    if (method === 'thread/realtime/transcript/delta') {
        const delta = asTranscriptDelta(payload['delta'])
        if (!delta) return null
        const providerItemId = realtimeProviderItemId(payload)
        return {
            type: 'transcript.delta',
            threadId,
            ...(providerItemId ? { providerItemId } : {}),
            role: asString(payload['role']) || 'assistant',
            delta
        }
    }
    if (method === 'thread/realtime/transcript/done') {
        const text = asString(payload['text'])
        if (!text) return null
        const providerItemId = realtimeProviderItemId(payload)
        return {
            type: 'transcript.done',
            threadId,
            ...(providerItemId ? { providerItemId } : {}),
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
