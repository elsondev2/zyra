import { useId } from 'react'
import './AccountUsageLimits.css'
import { ArrowLeftRight, ChevronDown, Info, RefreshCw } from 'lucide-react'
import { formatFetchedAt, type RateLimitCard, type UsageMode } from './assistant-account-rate-limits'
import { SettingsNotice, SettingsSection } from './settings-layout'
import { createSettingsRowTargetId } from './settings-search'
function LimitDonut({ percent }: { percent: number }) {
    return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 shrink-0 -rotate-90"><circle cx="12" cy="12" r="9" fill="none" stroke="var(--settings-track)" strokeWidth="3" /><circle cx="12" cy="12" r="9" fill="none" stroke="var(--accent-primary)" strokeWidth="3" pathLength="100" strokeDasharray={`${percent} 100`} strokeLinecap="round" className="transition-[stroke-dasharray] duration-200 motion-reduce:transition-none" /></svg>
}
export function AccountUsageLimits({ cards, mode, onModeChange, loading, error, fetchedAt }: {
    cards: RateLimitCard[]; mode: UsageMode; onModeChange: (mode: UsageMode) => void; loading: boolean; error?: string | null; fetchedAt?: string
}) {
    const syncInfoId = useId()
    const codex = cards.filter(card => /^codex$/i.test(card.bucketLabel) || card.id.startsWith('codex-'))
    const main = [...(codex.length ? codex : cards)].sort((a, b) => mode === 'remaining' ? a.percent - b.percent : b.percent - a.percent)[0]
    return <SettingsSection title="Usage limits" headerAction={fetchedAt ? <span className="group/sync relative inline-flex"><button type="button" aria-label="Limits last updated" aria-describedby={syncInfoId} className="inline-flex size-5 items-center justify-center rounded text-[var(--settings-text-muted)] hover:text-[var(--settings-text)] focus-visible:outline focus-visible:outline-[var(--accent-primary)]"><Info size={12} /></button><span id={syncInfoId} role="tooltip" className="invisible pointer-events-none absolute right-0 top-full z-30 mt-1 whitespace-nowrap rounded border border-[var(--settings-border)] bg-[var(--settings-popover)] px-2 py-1 text-[10px] font-normal text-[var(--settings-text-secondary)] opacity-0 shadow-sm transition-opacity duration-150 group-hover/sync:visible group-hover/sync:opacity-100 group-focus-within/sync:visible group-focus-within/sync:opacity-100 motion-reduce:transition-none">Synced {formatFetchedAt(fetchedAt)}</span></span> : undefined}>
        <div className="relative">
            <details className="group/limits usage-limits-disclosure">
                <summary className="flex min-h-20 cursor-pointer list-none items-center gap-4 px-4 py-3 text-xs hover:bg-[var(--settings-row-hover)] focus-visible:outline focus-visible:outline-[var(--accent-primary)] [&::-webkit-details-marker]:hidden">
                    <div className="min-w-0 flex-1"><div className="font-medium text-[var(--settings-text)]">{main?.bucketLabel || 'Subscription limits'}</div><div className="mt-1 text-[11px] text-[var(--settings-text-muted)]">{loading ? 'Checking limits…' : main ? `${main.durationLabel} · ${main.resetSummary}` : error ? 'Could not refresh limits' : 'No limits reported'}</div></div>

                    <div className="flex shrink-0 items-center gap-2 tabular-nums"><button type="button" aria-label={`Showing ${mode}. Switch to ${mode === 'remaining' ? 'used' : 'remaining'}.`} title={`Show ${mode === 'remaining' ? 'used' : 'remaining'}`} onClick={event => { event.preventDefault(); event.stopPropagation(); onModeChange(mode === 'remaining' ? 'used' : 'remaining') }} data-settings-search-target={createSettingsRowTargetId('Usage limits', 'Usage display')} className="flex size-7 shrink-0 items-center justify-center rounded-md text-[var(--settings-text-muted)] transition-colors hover:bg-[var(--settings-control-hover)] hover:text-[var(--settings-text)] focus-visible:outline focus-visible:outline-[var(--accent-primary)]"><ArrowLeftRight size={13} /></button>{loading ? <RefreshCw size={15} className="animate-spin motion-reduce:animate-none" /> : main ? <><LimitDonut percent={main.percent} /><span key={`${mode}:${main.percent}`} className="usage-limit-value min-w-[6.5rem]">{main.percentLabel}</span></> : <span>—</span>}</div>
                    <ChevronDown size={13} className="shrink-0 text-[var(--settings-text-muted)] transition-transform group-open/limits:rotate-180 motion-reduce:transition-none" />
                </summary>
                <div className="border-t border-[var(--settings-row-divider)] px-4 py-2" data-settings-search-target={createSettingsRowTargetId('Usage limits', 'Usage windows')} tabIndex={-1}>
                    {error && <SettingsNotice tone="warning">{error}</SettingsNotice>}
                    {cards.map(card => <div key={card.id} className="flex items-center justify-between gap-4 py-3 text-xs"><div className="min-w-0"><div className="text-[var(--settings-text)]">{card.bucketLabel} · {card.durationLabel}</div><div className="mt-1 text-[10px] text-[var(--settings-text-muted)]" title={card.resetAbsolute}>{card.resetSummary}</div></div><div className="flex shrink-0 items-center gap-2 tabular-nums"><LimitDonut percent={card.percent} /><span key={`${mode}:${card.percent}`} className="usage-limit-value min-w-[6.5rem]">{card.percentLabel}</span></div></div>)}
                </div>
            </details>

        </div>
    </SettingsSection>
}
