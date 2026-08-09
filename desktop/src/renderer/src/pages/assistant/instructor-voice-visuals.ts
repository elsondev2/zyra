import type { InstructorRealtimeVoice } from '@shared/assistant/contracts'

export interface InstructorVoiceVisualTheme {
    primary: string
    secondary: string
    highlight: string
    frequency: number
    phase: number
}

export const INSTRUCTOR_VOICE_VISUAL_THEMES = {
    arbor: {
        primary: '#35d39a',
        secondary: '#167a66',
        highlight: '#b9ffe6',
        frequency: 1.7,
        phase: 0.35
    },
    breeze: {
        primary: '#55c7ff',
        secondary: '#3977e8',
        highlight: '#d8f5ff',
        frequency: 2.2,
        phase: 1.15
    },
    cove: {
        primary: '#6c8cff',
        secondary: '#37d5d0',
        highlight: '#e4e9ff',
        frequency: 1.45,
        phase: 2.1
    },
    ember: {
        primary: '#ff795c',
        secondary: '#d63a67',
        highlight: '#ffe0d6',
        frequency: 2.55,
        phase: 0.8
    },
    juniper: {
        primary: '#b776ff',
        secondary: '#6f52e5',
        highlight: '#f0ddff',
        frequency: 1.9,
        phase: 2.75
    },
    maple: {
        primary: '#ffad45',
        secondary: '#d45f45',
        highlight: '#ffe8bd',
        frequency: 1.6,
        phase: 1.65
    },
    sol: {
        primary: '#f4d64e',
        secondary: '#f48736',
        highlight: '#fff7ba',
        frequency: 2.35,
        phase: 0.1
    },
    spruce: {
        primary: '#5bd477',
        secondary: '#1f8f79',
        highlight: '#d7ffdf',
        frequency: 1.35,
        phase: 3.35
    },
    vale: {
        primary: '#8c8dff',
        secondary: '#b65bd8',
        highlight: '#ebe4ff',
        frequency: 2.05,
        phase: 2.35
    }
} as const satisfies Record<InstructorRealtimeVoice, InstructorVoiceVisualTheme>

export function getInstructorVoiceVisualTheme(voice: InstructorRealtimeVoice): InstructorVoiceVisualTheme {
    return INSTRUCTOR_VOICE_VISUAL_THEMES[voice]
}
