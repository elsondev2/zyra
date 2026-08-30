import { Check, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react'
import type { ExternalBrowserHistoryImportResult, ExternalBrowserHistoryProfile, ExternalBrowserHistoryScanResult } from '@shared/external-browser-history-contracts'
import { cn } from '@/lib/utils'
import { AssistantBrowserBrandIcon } from './AssistantBrowserBrandIcon'
import { AssistantCheckbox } from './AssistantCheckbox'
import { AssistantDatePicker } from './AssistantDatePicker'

export function BrowserProfileSourcesStep({
    scan,
    scanning,
    browserGroups,
    selected,
    onSelectedChange,
    onScan
}: {
    scan: ExternalBrowserHistoryScanResult | null
    scanning: boolean
    browserGroups: Array<[string, ExternalBrowserHistoryProfile[]]>
    selected: Set<string>
    onSelectedChange: (next: Set<string>) => void
    onScan: () => void
}) {
    return (
        <div>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h4 className="text-[11px] font-semibold text-sparkle-text">Choose browser profiles</h4>
                    <p className="mt-1 text-[8px] leading-3.5 text-sparkle-text-muted/55">Import addresses, titles, counts, and dates. Available profile names and email labels are shown only to identify a source; passwords, cookies, bookmarks, and sign-ins are never read.</p>
                </div>
                <button type="button" onClick={onScan} disabled={scanning} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[var(--surface-divider)] px-2.5 text-[9px] text-sparkle-text-secondary hover:bg-[var(--surface-hover)] disabled:opacity-40">{scanning ? <LoaderCircle size={11} className="animate-spin" /> : <RefreshCw size={11} />}{scan ? 'Scan again' : 'Scan'}</button>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[8px] text-sparkle-text-muted/40"><ShieldCheck size={11} className="text-emerald-300/60" />Nothing is scanned before you press Scan. Paths stay in Desktop.</div>
            {!scan && !scanning ? <div className="mt-3 flex min-h-28 items-center justify-center border-y border-dashed border-[var(--surface-divider)] text-[9px] text-sparkle-text-muted/45">Scan to find local browser profiles.</div> : null}
            {scanning ? <div className="mt-3 flex min-h-28 items-center justify-center gap-2 border-y border-[var(--surface-divider)] text-[9px] text-sparkle-text-muted/55"><LoaderCircle size={12} className="animate-spin" />Finding browser profiles…</div> : null}
            {scan && browserGroups.length === 0 ? <div className="mt-3 flex min-h-28 items-center justify-center border-y border-[var(--surface-divider)] text-[9px] text-sparkle-text-muted/55">No supported browser profiles were found.</div> : null}
            <div className="mt-3 space-y-3">
                {browserGroups.map(([browserName, profiles]) => (
                    <section key={browserName}>
                        <div className="flex h-7 items-center gap-2 px-1 text-[9px] font-medium text-sparkle-text-muted/60"><AssistantBrowserBrandIcon browserId={profiles[0]?.browserId || ''} />{browserName}<span className="font-mono text-[8px] text-sparkle-text-muted/35">{profiles.length}</span></div>
                        <div className="divide-y divide-[var(--surface-divider)] border-y border-[var(--surface-divider)]">
                            {profiles.map((profile) => {
                                const ready = profile.status === 'ready'
                                return (
                                    <div key={profile.sourceToken} className={cn('flex min-h-12 items-center gap-2.5 px-2', ready ? 'hover:bg-[var(--surface-hover)]' : 'opacity-55')}>
                                        <AssistantCheckbox checked={selected.has(profile.sourceToken)} disabled={!ready} label={`Import ${profile.browserName} ${profile.profileName}`} onChange={(checked) => {
                                            const next = new Set(selected)
                                            if (checked) next.add(profile.sourceToken)
                                            else next.delete(profile.sourceToken)
                                            onSelectedChange(next)
                                        }} />
                                        <span className="min-w-0 flex-1">
                                            <span className="flex min-w-0 items-center gap-1.5"><span className="truncate text-[10px] text-sparkle-text-secondary">{profile.profileName}</span>{profile.accountHint ? <span className="truncate text-[8px] text-sparkle-text-muted/45">{profile.accountHint}</span> : null}</span>
                                            <span className="block text-[8px] text-sparkle-text-muted/45">{profile.support === 'supported' ? 'Supported' : 'Best effort'} · {ready ? 'Ready' : profile.status === 'permission-required' ? 'Permission required' : 'Close browser and retry'}</span>
                                        </span>
                                    </div>
                                )
                            })}
                        </div>
                    </section>
                ))}
            </div>
        </div>
    )
}

export function HistoryRangeStep({ scope, since, maxDate, onScopeChange, onSinceChange }: { scope: 'all' | 'since'; since: string; maxDate: string; onScopeChange: (scope: 'all' | 'since') => void; onSinceChange: (value: string) => void }) {
    return (
        <div>
            <h4 className="text-[12px] font-semibold text-sparkle-text">Choose a history range</h4>
            <p className="mt-1 text-[9px] text-sparkle-text-muted/55">Zyra keeps the newest 1,000 sanitized pages after merging duplicates.</p>
            <div className="mt-4 divide-y divide-[var(--surface-divider)] border-y border-[var(--surface-divider)]" role="radiogroup" aria-label="History import range">
                <button type="button" role="radio" data-scope="all" tabIndex={scope === 'all' ? 0 : -1} aria-checked={scope === 'all'} onClick={() => onScopeChange('all')} onKeyDown={(event) => {
                    if (['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(event.key)) {
                        event.preventDefault()
                        onScopeChange('since')
                        event.currentTarget.parentElement?.querySelector<HTMLElement>('[data-scope="since"]')?.focus()
                    }
                }} className="flex min-h-12 w-full items-center gap-2.5 px-2 text-left hover:bg-[var(--surface-hover)]"><span className={cn('size-3.5 rounded-full border-[3px]', scope === 'all' ? 'border-[var(--accent-primary)] bg-[var(--color-bg)]' : 'border-[var(--surface-divider)]')} /><span><strong className="block text-[10px] font-medium text-sparkle-text-secondary">All available</strong><span className="block text-[8px] text-sparkle-text-muted/45">Use the most recent history each profile provides.</span></span></button>
                <button type="button" role="radio" data-scope="since" tabIndex={scope === 'since' ? 0 : -1} aria-checked={scope === 'since'} onClick={() => onScopeChange('since')} onKeyDown={(event) => {
                    if (['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(event.key)) {
                        event.preventDefault()
                        onScopeChange('all')
                        event.currentTarget.parentElement?.querySelector<HTMLElement>('[data-scope="all"]')?.focus()
                    }
                }} className="flex min-h-12 w-full items-center gap-2.5 px-2 text-left hover:bg-[var(--surface-hover)]"><span className={cn('size-3.5 rounded-full border-[3px]', scope === 'since' ? 'border-[var(--accent-primary)] bg-[var(--color-bg)]' : 'border-[var(--surface-divider)]')} /><span><strong className="block text-[10px] font-medium text-sparkle-text-secondary">Since a date</strong><span className="block text-[8px] text-sparkle-text-muted/45">Limit the import to recent activity.</span></span></button>
            </div>
            {scope === 'since' ? <div className="mt-4 flex items-center justify-between border-y border-[var(--surface-divider)] py-3"><div><div className="text-[9px] font-medium text-sparkle-text-secondary">Start date</div><div className="mt-0.5 text-[8px] text-sparkle-text-muted/45">Dates are interpreted in your local time.</div></div><AssistantDatePicker value={since} max={maxDate} onChange={onSinceChange} /></div> : null}
        </div>
    )
}

export function HistoryReviewStep({ profiles, scope, since, importing }: { profiles: ExternalBrowserHistoryProfile[]; scope: 'all' | 'since'; since: string; importing: boolean }) {
    return (
        <div>
            <h4 className="text-[12px] font-semibold text-sparkle-text">Review import</h4>
            <p className="mt-1 text-[9px] text-sparkle-text-muted/55">Reimporting the same history will not multiply visit counts.</p>
            <div className="mt-4 divide-y divide-[var(--surface-divider)] border-y border-[var(--surface-divider)]">
                {profiles.map((profile) => <div key={profile.sourceToken} className="flex min-h-11 items-center gap-2.5 px-2"><AssistantBrowserBrandIcon browserId={profile.browserId} /><span className="min-w-0 flex-1"><span className="block truncate text-[10px] text-sparkle-text-secondary">{profile.browserName} · {profile.profileName}</span>{profile.accountHint ? <span className="block truncate text-[8px] text-sparkle-text-muted/45">{profile.accountHint}</span> : null}</span><Check size={12} className="text-emerald-300" /></div>)}
            </div>
            <div className="mt-3 flex items-center justify-between text-[9px]"><span className="text-sparkle-text-muted/50">Range</span><span className="font-medium text-sparkle-text-secondary">{scope === 'all' ? 'All available history' : `Since ${since}`}</span></div>
            {importing ? <div className="mt-5 flex items-center gap-2 rounded-md border border-[var(--accent-primary)]/15 bg-[var(--accent-primary)]/[0.05] px-3 py-2.5 text-[9px] text-sparkle-text-secondary"><LoaderCircle size={12} className="animate-spin text-[var(--accent-primary)]" />Reading and sanitizing selected profiles…</div> : null}
        </div>
    )
}

export function HistoryImportResultStep({ result }: { result: ExternalBrowserHistoryImportResult }) {
    return (
        <div className="py-2">
            <span className="inline-flex size-9 items-center justify-center rounded-full bg-emerald-400/[0.10] text-emerald-300"><Check size={17} /></span>
            <h4 className="mt-3 text-[13px] font-semibold text-sparkle-text">History imported</h4>
            <p className="mt-3 border-y border-[var(--surface-divider)] py-3 text-[9px] text-sparkle-text-secondary">{result.added} added · {result.updated} updated · {result.duplicatesMerged} merged · {result.skipped} skipped</p>
            {result.warnings.length > 0 ? <div className="mt-3 space-y-1">{result.warnings.map((warning) => <p key={warning} className="text-[9px] leading-4 text-amber-200/75">{warning}</p>)}</div> : null}
        </div>
    )
}
