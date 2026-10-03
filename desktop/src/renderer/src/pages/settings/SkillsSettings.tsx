import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, ChevronUp, FolderPlus, RefreshCw, Trash2 } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
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
import { SettingsExpander } from './SettingsExpander'
import {
    SettingsButton,
    SettingsNotice,
    SettingsPageContainer,
    SettingsRow,
    SettingsSection,
    SettingsSwitch
} from './settings-layout'
import { createSettingsRowTargetId } from './settings-search'
import { settingsDetailNavigationState } from './settings-navigation-context'
import { SettingsProviderIcon } from './SettingsProviderIcon'
import { SettingsInfoTooltip } from './SettingsInfoTooltip'
import { SkillConflictsPage } from './SkillConflictsPage'
import { moveEnabledSkillSource, skillConflictNeedsReview } from './skill-settings-model'

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

function SkillSettingsContainer({ embedded, view, children }: { embedded: boolean; view: 'sources' | 'conflicts'; children: ReactNode }) {
    return embedded ? <div className="plugin-source-settings">{children}</div> : (
        <SettingsPageContainer title={view === 'conflicts' ? 'Skill name conflicts' : 'Skills'} navigation={<></>}
            backTo={view === 'conflicts' ? '/settings/assistant/skills' : '/settings/assistant'} backLabel={view === 'conflicts' ? 'Skills' : 'Assistant'} showSettingsBack={view === 'conflicts'}>{children}</SettingsPageContainer>
    )
}

