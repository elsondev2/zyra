import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, FolderPlus, RefreshCw, Trash2 } from 'lucide-react'
import type {
    AssistantSkillConflict,
    AssistantSkillSourceOverviewPayload,
    AssistantSkillSourceSettings,
    AssistantSkillSourceSummary
} from '@shared/assistant/contracts'
import { isElectronRendererRuntime } from '@/lib/browser-file-url'
import { useAssistantStoreSelector } from '@/lib/assistant/store'
import { markAssistantSkillSourcesChanged } from '@/lib/assistant/assistant-skill-source-revision'
import { registerSettingsCacheClearer } from '@/lib/settings-cache-registry'
import {
    SettingsButton,
    SettingsDialog,
    SettingsNotice,
    SettingsPageContainer,
    SettingsRow,
    SettingsSection,
    SettingsSelect,
    SettingsSwitch
} from './settings-layout'
import { createSettingsRowTargetId } from './settings-search'
import { SettingsProviderIcon } from './SettingsProviderIcon'

let cachedOverview: AssistantSkillSourceOverviewPayload | null = null
let cachedOverviewAt = 0
let cachedOverviewProjectKey = ''

registerSettingsCacheClearer('settings-skills', () => {
    cachedOverview = null
    cachedOverviewAt = 0
    cachedOverviewProjectKey = ''
})

function projectCacheKey(projectPath?: string | null): string {
    return projectPath?.trim() || '<global>'
}

function isOverviewFresh(projectPath?: string | null): boolean {
    return Boolean(
        cachedOverview
        && cachedOverviewProjectKey === projectCacheKey(projectPath)
        && Date.now() - cachedOverviewAt < 30_000
    )
}

function sourceStatus(source: AssistantSkillSourceSummary): string {
    if (!source.detected) return 'Not found'
    return `${source.skillCount} ${source.skillCount === 1 ? 'skill' : 'skills'}`
}

function sourceStatusTone(source: AssistantSkillSourceSummary): 'ready' | 'muted' | 'warning' {
    if (!source.detected) return source.enabled ? 'warning' : 'muted'
    return source.enabled ? 'ready' : 'muted'
}

function sourceScopeSummary(source: AssistantSkillSourceSummary): string {
    if (source.custom) return 'Folder you added.'
    const scopes = new Set(source.paths.map((entry) => entry.scope))
    if (scopes.has('project') && scopes.has('personal')) return 'Personal and current-project folders.'
    if (scopes.has('project')) return 'Current-project folder.'
    return 'Personal folder.'
}

function folderLabel(folderPath: string): string {
    return folderPath.split(/[\\/]/).filter(Boolean).at(-1) || 'Skill folder'
}

function nextPriority(priority: string[], sourceId: string, direction: -1 | 1): string[] {
    const current = priority.indexOf(sourceId)
    const destination = current + direction
    if (current < 0 || destination < 0 || destination >= priority.length) return priority
    const result = [...priority]
    const [source] = result.splice(current, 1)
    result.splice(destination, 0, source)
    return result
}

function updateConflictPreference(
    settings: AssistantSkillSourceSettings,
    conflict: AssistantSkillConflict,
    sourceId: string
): AssistantSkillSourceSettings {
    const preferredSourceBySkill = { ...settings.preferredSourceBySkill }
    if (sourceId === 'auto') delete preferredSourceBySkill[conflict.name]
    else preferredSourceBySkill[conflict.name] = sourceId
    return { ...settings, preferredSourceBySkill }
}

function SkillSettingsContainer({ embedded, children }: { embedded: boolean; children: ReactNode }) {
    return embedded ? <div className="plugin-source-settings">{children}</div> : (
        <SettingsPageContainer title="Skills" backTo="/settings/assistant" backLabel="Assistant">{children}</SettingsPageContainer>
    )
}

