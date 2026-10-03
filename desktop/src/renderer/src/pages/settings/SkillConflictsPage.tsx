import { useMemo, useState } from 'react'
import { Check, ListFilter, RefreshCw, Search } from 'lucide-react'
import type { AssistantSkillConflict, AssistantSkillSourceOverviewPayload } from '@shared/assistant/contracts'
import { SettingsButton, SettingsNotice, SettingsSection, SettingsSelect } from './settings-layout'
import { SettingsInfoTooltip } from './SettingsInfoTooltip'
import { SettingsProviderIcon } from './SettingsProviderIcon'
import { filterSkillConflicts, skillConflictNeedsReview, type SkillConflictFilter } from './skill-settings-model'

type Props = {
    overview: AssistantSkillSourceOverviewPayload | null
    loading: boolean
    saving: boolean
    error: string | null
    onRefresh: () => void
    onPreferenceChange: (conflict: AssistantSkillConflict, sourceId: string) => void
}

export function SkillConflictsPage({ overview, loading, saving, error, onRefresh, onPreferenceChange }: Props) {
    const [filter, setFilter] = useState<SkillConflictFilter>('unresolved')
    const [query, setQuery] = useState('')
    const conflicts = overview?.conflicts || []
    const unresolvedCount = conflicts.filter(skillConflictNeedsReview).length
    const resolvedCount = conflicts.length - unresolvedCount
    const visible = useMemo(() => filterSkillConflicts(conflicts, filter, query), [conflicts, filter, query])
    return <>
        {conflicts.length > 5 ? <div className="flex justify-end px-1"><label className="flex h-8 min-w-0 items-center gap-2 rounded-md border border-[var(--settings-border)] bg-[var(--settings-control)] px-2.5 text-[var(--settings-text-muted)] focus-within:border-[var(--accent-primary)]">
                <Search size={13} aria-hidden="true" />
                <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a skill or source" aria-label="Find a skill or source"
                    className="min-w-0 w-44 bg-transparent text-[12px] text-[var(--settings-text)] outline-none placeholder:text-[var(--settings-text-faint)]" />
            </label></div> : null}

        <SettingsSection title={filter === 'all' ? 'All overlapping names' : filter === 'resolved' ? 'Resolved names' : 'Names to review'}
            headerAction={<div className="flex items-center gap-1">
                <label className="relative inline-flex items-center">
                    <ListFilter size={12} className="pointer-events-none absolute left-2 text-[var(--settings-text-muted)]" aria-hidden="true" />
                    <SettingsSelect className="!h-7 !w-[136px] !min-w-0 !py-0 !pl-7 !pr-1 !text-[11px]" value={filter} aria-label="Filter skill conflicts" onChange={(event) => setFilter(event.target.value as SkillConflictFilter)}>
                        <option value="unresolved">Unresolved · {unresolvedCount}</option>
                        <option value="resolved">Resolved · {resolvedCount}</option>
                        <option value="all">All · {conflicts.length}</option>
                    </SettingsSelect>
                </label>
                <SettingsInfoTooltip label="About skill name conflicts">
                    <p>When sources contain the same skill name, Zyra picks one automatically. Choose a source to keep that choice.</p>
                    <p className="mt-2">Project skills take priority over personal skills. Changes apply to new chats; run /reload in an existing chat.</p>
                </SettingsInfoTooltip>
                <SettingsButton variant="ghost" onClick={onRefresh} disabled={loading || saving} aria-label="Refresh skill conflicts" title="Refresh skill conflicts">
                    <RefreshCw size={14} className={loading ? 'animate-spin' : undefined} />
                </SettingsButton>
            </div>}>
            {!overview && loading ? <div className="px-4 py-8 text-center text-[12px] text-[var(--settings-text-muted)]">Checking skill names…</div> : null}
            {!loading && !overview ? <div className="px-4 py-8 text-center text-[12px] text-[var(--settings-text-muted)]">Skill names are unavailable. Refresh to try again.</div> : null}
            {overview && visible.length === 0 ? <div className="flex min-h-36 flex-col items-center justify-center gap-2 px-5 py-8 text-center">
                {filter === 'unresolved' && !query ? <Check size={18} className="text-[var(--status-success)]" aria-hidden="true" /> : null}
                <p className="text-[13px] font-medium text-[var(--settings-text)]">{query ? 'No matching skills' : filter === 'unresolved' ? 'Nothing to review' : filter === 'resolved' ? 'No chosen sources yet' : 'No overlapping names'}</p>
                <p className="max-w-sm text-[11px] leading-5 text-[var(--settings-text-muted)]">
                    {query ? 'Try another skill or source name.' : filter === 'unresolved' && resolvedCount ? `${resolvedCount} ${resolvedCount === 1 ? 'name has' : 'names have'} a chosen source.` : filter === 'unresolved' ? 'Enabled sources have no names that need a choice.' : filter === 'resolved' ? 'Names move here when you choose a source.' : 'The enabled sources currently have no duplicate skill names.'}
                </p>
                {filter === 'unresolved' && resolvedCount && !query ? <button type="button" onClick={() => setFilter('resolved')} className="mt-1 text-[11px] font-medium text-[var(--accent-primary)] hover:underline">View resolved names</button> : null}
            </div> : null}
            {visible.map((conflict) => {
                const selected = conflict.preferredSourceId && conflict.sources.some((source) => source.id === conflict.preferredSourceId)
                    ? conflict.preferredSourceId : 'auto'
                const needsReview = skillConflictNeedsReview(conflict)
                return <div key={conflict.name} className="grid gap-3 border-t border-[var(--settings-row-divider)] px-4 py-3.5 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,auto)] sm:items-center sm:gap-6">
                    <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-[13px] font-medium text-[var(--settings-text)]" title={conflict.name}>{conflict.name}</span>
                            <span className={`shrink-0 text-[10px] ${selected !== 'auto' && needsReview ? 'text-[var(--status-warning)]' : needsReview ? 'text-[var(--settings-text-muted)]' : 'text-[var(--status-success)]'}`}>{selected !== 'auto' && needsReview ? 'Choice unavailable' : needsReview ? 'Automatic' : 'Chosen'}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--settings-text-secondary)]">
                            <SettingsProviderIcon provider={conflict.winnerSourceId} size={13} />
                            <span>Using {conflict.winnerSourceLabel}</span>
                            <span aria-hidden="true">·</span>
                            <span>Also in {conflict.sources.filter((source) => source.id !== conflict.winnerSourceId).map((source) => source.label).join(', ')}</span>
                        </div>
                        {selected !== 'auto' && needsReview ? <p className="mt-1 text-[11px] text-[var(--status-warning)]">That choice cannot override the current project skill. Choose another source or Automatic.</p> : null}
                    </div>
                    <SettingsSelect className="w-full sm:w-[220px]" value={selected} disabled={saving} aria-label={`Source for ${conflict.name}`}
                        onChange={(event) => onPreferenceChange(conflict, event.target.value)}>
                        <option value="auto">Automatic priority</option>
                        {conflict.sources.map((source) => <option key={source.id} value={source.id}>Use {source.label}</option>)}
                    </SettingsSelect>
                </div>
            })}
        </SettingsSection>
        {error ? <SettingsNotice tone="error">{error}</SettingsNotice> : null}
    </>
}
