import type { AssistantVoiceExecutionConfiguration } from '@shared/assistant/contracts'

export function buildAssistantVoiceExecutionConfiguration(input: {
    model: string
    runtimeMode: AssistantVoiceExecutionConfiguration['runtimeMode']
    effort: AssistantVoiceExecutionConfiguration['effort']
    interactionMode: AssistantVoiceExecutionConfiguration['interactionMode']
    profile?: string | null
    fastModeEnabled: boolean
}): AssistantVoiceExecutionConfiguration {
    return {
        model: input.model,
        runtimeMode: input.runtimeMode,
        effort: input.effort,
        interactionMode: input.interactionMode,
        profile: input.profile || 'default',
        serviceTier: input.fastModeEnabled ? 'fast' : undefined
    }
}
