export const INSTRUCTOR_REALTIME_VOICES = [
    'arbor',
    'breeze',
    'cove',
    'ember',
    'juniper',
    'maple',
    'sol',
    'spruce',
    'vale'
] as const

export type InstructorRealtimeVoice = typeof INSTRUCTOR_REALTIME_VOICES[number]
export type InstructorOutputModality = 'audio' | 'text'

export const DEFAULT_INSTRUCTOR_REALTIME_VOICE: InstructorRealtimeVoice = 'cove'
export const DEFAULT_INSTRUCTOR_OUTPUT_MODALITY: InstructorOutputModality = 'audio'

export const DEFAULT_INSTRUCTOR_VOICE_INSTRUCTIONS = `You are my patient, practical instructor.

Teach one clear step at a time. Use plain language and short examples. Ask a brief question when you need to check my understanding or choose the next direction. Adapt to my level without talking down to me. Keep answers concise unless I ask to go deeper.

This is an instructional conversation. Do not edit files, execute commands, or make system changes.`

export interface AssistantStartRealtimeVoiceInput {
    sdp: string
    instructions?: string
    voice?: InstructorRealtimeVoice
    outputModality?: InstructorOutputModality
}

export interface AssistantRealtimeVoiceImageInput {
    name?: string
    mimeType: string
    dataUrl: string
}

export interface AssistantSendRealtimeVoiceMessageInput {
    text?: string
    images?: AssistantRealtimeVoiceImageInput[]
}

export type AssistantRealtimeVoiceEvent =
    | {
        type: 'session.starting'
        threadId?: string
    }
    | {
        type: 'session.started'
        threadId?: string
        realtimeSessionId?: string
        realtimeVersion?: string
    }
    | {
        type: 'transcript.delta'
        threadId?: string
        providerItemId?: string
        role: string
        delta: string
    }
    | {
        type: 'transcript.done'
        threadId?: string
        providerItemId?: string
        role: string
        text: string
    }
    | {
        type: 'composer.response.delta'
        threadId?: string
        turnId: string
        delta: string
    }
    | {
        type: 'composer.response.done'
        threadId?: string
        turnId: string
        text: string
        error?: string
    }
    | {
        type: 'session.error'
        threadId?: string
        message: string
    }
    | {
        type: 'session.closed'
        threadId?: string
        reason?: string
    }
