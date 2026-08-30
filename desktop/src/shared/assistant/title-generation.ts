export const DEFAULT_ASSISTANT_TITLE_MODEL = 'openai-codex/gpt-5.6-luna'
export const DEFAULT_ASSISTANT_TITLE_MODEL_LABEL = 'GPT-5.6 Luna'

export const ASSISTANT_TITLE_GENERATION_PROMPT_PREFIX = 'You write concise titles for coding assistant chat sessions.'
export const MIN_ASSISTANT_AUTO_TITLE_TURNS = 3
export const MAX_ASSISTANT_AUTO_TITLE_TURNS = 100
export const DEFAULT_ASSISTANT_AUTO_TITLE_TURNS = 3

export type AssistantTitleAutomationPreferences = {
    enabled: boolean
    turnInterval: number
}

export function normalizeAssistantAutoTitleTurnInterval(value: unknown): number {
    const parsed = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(parsed)) return DEFAULT_ASSISTANT_AUTO_TITLE_TURNS
    return Math.max(MIN_ASSISTANT_AUTO_TITLE_TURNS, Math.min(MAX_ASSISTANT_AUTO_TITLE_TURNS, Math.round(parsed)))
}
const BRIDGE_TITLE_PROMPT_PREFIX = 'write a concise title for this coding-assistant chat.'

export function isAssistantTitleGenerationPrompt(value: string): boolean {
    const prompt = String(value || '').trim().toLowerCase()
    return (
        prompt.startsWith(ASSISTANT_TITLE_GENERATION_PROMPT_PREFIX.toLowerCase())
        && (
            prompt.includes('\nuser request to title:')
            || prompt.includes('\nrecent completed turns:')
            || prompt.includes('\ncompleted conversation:')
        )
    ) || (
        prompt.startsWith(BRIDGE_TITLE_PROMPT_PREFIX)
        && prompt.includes('\nreturn title text only')
    )
}
