import { useEffect, useState } from 'react'
import { ShieldCheck, Trash2 } from 'lucide-react'
import { isElectronRendererRuntime } from '@/lib/browser-file-url'
import { useSettings } from '@/lib/settings'
import {
    clearPersistedAssistantBrowserWorkspaces,
    countPersistedAssistantBrowserWorkspaces
} from '../assistant/assistant-browser-workspace-state'
import {
    clearBrowserControlApprovalPreferences,
    onBrowserControlApprovalPreferencesChange,
    readBrowserControlApprovalPreferences,
    removeBrowserControlApprovalPreference,
    type BrowserControlApprovalPreference
} from '../assistant/assistant-control-approval-preferences'
import {
    SettingsButton,
    SettingsNotice,
    SettingsPageContainer,
    SettingsRow,
    SettingsSection,
    SettingsSwitch
} from './settings-layout'

export default function BrowserControlSettings() {
    const { settings, updateSettings } = useSettings()
    const [approvalPreferences, setApprovalPreferences] = useState<BrowserControlApprovalPreference[]>(() => readBrowserControlApprovalPreferences())
    const [retainedWorkspaceCount, setRetainedWorkspaceCount] = useState(() => countPersistedAssistantBrowserWorkspaces())
    const [status, setStatus] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)
    const integratedBrowserAvailable = isElectronRendererRuntime()

    useEffect(() => onBrowserControlApprovalPreferencesChange(() => {
        setApprovalPreferences(readBrowserControlApprovalPreferences())
    }), [])

    const runMaintenance = async (action: 'cache' | 'cookies' | 'profile') => {
        if (action === 'cookies' && !window.confirm('Clear Browser cookies and signed-in sessions from Zyra’s Browser profile?')) return
        if (action === 'profile' && !window.confirm('Clear Zyra’s complete local Browser profile, including cache, cookies, and site data? This cannot be undone.')) return
        setStatus(null)
        try {
            const result = action === 'cache'
                ? await window.devscope.clearBrowserPreviewCache()
                : action === 'cookies'
                    ? await window.devscope.clearBrowserPreviewCookies()
                    : await window.devscope.clearBrowserPreviewData()
            if (!result.success) throw new Error(result.error || `Failed to clear Browser ${action}.`)
            setStatus({ tone: 'success', message: action === 'profile' ? 'Local Browser profile cleared.' : `Browser ${action} cleared.` })
        } catch (error) {
            setStatus({ tone: 'error', message: error instanceof Error ? error.message : `Failed to clear Browser ${action}.` })
        }
    }

    const clearRetainedWorkspaces = () => {
        if (retainedWorkspaceCount > 0 && !window.confirm(`Clear ${retainedWorkspaceCount} retained Browser workspace${retainedWorkspaceCount === 1 ? '' : 's'}? Open chats and project files are not affected.`)) return
        clearPersistedAssistantBrowserWorkspaces()
        setRetainedWorkspaceCount(0)
        setStatus({ tone: 'success', message: 'Retained Browser workspace layouts cleared.' })
    }

    return (
        <SettingsPageContainer>
            <SettingsSection title="Browser workspace">
                {integratedBrowserAvailable ? (
                    <>
                        <SettingsRow title="Restore Browser tabs" description="Reopen retained Browser tabs when their chat workspace returns." control={<SettingsSwitch checked={settings.assistantBrowserRestoreTabs} onCheckedChange={(assistantBrowserRestoreTabs) => updateSettings({ assistantBrowserRestoreTabs })} label="Restore Browser tabs" />} />
                        <SettingsRow title="Retained workspaces" description="Clear saved Browser tab layouts without deleting chats, captures, or project files." status={`${retainedWorkspaceCount} saved`} statusTone={retainedWorkspaceCount > 0 ? 'info' : 'muted'} control={<SettingsButton variant="ghost" onClick={clearRetainedWorkspaces} disabled={retainedWorkspaceCount === 0}><Trash2 size={12} />Clear layouts</SettingsButton>} />
                        <SettingsRow title="Cache" description="Clear downloaded page resources while keeping Browser cookies and sign-ins." control={<SettingsButton variant="ghost" onClick={() => void runMaintenance('cache')}>Clear cache</SettingsButton>} />
                        <SettingsRow title="Cookies and sign-ins" description="Clear cookies and authenticated Browser sessions after confirmation." control={<SettingsButton variant="ghost" onClick={() => void runMaintenance('cookies')}>Clear cookies</SettingsButton>} />
                        <SettingsRow title="Local Browser profile" description="Remove cache, cookies, permissions, and site data from Zyra’s persistent Browser partition." control={<SettingsButton variant="danger" onClick={() => void runMaintenance('profile')}>Clear profile</SettingsButton>} />
                        {status ? <SettingsNotice tone={status.tone}>{status.message}</SettingsNotice> : null}
                    </>
                ) : (
                    <SettingsNotice>The integrated website preview and its profile controls are available in the Zyra Desktop window.</SettingsNotice>
                )}
            </SettingsSection>

            <SettingsSection title="Remembered Browser control" headerAction={approvalPreferences.length > 0 ? <SettingsButton variant="ghost" onClick={clearBrowserControlApprovalPreferences}>Revoke all</SettingsButton> : undefined}>
                {approvalPreferences.length === 0 ? (
                    <SettingsNotice>No remembered Browser-control approvals.</SettingsNotice>
                ) : approvalPreferences.map((preference) => (
                    <SettingsRow
                        key={`${preference.origin}:${preference.createdAt}`}
                        title={<span className="inline-flex items-center gap-2"><ShieldCheck size={13} className="text-emerald-300" />{preference.origin}</span>}
                        description={`${preference.capabilities.join(', ')} · up to ${preference.maxActions} actions · ${Math.round(preference.durationMs / 1000)}s grants`}
                        control={<SettingsButton variant="ghost" onClick={() => removeBrowserControlApprovalPreference(preference.origin, preference.createdAt)}>Revoke</SettingsButton>}
                    />
                ))}
            </SettingsSection>
        </SettingsPageContainer>
    )
}
