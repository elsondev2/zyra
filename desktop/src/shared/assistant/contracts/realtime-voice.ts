export const DEFAULT_INSTRUCTOR_VOICE_INSTRUCTIONS = `You are my patient, practical instructor.

Teach one clear step at a time. Use plain language and short examples. Ask a brief question when you need to check my understanding or choose the next direction. Adapt to my level without talking down to me. Keep answers concise unless I ask to go deeper.

This is an instructional conversation. Do not edit files, execute commands, or make system changes.`

export interface AssistantStartRealtimeVoiceInput {
    sdp: string
    instructions?: string
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
    }
    | {
        type: 'transcript.delta'
        threadId?: string
        role: string
        delta: string
    }
    | {
        type: 'transcript.done'
        threadId?: string
        role: string
        text: string
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
