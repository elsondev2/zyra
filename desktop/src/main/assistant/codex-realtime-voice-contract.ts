import {
    DEFAULT_INSTRUCTOR_REALTIME_VOICE,
    DEFAULT_INSTRUCTOR_VOICE_INSTRUCTIONS,
    INSTRUCTOR_REALTIME_VOICES,
    type AssistantSendRealtimeVoiceMessageInput,
    type InstructorRealtimeVoice
} from '../../shared/assistant/contracts'

const MAX_INSTRUCTOR_INSTRUCTIONS_LENGTH = 8_000
const MAX_WEBRTC_SDP_LENGTH = 512_000
const MAX_REALTIME_MESSAGE_LENGTH = 20_000
const MAX_REALTIME_IMAGE_COUNT = 4
const MAX_REALTIME_IMAGE_DATA_URL_LENGTH = 14_000_000
const MAX_REALTIME_IMAGE_DATA_TOTAL_LENGTH = 56_000_000
const MAX_FRAMELESS_CONTEXT_CHUNK_BYTES = 500
const REALTIME_IMAGE_DATA_URL = /^data:(image\/(?:png|jpeg|webp|gif));base64,[a-z0-9+/=]+$/i

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
    if (Buffer.byteLength(sdp, 'utf8') > MAX_WEBRTC_SDP_LENGTH) {
        throw new Error('The WebRTC offer is too large.')
    }
    // SDP is a line-oriented wire format. Preserve the browser-generated CRLF
    // terminator; trimming it makes signaling parsers report an unexpected EOF.
    return sdp
}

export function normalizeInstructorRealtimeVoice(value: unknown): InstructorRealtimeVoice {
    return typeof value === 'string'
        && INSTRUCTOR_REALTIME_VOICES.includes(value as InstructorRealtimeVoice)
        ? value as InstructorRealtimeVoice
        : DEFAULT_INSTRUCTOR_REALTIME_VOICE
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

/** Matches the Frameless Bidi 500-byte context append bound in rust-v0.147.0. */
export function chunkFramelessContextText(value: string): string[] {
    const text = String(value || '')
    if (!text) return []
    if (Buffer.byteLength(text, 'utf8') <= MAX_FRAMELESS_CONTEXT_CHUNK_BYTES) return [text]

    const chunks: string[] = []
    let chunk = ''
    let chunkBytes = 0
    for (const character of text) {
        const characterBytes = Buffer.byteLength(character, 'utf8')
        if (chunk && chunkBytes + characterBytes > MAX_FRAMELESS_CONTEXT_CHUNK_BYTES) {
            chunks.push(chunk)
            chunk = ''
            chunkBytes = 0
        }
        chunk += character
        chunkBytes += characterBytes
    }
    if (chunk) chunks.push(chunk)
    return chunks
}
