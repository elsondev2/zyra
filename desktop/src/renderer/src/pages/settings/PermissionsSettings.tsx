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
