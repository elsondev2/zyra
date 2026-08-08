import type { InstructorRealtimeVoice } from '@shared/assistant/contracts'
import previewContent from '@/assets/voice-previews/content.json'

export interface InstructorVoicePreviewContent {
    topic: string
    text: string
}

export const INSTRUCTOR_VOICE_PREVIEW_CONTENT = previewContent as Record<
    InstructorRealtimeVoice,
    InstructorVoicePreviewContent
>
