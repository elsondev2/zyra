import { useEffect, useRef } from 'react'
import { useOpenAIAccountSettings } from './useOpenAIAccountSettings'
import { ModelProviderConnections } from '../ModelProviderConnections'
import { SettingsPageLink } from '../SettingsPageTabs'
import { SettingsSection } from '../settings-layout'
import { OpenAIConnectionRows } from './OpenAIConnectionRows'

export default function ProviderConnections() {
    const connection = useOpenAIAccountSettings({ connectionsActive: true })
    const returnToProviderOptions = useRef<(() => void) | null>(null)
    useEffect(() => {
        if (!connection.apiKeyDialogOpen) returnToProviderOptions.current = null
    }, [connection.apiKeyDialogOpen])

    return <>
        <ModelProviderConnections onRefresh={connection.refreshAll} refreshDisabled={connection.connectionBusy}
            chatGptConfigured={connection.chatGptConnection?.configured === true}
            openAiConfigured={connection.apiKeyConnection?.configured === true}
            onAddChatGpt={connection.connectChatGpt}
            onAddOpenAiKey={onBackToProviders => {
                returnToProviderOptions.current = onBackToProviders
                connection.setApiKeyDialogOpen(true)
            }}>
            <OpenAIConnectionRows connection={connection} onBackToProviders={() => {
                const returnToProviders = returnToProviderOptions.current
                returnToProviderOptions.current = null
                returnToProviders?.()
            }} />
        </ModelProviderConnections>
        <SettingsSection title="Other uses">
            <SettingsPageLink to="/settings/providers/writing" title="Git writing services" description="Manage Groq and Gemini keys used for commits and pull requests." />
        </SettingsSection>
    </>
}