export default function SkillsSettings({ embedded = false, onSaved }: { embedded?: boolean; onSaved?: () => void }) {
    const desktopHost = isElectronRendererRuntime()
    const selectedProjectPath = useAssistantStoreSelector((state) => {
        const selected = state.snapshot.sessions.find((session) => session.id === state.snapshot.selectedSessionId)
        return selected?.projectPath || null
    })
    const [overview, setOverview] = useState<AssistantSkillSourceOverviewPayload | null>(() => (
        isOverviewFresh(selectedProjectPath) ? cachedOverview : null
    ))
    const [loading, setLoading] = useState(() => !isOverviewFresh(selectedProjectPath))
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [conflictsOpen, setConflictsOpen] = useState(false)

    const loadOverview = useCallback(async () => {
        if (!desktopHost) return
        setLoading(true)
        setError(null)
        if (!isOverviewFresh(selectedProjectPath)) setOverview(null)
        try {
            const result = await window.devscope.assistant.getSkillSourceOverview(selectedProjectPath)
            if (!result.success) throw new Error(result.error || 'Could not inspect skill sources.')
            cachedOverview = result
            cachedOverviewAt = Date.now()
            cachedOverviewProjectKey = projectCacheKey(selectedProjectPath)
            setOverview(result)
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not inspect skill sources.')
        } finally {
            setLoading(false)
        }
    }, [desktopHost, selectedProjectPath])

    useEffect(() => {
        if (!overview || !isOverviewFresh(selectedProjectPath)) void loadOverview()
    }, [loadOverview, overview, selectedProjectPath])

    const persist = useCallback(async (settings: AssistantSkillSourceSettings) => {
        if (saving) return
        setSaving(true)
        setError(null)
        try {
            const result = await window.devscope.assistant.updateSkillSourceSettings(settings, selectedProjectPath)
            if (!result.success) throw new Error(result.error || 'Could not save skill sources.')
            cachedOverview = result
            cachedOverviewAt = Date.now()
            cachedOverviewProjectKey = projectCacheKey(selectedProjectPath)
            markAssistantSkillSourcesChanged()
            setOverview(result)
            onSaved?.()
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not save skill sources.')
        } finally {
            setSaving(false)
        }
    }, [onSaved, saving, selectedProjectPath])

    const toggleSource = useCallback((sourceId: string, enabled: boolean) => {
        if (!overview) return
        const enabledSourceIds = enabled
            ? [...overview.settings.enabledSourceIds.filter((id) => id !== sourceId), sourceId]
            : overview.settings.enabledSourceIds.filter((id) => id !== sourceId)
        const preferredSourceBySkill = Object.fromEntries(
            Object.entries(overview.settings.preferredSourceBySkill)
                .filter(([, preferredSourceId]) => enabled || preferredSourceId !== sourceId)
        )
        void persist({ ...overview.settings, enabledSourceIds, preferredSourceBySkill })
    }, [overview, persist])

    const moveSource = useCallback((sourceId: string, direction: -1 | 1) => {
        if (!overview) return
        void persist({
            ...overview.settings,
            priority: nextPriority(overview.settings.priority, sourceId, direction)
        })
    }, [overview, persist])

    const addFolder = useCallback(async () => {
        if (!overview || saving) return
        const selected = await window.devscope.selectFolder()
        if (!selected.success || !selected.folderPath) return
        const exists = overview.settings.customSources.some((source) => (
            source.path.localeCompare(selected.folderPath!, undefined, { sensitivity: 'accent' }) === 0
        ))
        if (exists) {
            setError('That skill folder is already listed.')
            return
        }
        void persist({
            ...overview.settings,
            customSources: [...overview.settings.customSources, {
                id: '',
                label: folderLabel(selected.folderPath),
                path: selected.folderPath,
                enableOnAdd: true
            }]
        })
    }, [overview, persist, saving])

    const removeFolder = useCallback((sourceId: string) => {
        if (!overview) return
        void persist({
            ...overview.settings,
            enabledSourceIds: overview.settings.enabledSourceIds.filter((id) => id !== sourceId),
            priority: overview.settings.priority.filter((id) => id !== sourceId),
            preferredSourceBySkill: Object.fromEntries(
                Object.entries(overview.settings.preferredSourceBySkill)
                    .filter(([, preferredSourceId]) => preferredSourceId !== sourceId)
            ),
            customSources: overview.settings.customSources.filter((source) => source.id !== sourceId)
        })
    }, [overview, persist])

    const conflicts = overview?.conflicts || []
    const enabledCount = useMemo(() => (
        overview?.sources.filter((source) => source.enabled).length || 0
    ), [overview?.sources])

    if (!desktopHost) {
        return (
            <SettingsPageContainer title="Skills" backTo="/settings/assistant" backLabel="Assistant">
                <SettingsSection title="Skill sources">
                    <SettingsNotice>Open Zyra Desktop to manage local skill folders.</SettingsNotice>
                </SettingsSection>
            </SettingsPageContainer>
        )
    }

    return (
        <SkillSettingsContainer embedded={embedded}>
            <SettingsSection
                title="Skill sources"
                headerAction={(
                    <div className="flex items-center gap-1">
                        <SettingsButton variant="ghost" onClick={() => void loadOverview()} disabled={loading || saving} aria-label="Refresh skill sources" title="Refresh">
                            <RefreshCw size={13} className={loading ? 'animate-spin' : undefined} />
                        </SettingsButton>
                        <SettingsButton onClick={() => void addFolder()} disabled={!overview || saving}>
                            <FolderPlus size={13} /> Add folder
                        </SettingsButton>
                    </div>
                )}
            >
                <SettingsRow
                    title="Resolution order"
                    description="Higher sources win when skill names overlap."
                    info="Sources are checked from top to bottom. Project skills still win over personal skills. Changes apply to new chats; run /reload in an existing chat."
                    status={overview ? saving ? 'Saving' : `${enabledCount} enabled` : loading ? 'Checking' : undefined}
                    statusTone="info"
                />
                {overview?.sources.map((source, index) => (
                    <SettingsRow
                        key={source.id}
                        searchTargetId={createSettingsRowTargetId('Skill sources', source.label)}
                        title={<span className="inline-flex min-w-0 items-center gap-2">
                            <span aria-label={`Priority ${source.priority + 1}`} className="inline-flex size-5 shrink-0 items-center justify-center rounded bg-[var(--settings-control)] font-mono text-[10px] text-[var(--settings-text-muted)]">{source.priority + 1}</span>
                            <span className="truncate">{source.label}</span>
                        </span>}
                        description={sourceScopeSummary(source)}
                        icon={<SettingsProviderIcon provider={source.id} />}
                        info={<div className="space-y-2">{source.paths.length ? source.paths.map(entry => <div key={`${entry.scope}:${entry.path}`}>
                            <span className="block font-medium capitalize text-[var(--settings-text)]">{entry.scope}</span>
                            <code className="break-all text-[11px]">{entry.path}</code>
                        </div>) : <p>No folders were found for this source.</p>}</div>}
                        status={sourceStatus(source)}
                        statusTone={sourceStatusTone(source)}
                        className="py-2.5"
                        control={(
                            <div className="flex items-center gap-1">
                                {source.enabled ? (<><SettingsButton variant="ghost" className="!size-7 !px-0" aria-label={`Move ${source.label} up`} title="Move up" disabled={saving || index === 0} onClick={() => moveSource(source.id, -1)}>
                                    <ChevronUp size={13} />
                                </SettingsButton>
                                <SettingsButton variant="ghost" className="!size-7 !px-0" aria-label={`Move ${source.label} down`} title="Move down" disabled={saving || index === overview.sources.length - 1} onClick={() => moveSource(source.id, 1)}>
                                    <ChevronDown size={13} />
                                </SettingsButton></>) : null}
                                {source.custom ? <SettingsButton variant="ghost" className="!size-7 !px-0" aria-label={`Remove ${source.label} source, keep files`} title="Remove source, keep files" disabled={saving} onClick={() => removeFolder(source.id)}>
                                    <Trash2 size={13} />
                                </SettingsButton> : null}
                                <span className="ml-1 inline-flex">
                                    <SettingsSwitch
                                        checked={source.enabled}
                                        onCheckedChange={(checked) => toggleSource(source.id, checked)}
                                        disabled={saving}
                                        label={`Use skills from ${source.label}`}
                                    />
                                </span>
                            </div>
                        )}
                    />
                ))}
                {!overview && loading ? (
                    <SettingsRow title="Detecting folders" description="Checking compatible skill locations on this device." status="Checking" statusTone="muted" />
                ) : null}
            </SettingsSection>

            <SettingsSection title="Name conflicts">
                <SettingsRow
                    searchTargetId={createSettingsRowTargetId('Name conflicts', 'Overlapping names')}
                    title={!overview ? 'Name conflicts' : conflicts.length ? `${conflicts.length} overlapping ${conflicts.length === 1 ? 'name' : 'names'}` : 'No overlapping names'}
                    description={!overview ? 'Load skill sources to check for overlapping names.' : conflicts.length
                        ? 'Choose a preferred source for any overlapping skill name.'
                        : 'Each enabled skill name currently resolves to one source.'}
                    info={conflicts.length ? 'Source priority already chooses a winner; only override names that need a different source.' : undefined}
                    status={!overview ? loading ? 'Checking' : 'Unavailable' : conflicts.length ? 'Resolved' : 'Clear'}
                    statusTone={!overview ? 'muted' : conflicts.length ? 'info' : 'ready'}
                    control={conflicts.length ? <SettingsButton onClick={() => setConflictsOpen(true)}>Review</SettingsButton> : undefined}
                />
            </SettingsSection>

            {error ? <SettingsNotice tone="error">{error}</SettingsNotice> : null}

            <SettingsDialog
                open={conflictsOpen}
                onClose={() => setConflictsOpen(false)}
                title="Resolve skill names"
                description="Override the source for individual skill names."
                className="max-w-[560px]"
                contentClassName="space-y-0 p-0"
                footer={<SettingsButton onClick={() => setConflictsOpen(false)}>Done</SettingsButton>}
            >
                {conflicts.map((conflict) => {
                    const selected = conflict.preferredSourceId
                        && conflict.sources.some((source) => source.id === conflict.preferredSourceId)
                        ? conflict.preferredSourceId
                        : 'auto'
                    return (
                        <div key={conflict.name} className="flex min-h-12 items-center justify-between gap-4 border-b border-[var(--settings-row-divider)] px-4 py-2.5 last:border-b-0">
                            <div className="min-w-0">
                                <div className="truncate text-[12px] font-medium text-[var(--settings-text)]">{conflict.name}</div>
                                <div className="mt-0.5 truncate text-[10px] text-[var(--settings-text-muted)]">
                                    {conflict.sources.map((source) => source.label).join(' · ')}
                                </div>
                            </div>
                            <SettingsSelect
                                className="w-48 sm:w-48"
                                value={selected}
                                disabled={saving}
                                aria-label={`Preferred source for ${conflict.name}`}
                                onChange={(event) => {
                                    if (!overview) return
                                    void persist(updateConflictPreference(overview.settings, conflict, event.target.value))
                                }}
                            >
                                <option value="auto">Automatic · {conflict.winnerSourceLabel}</option>
                                {conflict.sources.map((source) => <option key={source.id} value={source.id}>{source.label}</option>)}
                            </SettingsSelect>
                        </div>
                    )
                })}
            </SettingsDialog>
        </SkillSettingsContainer>
    )
}
