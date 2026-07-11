import type { AssistantInteractionMode, AssistantReasoningEffort, AssistantRuntimeMode } from '@shared/assistant/contracts'
import { isAssistantReasoningEffort } from '@shared/assistant/reasoning-efforts'

export type AssistantComposerPreferenceEffort = AssistantReasoningEffort

export type AssistantComposerPreferences = {
    model?: string
    runtimeMode?: AssistantRuntimeMode
    interactionMode?: AssistantInteractionMode
    effort?: AssistantComposerPreferenceEffort
    fastModeEnabled?: boolean
}

export const COMPOSER_PREFERENCES_STORAGE_KEY = 'devscope:assistant-composer-preferences'
const COMPOSER_PREFERENCES_EVENT = 'devscope:assistant-composer-preferences-updated'

export function readAssistantComposerPreferences(): AssistantComposerPreferences {
    try {
        const raw = localStorage.getItem(COMPOSER_PREFERENCES_STORAGE_KEY)
        if (!raw) return {}
        const parsed = JSON.parse(raw) as {
            model?: unknown
            runtimeMode?: unknown
            interactionMode?: unknown
            effort?: unknown
            fastModeEnabled?: unknown
        }
        return {
            model: typeof parsed.model === 'string' ? parsed.model : undefined,
            runtimeMode: parsed.runtimeMode === 'full-access' || parsed.runtimeMode === 'approval-required' ? parsed.runtimeMode : undefined,
            interactionMode: parsed.interactionMode === 'plan' || parsed.interactionMode === 'default' ? parsed.interactionMode : undefined,
            effort: isAssistantReasoningEffort(parsed.effort) ? parsed.effort : undefined,
            fastModeEnabled: typeof parsed.fastModeEnabled === 'boolean' ? parsed.fastModeEnabled : undefined
        }
    } catch {
        return {}
    }
}

export function writeAssistantComposerPreferences(preferences: AssistantComposerPreferences): void {
    try {
        localStorage.setItem(COMPOSER_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences))
        window.dispatchEvent(new CustomEvent(COMPOSER_PREFERENCES_EVENT, { detail: preferences }))
    } catch {}
}

export function mergeAssistantComposerPreferences(patch: Partial<AssistantComposerPreferences>): AssistantComposerPreferences {
    const next = { ...readAssistantComposerPreferences(), ...patch }
    writeAssistantComposerPreferences(next)
    return next
}

export function subscribeAssistantComposerPreferences(listener: (preferences: AssistantComposerPreferences) => void): () => void {
    const handleEvent = (event: Event) => {
        const detail = (event as CustomEvent<AssistantComposerPreferences | undefined>).detail
        listener(detail || readAssistantComposerPreferences())
    }
    window.addEventListener(COMPOSER_PREFERENCES_EVENT, handleEvent)
    return () => window.removeEventListener(COMPOSER_PREFERENCES_EVENT, handleEvent)
}
