import { useNavigate, useSearchParams } from 'react-router-dom'
import { Store } from 'lucide-react'
import { isElectronRendererRuntime } from '@/lib/browser-file-url'
import { useAssistantStoreSelector } from '@/lib/assistant/store'
import type { AssistantSession } from '@shared/assistant/contracts'
import { AssistantPluginDetail } from '../plugins/AssistantPluginDetail'
import { buildAssistantChatRoute } from '../assistant/assistant-chat-route'
import { PluginList } from '../plugins/PluginDirectoryLists'
import { usePluginDirectory } from '../plugins/usePluginDirectory'
import { SettingsButton, SettingsNotice, SettingsPageContainer, SettingsRow, SettingsSection, SettingsSelect, SettingsSwitch } from './settings-layout'
import '../plugins/PluginsPage.css'

export default function PluginsSettings() {
    const navigate = useNavigate()
    const [params, setParams] = useSearchParams()
    const desktopHost = isElectronRendererRuntime()
    const selectedSession = useAssistantStoreSelector((state) => state.snapshot.sessions.find((session) => session.id === state.snapshot.selectedSessionId) || null) as AssistantSession | null
    const directory = usePluginDirectory(desktopHost, selectedSession)
    const { catalog, busy, loading, error, notice } = directory
    const pluginId = params.get('plugin')
    const plugin = catalog?.plugins.find((entry) => entry.id === pluginId)
    const openPlugin = (id: string) => setParams({ plugin: id })
    const useInChat = (id: string) => void directory.useInNewChat(id, (sessionId) => navigate(buildAssistantChatRoute(sessionId, null)))

    if (plugin && catalog) return <AssistantPluginDetail
        inline catalog={catalog} plugin={plugin} projects={directory.projects} selectedSession={selectedSession}
        busy={busy} error={error} notice={notice} onClose={() => setParams({})}
        onUseInChat={() => useInChat(plugin.id)}
        onToggleInstallation={(enabled) => void directory.updatePluginState(plugin.id, enabled)}
        onToggleAppViews={(enabled) => void directory.updateAppViewSettings({ pluginId: plugin.id, enabled })}
        onToggleSet={(id, enabled) => void directory.updatePluginSet(id, plugin.id, enabled)}
        onRefreshChat={() => void directory.refreshCurrentChat()}
        onRollback={(id) => void directory.rollbackPlugin(plugin.id, id)}
    />

    return <SettingsPageContainer title="Plugins">
        {error || notice ? <div role={error ? 'alert' : 'status'}><SettingsNotice tone={error ? 'error' : 'neutral'}>{error || notice}</SettingsNotice></div> : null}
        {catalog ? <SettingsSection title="App views">
            <SettingsRow
                title="Show app views in Chat"
                description="Interactive views offered by enabled Plugin MCP servers."
                control={<SettingsSwitch checked={catalog.appViews.enabled} disabled={busy} label="Show app views in Chat" onCheckedChange={(enabled) => void directory.updateAppViewSettings({ enabled })} />}
            />
            {catalog.appViews.enabled ? <SettingsRow
                title="Open views"
                description="Choose whether a view opens automatically after a Plugin tool runs."
                control={<SettingsSelect aria-label="Open app views" value={catalog.appViews.displayMode} disabled={busy} onChange={(event) => void directory.updateAppViewSettings({ displayMode: event.target.value as 'manual' | 'automatic' })}>
                    <option value="manual">On click</option><option value="automatic">Automatically</option>
                </SettingsSelect>}
            /> : null}
        </SettingsSection> : null}
        <SettingsSection title="Installed plugins" headerAction={<SettingsButton onClick={() => navigate('/plugins')}><Store size={13} />Browse store</SettingsButton>}>
            {!desktopHost ? <p className="px-4 py-4 text-xs leading-5 text-[var(--settings-text-secondary)]">Manage plugins in Zyra Desktop.</p>
                : loading && !catalog ? <p className="px-4 py-4 text-xs leading-5 text-[var(--settings-text-secondary)]" role="status">Loading plugins…</p>
                : pluginId && !plugin ? <p className="px-4 py-4 text-xs leading-5 text-[var(--settings-text-secondary)]" role="alert">That plugin is no longer installed.</p>
                : catalog?.plugins.length ? <div className="plugin-settings-inline px-4"><PluginList plugins={catalog.plugins} catalog={catalog} busy={busy} onSelect={openPlugin} onToggle={(id, enabled) => void directory.updatePluginState(id, enabled)} /></div>
                : <p className="px-4 py-4 text-xs leading-5 text-[var(--settings-text-secondary)]">No plugins installed.</p>}
        </SettingsSection>
    </SettingsPageContainer>
}
