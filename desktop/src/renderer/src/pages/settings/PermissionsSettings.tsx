import type { AssistantRuntimeMode } from '@shared/assistant/contracts'
import { useSettings } from '@/lib/settings'
import {
    SettingsRow,
    SettingsSection,
    SettingsSelect
} from './settings-layout'

export function ChatAccessSettings() {
    const { settings, updateSettings } = useSettings()
    const webDefaultMode = settings.assistantDefaultWebSearch
        ? settings.assistantDefaultWebFetch ? 'all' : 'search'
        : settings.assistantDefaultWebFetch ? 'fetch' : 'off'

    const setWebDefaultMode = (mode: 'all' | 'search' | 'fetch' | 'off') => updateSettings({
        assistantDefaultWebSearch: mode === 'all' || mode === 'search',
        assistantDefaultWebFetch: mode === 'all' || mode === 'fetch'
    })

    return (
            <SettingsSection title="Tools & approvals" searchSection="Assistant defaults">
                <SettingsRow
                    title="Permission mode"
                    description="Set the approval rules used when a new chat starts."
                    info="Applies to chat tools, the Browser, paired Chrome and computer use."
                    control={(
                        <SettingsSelect
                            value={settings.assistantDefaultRuntimeMode}
                            onChange={(event) => updateSettings({ assistantDefaultRuntimeMode: event.target.value as AssistantRuntimeMode })}
                            aria-label="Default permission mode"
                        >
                            <option value="approval-required">Supervised</option>
                            <option value="auto-review">Auto review</option>
                            <option value="edits-only">Edits only</option>
                            <option value="full-access">Full access</option>
                        </SettingsSelect>
                    )}
                />
                <SettingsRow
                    title="Web access"
                    description="Choose the web tools available to new chats."
                    info="Existing chats keep their own choice."
                    control={(
                        <SettingsSelect value={webDefaultMode} onChange={(event) => setWebDefaultMode(event.target.value as typeof webDefaultMode)} aria-label="Default web access">
                            <option value="all">Search + fetch</option>
                            <option value="search">Search only</option>
                            <option value="fetch">Fetch only</option>
                            <option value="off">Off</option>
                        </SettingsSelect>
                    )}
                />
            </SettingsSection>
    )
}

export default ChatAccessSettings
