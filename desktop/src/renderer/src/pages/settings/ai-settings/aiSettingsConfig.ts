import type { CommitAIProvider } from '@/lib/settings'

export type ProviderStatus = 'idle' | 'testing' | 'success' | 'error'
export type ModelOption = { id: string; label: string; description?: string }

export const PROVIDER_MODELS: Record<CommitAIProvider, string> = {
    groq: 'llama-3.1-8b-instant',
    gemini: 'auto (Gemini Flash)',
    codex: 'custom Codex model'
}

export const PROVIDER_COLORS: Record<CommitAIProvider, { primary: string; bg: string; border: string; icon: string }> = {
    groq: {
        primary: '#F55036',
        bg: 'bg-[#F55036]/10',
        border: 'border-[#F55036]/30',
        icon: 'text-[#F55036]'
    },
    gemini: {
        primary: '#4285F4',
        bg: 'bg-[#4285F4]/10',
        border: 'border-[#4285F4]/30',
        icon: 'text-[#4285F4]'
    },
    codex: {
        primary: '#10B981',
        bg: 'bg-[#10B981]/10',
        border: 'border-[#10B981]/30',
        icon: 'text-[#10B981]'
    }
}
