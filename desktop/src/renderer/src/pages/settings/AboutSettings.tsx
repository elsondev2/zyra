import type { ReactNode } from 'react'
import { Download, ExternalLink, Github, RefreshCw, Rocket } from 'lucide-react'
import { getUpdateActionLabel, useAppUpdates } from '@/lib/app-updates'
import {
    SettingsButton,
    SettingsNotice,
    SettingsPageContainer,
    SettingsRow,
    SettingsSection
} from './settings-layout'

export default function AboutSettings() {
    const {
        updateState,
        pendingAction,
        openModal,
        checkForUpdates,
        downloadUpdate,
        installUpdate,
        skippedVersion,
        skipAvailableVersion,
        remindLater,
        clearSkippedVersion
    } = useAppUpdates()

    const busy = pendingAction !== null
    const updateSummary = getUpdateActionLabel(updateState)
    const updateStatus = updateState?.status ?? 'idle'
    const updatesEnabled = updateState?.enabled === true
    const availableVersion = updateState?.availableDisplayVersion || updateState?.availableVersion || null
    const downloadedVersion = updateState?.downloadedDisplayVersion || updateState?.downloadedVersion || null
    const checkedAt = updateState?.checkedAt ? new Date(updateState.checkedAt) : null
    const checkedAtLabel = checkedAt && !Number.isNaN(checkedAt.getTime()) ? `Last checked ${checkedAt.toLocaleString()}` : 'Not checked in this session'

    return (
        <SettingsPageContainer>
            <SettingsSection title="About Zyra">
                <SettingsRow title="Version" description="Installed desktop application version." control={<span className="font-mono text-xs font-medium text-sparkle-text-secondary">{updateState?.currentDisplayVersion || 'v0.5.0'}</span>} />
                <SettingsRow title="Package version" description="Semantic package version for this build." control={<span className="font-mono text-xs text-sparkle-text-secondary">{updateState?.currentVersion || '0.5.0'}</span>} />
                <SettingsRow title="Release channel" description="Update feed selected for this installation." control={<span className="text-xs font-medium capitalize text-sparkle-text-secondary">{updateState?.channel || 'alpha'}</span>} />
                <SettingsRow title="Platform" description="Supported desktop operating system." control={<span className="text-xs font-medium text-sparkle-text-secondary">Windows</span>} />
                <SettingsRow title="Application stack" description="Core desktop and renderer frameworks." control={<span className="text-xs font-medium text-sparkle-text-secondary">Electron · React · TypeScript</span>} />
                <SettingsRow title="License" description="Source-code license used by this project." control={<span className="text-xs font-medium text-sparkle-text-secondary">MIT</span>} />
            </SettingsSection>

            <SettingsSection title="Updates" headerAction={<SettingsButton variant="ghost" onClick={openModal}>Open Update Center</SettingsButton>}>
                {!updateState ? <SettingsNotice>Loading the desktop update service…</SettingsNotice> : null}
                {updateState?.disabledReason ? <SettingsNotice tone="warning">{updateState.disabledReason}</SettingsNotice> : null}
                {updateStatus === 'error' && updateState?.message ? <SettingsNotice tone="error">{updateState.message}</SettingsNotice> : null}
                <SettingsRow title="Update status" description="Current state of the desktop update service." status={checkedAtLabel} control={<span className="text-xs font-medium text-sparkle-text-secondary">{updateSummary}</span>} />
                {availableVersion ? <SettingsRow title="Available version" description="Version currently offered by the configured release channel." control={<span className="font-mono text-xs font-medium text-sparkle-text-secondary">{availableVersion}</span>} /> : null}
                {downloadedVersion ? <SettingsRow title="Downloaded version" description="Update package ready to install after restart." control={<span className="font-mono text-xs font-medium text-sparkle-text-secondary">{downloadedVersion}</span>} /> : null}
                {updateStatus === 'downloading' ? <SettingsRow title="Download progress" description="Signed update package currently being downloaded." control={<span className="font-mono text-xs font-medium text-sparkle-text-secondary">{updateState?.downloadPercent == null ? 'In progress' : `${Math.round(updateState.downloadPercent)}%`}</span>} /> : null}
                {skippedVersion ? <SettingsRow title="Skipped version" description="This version will remain hidden until the skip is cleared." control={<div className="flex items-center gap-2"><span className="font-mono text-xs text-sparkle-text-secondary">{skippedVersion}</span><SettingsButton variant="ghost" onClick={clearSkippedVersion}>Clear skip</SettingsButton></div>} /> : null}
                <SettingsRow
                    title="Update actions"
                    description="Check, download, and install through the signed desktop update flow."
                    control={<div className="flex flex-wrap justify-end gap-1"><SettingsButton onClick={() => { clearSkippedVersion(); void checkForUpdates() }} disabled={busy || !updatesEnabled || updateStatus === 'checking'}><RefreshCw size={12} className={pendingAction === 'check' ? 'animate-spin' : ''} />Check</SettingsButton><SettingsButton onClick={() => void downloadUpdate()} disabled={busy || updateStatus !== 'available'}><Download size={12} />Download</SettingsButton><SettingsButton variant="accent" onClick={() => void installUpdate()} disabled={busy || updateStatus !== 'downloaded'}><Rocket size={12} />Restart to install</SettingsButton></div>}
                />
                {updateStatus === 'available' ? <SettingsRow title="Defer this update" description="Postpone the prompt or skip the offered version." control={<div className="flex gap-1"><SettingsButton variant="ghost" onClick={remindLater}>Remind later</SettingsButton><SettingsButton variant="ghost" onClick={skipAvailableVersion}>Skip version</SettingsButton></div>} /> : null}
            </SettingsSection>

            <SettingsSection title="Links">
                <ExternalRow title="Creator GitHub" description="Profile for the Zyra project creator." href="https://github.com/justelson" icon={<Github size={13} />} />
                <ExternalRow title="Source code" description="Zyra source repository." href="https://github.com/justelson/zyra" icon={<Github size={13} />} />
                <ExternalRow title="Report an issue" description="Open a bug report or feature request." href="https://github.com/justelson/zyra/issues" icon={<ExternalLink size={13} />} />
            </SettingsSection>
        </SettingsPageContainer>
    )
}

function ExternalRow({ title, description, href, icon }: { title: string; description: string; href: string; icon: ReactNode }) {
    return (
        <SettingsRow title={title} description={description} control={<a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--settings-border)] bg-[var(--settings-control)] px-2.5 text-xs font-medium text-sparkle-text-secondary transition-colors hover:bg-[var(--settings-control-hover)] hover:text-sparkle-text">{icon}Open</a>} />
    )
}
