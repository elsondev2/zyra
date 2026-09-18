import { useOpenAIAccountSettings } from './useOpenAIAccountSettings'
import { ModelProviderConnections } from '../ModelProviderConnections'
import { SettingsPageLink } from '../SettingsPageTabs'
import { SettingsRow, SettingsSection } from '../settings-layout'
import { createSettingsRowTargetId } from '../settings-search'
import { OpenAIConnectionRows } from './OpenAIConnectionRows'

export default function ProviderConnections() {
    const connection = useOpenAIAccountSettings({ connectionsActive: true })
    const { settings } = connection
    return <>
        <ModelProviderConnections onRefresh={connection.refreshAll} refreshDisabled={connection.connectionBusy}
            chatGptConfigured={connection.chatGptConnection?.configured === true}
            openAiConfigured={connection.apiKeyConnection?.configured === true}
            onAddChatGpt={connection.connectChatGpt}
            onAddOpenAiKey={() => connection.setApiKeyDialogOpen(true)}>
            <OpenAIConnectionRows connection={connection} />
        </ModelProviderConnections>
        <SettingsSection title="Model choices">
            <SettingsRow title="New-chat default" description="Existing chats keep their own model."
                searchTargetId={createSettingsRowTargetId('OpenAI connections', 'New-chat default')}
                control={<span className="max-w-64 truncate text-xs text-[var(--settings-text-secondary)]" title={settings.assistantDefaultModel || undefined}>{settings.assistantDefaultModel || 'Provider default'}</span>} />
        </SettingsSection>
        <SettingsSection title="Other uses">
            <SettingsPageLink to="/settings/providers/writing" title="Git writing services" description="Manage Groq and Gemini keys used for commits and pull requests." />
        </SettingsSection>
    </>
}
