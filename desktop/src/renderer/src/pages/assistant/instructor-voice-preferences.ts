import {
    DEFAULT_INSTRUCTOR_OUTPUT_MODALITY,
    DEFAULT_INSTRUCTOR_REALTIME_VOICE,
    DEFAULT_INSTRUCTOR_VOICE_INSTRUCTIONS,
    INSTRUCTOR_REALTIME_VOICES,
    type InstructorOutputModality,
    type InstructorRealtimeVoice
} from '@shared/assistant/contracts'

export const INSTRUCTOR_VOICE_PREFERENCES_STORAGE_KEY = 'zyra:instructor-voice-preferences:v1'

export interface InstructorVoicePreferences {
    instructions: string
    voice: InstructorRealtimeVoice
    outputModality: InstructorOutputModality
}

export const DEFAULT_INSTRUCTOR_VOICE_PREFERENCES: InstructorVoicePreferences = {
    instructions: DEFAULT_INSTRUCTOR_VOICE_INSTRUCTIONS,
    voice: DEFAULT_INSTRUCTOR_REALTIME_VOICE,
    outputModality: DEFAULT_INSTRUCTOR_OUTPUT_MODALITY
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function isRealtimeVoice(value: unknown): value is InstructorRealtimeVoice {
    return typeof value === 'string'
        && INSTRUCTOR_REALTIME_VOICES.includes(value as InstructorRealtimeVoice)
}

function isOutputModality(value: unknown): value is InstructorOutputModality {
    return value === 'audio' || value === 'text'
}

export function normalizeInstructorVoicePreferences(value: unknown): InstructorVoicePreferences {
    const record = asRecord(value)
    return {
        instructions: typeof record?.instructions === 'string'
            ? record.instructions.slice(0, 8_000)
            : DEFAULT_INSTRUCTOR_VOICE_INSTRUCTIONS,
        voice: isRealtimeVoice(record?.voice)
            ? record.voice
            : DEFAULT_INSTRUCTOR_REALTIME_VOICE,
        outputModality: isOutputModality(record?.outputModality)
            ? record.outputModality
            : DEFAULT_INSTRUCTOR_OUTPUT_MODALITY
    }
}

export function shouldPlayInstructorAudio(outputModality: InstructorOutputModality): boolean {
    return outputModality === 'audio'
}

export function readInstructorVoicePreferences(): InstructorVoicePreferences {
    try {
        const stored = globalThis.localStorage?.getItem(INSTRUCTOR_VOICE_PREFERENCES_STORAGE_KEY)
        if (!stored) return { ...DEFAULT_INSTRUCTOR_VOICE_PREFERENCES }
        return normalizeInstructorVoicePreferences(JSON.parse(stored))
    } catch {
        return { ...DEFAULT_INSTRUCTOR_VOICE_PREFERENCES }
    }
}

export function writeInstructorVoicePreferences(preferences: InstructorVoicePreferences): void {
    try {
        globalThis.localStorage?.setItem(
            INSTRUCTOR_VOICE_PREFERENCES_STORAGE_KEY,
            JSON.stringify(normalizeInstructorVoicePreferences(preferences))
        )
    } catch {
        // Keep Voice Lab usable when device storage is unavailable.
    }
}