export default function SkillsSettings({ embedded = false, view = 'sources', onSaved, onOpenConflicts }: {
    embedded?: boolean
    view?: 'sources' | 'conflicts'
    onSaved?: () => void
    onOpenConflicts?: () => void
}) {
    const location = useLocation()
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
    const [priorityOpen, setPriorityOpen] = useState(false)

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
            priority: moveEnabledSkillSource(overview.settings.priority, overview.settings.enabledSourceIds, sourceId, direction)
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
    const unresolvedCount = conflicts.filter(skillConflictNeedsReview).length
    const activeCount = useMemo(() => (
        overview?.sources.filter((source) => source.enabled && source.detected).length || 0
    ), [overview?.sources])
    const missingCount = overview?.sources.filter((source) => source.enabled && !source.detected).length || 0
    const enabledSources = overview?.sources.filter((source) => source.enabled) || []

    if (!desktopHost) {
        return (
            <SettingsPageContainer title={view === 'conflicts' ? 'Skill name conflicts' : 'Skills'} backTo="/settings/assistant/skills" backLabel="Skills" showSettingsBack={view === 'conflicts'}>
                <SettingsSection title="Skill sources">
                    <SettingsNotice>Open Zyra Desktop to manage local skill folders.</SettingsNotice>
                </SettingsSection>
            </SettingsPageContainer>
        )
    }

    return (
        <SkillSettingsContainer embedded={embedded} view={view}>
            {view === 'conflicts' ? <SkillConflictsPage overview={overview} loading={loading} saving={saving} error={error}
                onRefresh={() => void loadOverview()}
                onPreferenceChange={(conflict, sourceId) => {
                    if (!overview) return
                    void persist(updateConflictPreference(overview.settings, conflict, sourceId))
                }} /> : <>
            <SettingsSection
                title="Skill sources"
                headerAction={(
                    <div className="flex items-center gap-1">
                        {overview ? <SettingsInfoTooltip label="Skill source status">
                            <p>{activeCount} active {activeCount === 1 ? 'source' : 'sources'}.</p>
                            {missingCount ? <p className="mt-1 text-[var(--status-warning)]">{missingCount} enabled {missingCount === 1 ? 'source is' : 'sources are'} not found.</p> : <p className="mt-1">All enabled sources were found.</p>}
                            {saving ? <p className="mt-1">Saving changes…</p> : null}
                        </SettingsInfoTooltip> : null}
                        <SettingsButton variant="ghost" onClick={() => void loadOverview()} disabled={loading || saving} aria-label="Refresh skill sources" title="Refresh">
                            <RefreshCw size={13} className={loading ? 'animate-spin' : undefined} />
                        </SettingsButton>
                        <SettingsButton onClick={() => void addFolder()} disabled={!overview || saving}>
                            <FolderPlus size={13} /> Add folder
                        </SettingsButton>
                    </div>
                )}
            >
                {overview?.sources.map((source) => (
                    <SettingsRow
                        key={source.id}
                        searchTargetId={createSettingsRowTargetId('Skill sources', source.label)}
                        title={source.label}
                        description={`${source.skillCount} ${source.skillCount === 1 ? 'skill' : 'skills'} · ${sourceScopeSummary(source)}`}
                        icon={<SettingsProviderIcon provider={source.id} />}
                        info={<div className="space-y-2">{source.paths.length ? source.paths.map(entry => <div key={`${entry.scope}:${entry.path}`}>
                            <span className="block font-medium capitalize text-[var(--settings-text)]">{entry.scope}</span>
                            <code className="break-all text-[11px]">{entry.path}</code>
                        </div>) : <p>No folders were found for this source.</p>}</div>}
                        status={!source.detected ? 'Not found' : undefined}
                        statusTone={source.enabled ? 'warning' : 'muted'}
                        className="py-2.5"
                        control={(
                            <div className="flex items-center gap-1">
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
                <div className="zyra-settings-row">
                    <div className="relative">
                    <button
                        type="button"
                        data-settings-search-target={createSettingsRowTargetId('Skill sources', 'Resolution order')}
                        disabled={enabledSources.length < 2}
                        aria-expanded={enabledSources.length > 1 && priorityOpen}
                        aria-controls="skill-source-priority"
                        onClick={() => setPriorityOpen((open) => !open)}
                        className="relative flex min-h-[68px] w-full items-center justify-between gap-4 px-4 py-3.5 pr-20 text-left transition-colors hover:bg-[var(--settings-row-hover)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-primary)] disabled:cursor-default"
                    >
                        <span className="min-w-0 space-y-1">
                            <span className="block text-[13px] font-medium tracking-[-0.003em] text-[var(--settings-text)]">Resolution order</span>
                            <span className="block truncate text-[12px] leading-[1.5] text-[var(--settings-text-secondary)]">{enabledSources.length > 1 ? enabledSources.map((source) => source.label).join(' → ') : enabledSources.length ? enabledSources[0].label : 'No sources enabled.'}</span>
                        </span>
                        <ChevronDown size={14} className={`absolute right-4 text-[var(--settings-text-muted)] transition-transform duration-200 ${priorityOpen && enabledSources.length > 1 ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </button>
                    <span className="absolute right-10 top-1/2 z-10 inline-flex -translate-y-1/2">
                        <SettingsInfoTooltip label="About resolution order">
                            <p>Project skills win over personal skills. Sources are checked from top to bottom within the same scope. Changes apply to new chats; run /reload in an existing chat.</p>
                        </SettingsInfoTooltip>
                    </span>
                    </div>
                    <SettingsExpander open={priorityOpen && enabledSources.length > 1} contentClassName="border-t border-[var(--settings-row-divider)] px-4">
                        <div id="skill-source-priority" className="divide-y divide-[var(--settings-row-divider)]">
                        {enabledSources.map((source, index) => <div key={source.id} className="flex min-h-10 items-center gap-2 py-1.5">
                            <span className="w-5 text-center font-mono text-[10px] text-[var(--settings-text-muted)]">{index + 1}</span>
                            <SettingsProviderIcon provider={source.id} size={14} />
                            <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--settings-text)]">{source.label}</span>
                            <SettingsButton variant="ghost" className="!size-7 !px-0" aria-label={`Move ${source.label} up`} title="Move up" disabled={saving || index === 0} onClick={() => moveSource(source.id, -1)}><ChevronUp size={13} /></SettingsButton>
                            <SettingsButton variant="ghost" className="!size-7 !px-0" aria-label={`Move ${source.label} down`} title="Move down" disabled={saving || index === enabledSources.length - 1} onClick={() => moveSource(source.id, 1)}><ChevronDown size={13} /></SettingsButton>
                        </div>)}
                        </div>
                    </SettingsExpander>
                </div>
            </SettingsSection>

            <SettingsSection title="Name conflicts">
                {(() => {
                    const label = unresolvedCount ? `${unresolvedCount} ${unresolvedCount === 1 ? 'name' : 'names'} to review` : conflicts.length ? 'All current overlaps reviewed' : 'No overlapping names'
                    const description = !overview ? 'Checking enabled skill sources.' : conflicts.length ? `${conflicts.length} overlapping ${conflicts.length === 1 ? 'name' : 'names'} · Choose which source to use.` : 'Enabled sources have no duplicate skill names.'
                    const className = 'flex w-full min-h-16 items-center justify-between gap-4 px-4 py-3.5 text-left transition-colors hover:bg-[var(--settings-row-hover)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-primary)] disabled:cursor-not-allowed disabled:opacity-50'
                    const content = <><span className="min-w-0"><span className="block text-[13px] font-medium text-[var(--settings-text)]">{label}</span><span className="mt-1 block text-[11px] text-[var(--settings-text-secondary)]">{description}</span></span><ChevronRight size={16} className="shrink-0 text-[var(--settings-text-muted)]" aria-hidden="true" /></>
                    return embedded ? <button type="button" className={className} onClick={onOpenConflicts} disabled={!overview}
                        data-settings-search-target={createSettingsRowTargetId('Name conflicts', 'Overlapping names')}>{content}</button>
                        : <Link to="/settings/assistant/skills/conflicts" state={settingsDetailNavigationState(location)} className={className}
                            data-settings-search-target={createSettingsRowTargetId('Name conflicts', 'Overlapping names')}>{content}</Link>
                })()}
            </SettingsSection>

            {error ? <SettingsNotice tone="error">{error}</SettingsNotice> : null}
            </>}
        </SkillSettingsContainer>
    )
}
