import { useEffect, useState } from 'react'
import { useSettings } from '@/lib/settings'
import {
    SettingsButton,
    SettingsPageContainer,
    SettingsRow,
    SettingsSection,
    SettingsSwitch
} from './settings/settings-layout'

export default function GeneralSettings() {
    const { settings, updateSettings, clearCache } = useSettings()
    const [startupStatus, setStartupStatus] = useState<string | null>(null)

    useEffect(() => {
        let mounted = true
        void window.devscope.getStartupSettings().then((result) => {
            if (!mounted || !result.success) return
            const payload = result as typeof result & {
                settings?: { openAtLogin?: boolean; openAsHidden?: boolean }
                openAtLogin?: boolean
                openAsHidden?: boolean
            }
            const startup = payload.settings ?? payload
            updateSettings({ startWithWindows: startup.openAtLogin === true, startMinimized: startup.openAsHidden === true })
        }).catch(() => {})
        return () => { mounted = false }
    }, [updateSettings])

    const setStartup = async (openAtLogin: boolean, openAsHidden: boolean) => {
        try {
            const result = await window.devscope.setStartupSettings({ openAtLogin, openAsHidden })
            if (!result.success) throw new Error(result.error || 'Startup update failed.')
            updateSettings({ startWithWindows: openAtLogin, startMinimized: openAsHidden })
            setStartupStatus('Saved')
        } catch (error) {
            setStartupStatus(error instanceof Error ? error.message : 'Startup update failed.')
        }
        window.setTimeout(() => setStartupStatus(null), 3000)
    }

    return (
        <SettingsPageContainer>
            <SettingsSection title="Desktop">
                <SettingsRow
                    title="Open at login"
                    description="Launch Zyra automatically when Windows starts."
                    status={startupStatus === 'Saved' ? 'Saved' : startupStatus ? 'Not saved' : null}
                    statusTone={startupStatus === 'Saved' ? 'ready' : 'danger'}
                    statusTitle={startupStatus && startupStatus !== 'Saved' ? startupStatus : undefined}
                    control={<SettingsSwitch checked={settings.startWithWindows} onCheckedChange={(checked) => void setStartup(checked, checked ? settings.startMinimized : false)} label="Open Zyra at login" />}
                />
                {settings.startWithWindows ? <SettingsRow title="Start hidden" description="Keep the window in the tray when Zyra opens at login." control={<SettingsSwitch checked={settings.startMinimized} onCheckedChange={(checked) => void setStartup(true, checked)} label="Start Zyra hidden" />} /> : null}
                <SettingsRow title="Chat rail" description="Keep the conversation sidebar collapsed across restarts." control={<SettingsSwitch checked={settings.sidebarCollapsed} onCheckedChange={(sidebarCollapsed) => updateSettings({ sidebarCollapsed })} label="Collapse chat rail" />} />
                <SettingsRow title="Agent Inbox sidebar" description="Use one flat chat list in creation order. Active work renders as rich cards; settled chats collapse to compact rows. Switch back any time." control={<SettingsSwitch checked={settings.assistantAgentInboxSidebarEnabled} onCheckedChange={(assistantAgentInboxSidebarEnabled) => updateSettings({ assistantAgentInboxSidebarEnabled })} label="Use Agent Inbox sidebar" />} />
            </SettingsSection>

            <SettingsSection title="Local maintenance">
                <SettingsRow title="Cached UI data" description="Clear non-setting renderer caches. Canonical transcripts, retained workspaces, settings, and project files are preserved." control={<SettingsButton onClick={clearCache}>Clear cache</SettingsButton>} />
            </SettingsSection>
        </SettingsPageContainer>
    )
}
