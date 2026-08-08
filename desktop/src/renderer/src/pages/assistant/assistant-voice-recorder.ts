import type { AssistantTranscribeVoiceInput } from '@shared/assistant/contracts'

export const ASSISTANT_VOICE_SAMPLE_RATE_HZ = 24_000
export const ASSISTANT_VOICE_MAX_DURATION_MS = 120_000
export const ASSISTANT_VOICE_MAX_WAVEFORM_SAMPLES = 160

const ASSISTANT_VOICE_WAVEFORM_NOISE_FLOOR_RMS = 0.001
const ASSISTANT_VOICE_WAVEFORM_GAIN = 4

export function normalizeAssistantVoiceWaveformLevel(rawRms: number): number {
    if (!Number.isFinite(rawRms) || rawRms <= ASSISTANT_VOICE_WAVEFORM_NOISE_FLOOR_RMS) return 0
    const signalAboveNoise = rawRms - ASSISTANT_VOICE_WAVEFORM_NOISE_FLOOR_RMS
    return Math.min(1, Math.sqrt(signalAboveNoise) * ASSISTANT_VOICE_WAVEFORM_GAIN)
}

export function formatAssistantVoiceDuration(durationMs: number): string {
    const totalSeconds = Math.max(0, Math.floor(durationMs / 1000))
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function mergeAssistantVoiceChunks(chunks: readonly Float32Array[]): Float32Array {
    let totalLength = 0
    for (const chunk of chunks) totalLength += chunk.length
    const merged = new Float32Array(totalLength)
    let offset = 0
    for (const chunk of chunks) {
        merged.set(chunk, offset)
        offset += chunk.length
    }
    return merged
}

export function resampleAssistantVoice(
    samples: Float32Array,
    inputSampleRateHz: number,
    outputSampleRateHz = ASSISTANT_VOICE_SAMPLE_RATE_HZ
): Float32Array {
    if (!Number.isFinite(inputSampleRateHz) || inputSampleRateHz <= 0 || samples.length === 0) {
        return new Float32Array(0)
    }
    if (inputSampleRateHz === outputSampleRateHz) return samples.slice()

    const ratio = inputSampleRateHz / outputSampleRateHz
    const outputLength = Math.max(1, Math.round(samples.length / ratio))
    const output = new Float32Array(outputLength)
    for (let index = 0; index < outputLength; index += 1) {
        const sourceIndex = index * ratio
        const leftIndex = Math.floor(sourceIndex)
        const rightIndex = Math.min(samples.length - 1, leftIndex + 1)
        const weight = sourceIndex - leftIndex
        const left = samples[leftIndex] ?? 0
        const right = samples[rightIndex] ?? left
        output[index] = left + (right - left) * weight
    }
    return output
}

export function encodeAssistantVoiceWav(samples: Float32Array, sampleRateHz = ASSISTANT_VOICE_SAMPLE_RATE_HZ): ArrayBuffer {
    const view = new DataView(new ArrayBuffer(44 + samples.length * 2))
    const writeAscii = (offset: number, value: string) => {
        for (let index = 0; index < value.length; index += 1) {
            view.setUint8(offset + index, value.charCodeAt(index))
        }
    }

    writeAscii(0, 'RIFF')
    view.setUint32(4, 36 + samples.length * 2, true)
    writeAscii(8, 'WAVE')
    writeAscii(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, 1, true)
    view.setUint32(24, sampleRateHz, true)
    view.setUint32(28, sampleRateHz * 2, true)
    view.setUint16(32, 2, true)
    view.setUint16(34, 16, true)
    writeAscii(36, 'data')
    view.setUint32(40, samples.length * 2, true)

    let offset = 44
    for (const sample of samples) {
        const clamped = Math.max(-1, Math.min(1, sample))
        const pcm = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
        view.setInt16(offset, Math.round(pcm), true)
        offset += 2
    }
    return view.buffer
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    const chunkSize = 0x8000
    let binary = ''
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize)))
    }
    return window.btoa(binary)
}

export function createAssistantVoicePayload(
    chunks: readonly Float32Array[],
    inputSampleRateHz: number
): AssistantTranscribeVoiceInput | null {
    const merged = mergeAssistantVoiceChunks(chunks)
    const resampled = resampleAssistantVoice(merged, inputSampleRateHz)
    if (resampled.length === 0) return null

    const wav = encodeAssistantVoiceWav(resampled)
    return {
        audioBase64: arrayBufferToBase64(wav),
        mimeType: 'audio/wav',
        sampleRateHz: ASSISTANT_VOICE_SAMPLE_RATE_HZ,
        durationMs: Math.max(1, Math.round((resampled.length / ASSISTANT_VOICE_SAMPLE_RATE_HZ) * 1000))
    }
}

export function describeAssistantMicrophoneError(error: unknown): string {
    const name = error instanceof DOMException
        ? error.name
        : typeof error === 'object' && error !== null && 'name' in error
            ? String((error as { name?: unknown }).name || '')
            : ''

    if (name === 'NotAllowedError' || name === 'SecurityError') {
        return 'Microphone permission was denied. Allow microphone access for Zyra and try again.'
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        return 'No microphone was found.'
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
        return 'The microphone is unavailable or already in use.'
    }
    if (name === 'AbortError') {
        return 'Microphone capture was interrupted.'
    }
    return 'Could not start microphone recording.'
}
