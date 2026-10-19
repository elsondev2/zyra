import { SettingsProviderIcon } from '../settings/SettingsProviderIcon'
import { resolveAssistantInboxModelPresentation } from './assistant-model-labels'

export function AssistantModelProviderIcon({ model, size = 13 }: { model: string; size?: number }) {
    const { provider } = resolveAssistantInboxModelPresentation(model)
    if (!provider) return null
    const icon = provider === 'anthropic' ? 'claude' : provider === 'google' ? 'gemini' : provider
    return <span role="img" aria-label={`${provider} model provider`} className="inline-flex shrink-0">
        <SettingsProviderIcon provider={icon} size={size} />
    </span>
}
