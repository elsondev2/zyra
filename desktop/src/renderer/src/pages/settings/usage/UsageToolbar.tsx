import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, RefreshCw } from 'lucide-react'
import { usageHarnessLabels, type UsageRange, type UsageSummary, type UsageSummaryInput } from '@shared/assistant/usage-summary'
import { AnchoredMenuPopover } from '@/components/ui/AnchoredMenuPopover'
import { SettingsProviderIcon } from '../SettingsProviderIcon'
import { SettingsButton } from '../settings-layout'
import { UsageChoice } from './UsageChoice'
import { formatUsageDate, type UsageMetric } from './usage-presentation'

export function UsageToolbar({ metric, days, harness, summary, busy, onMetric, onDays, onHarness, onRefresh }: {
    metric: UsageMetric; days: UsageRange; harness: NonNullable<UsageSummaryInput['harness']>; summary: UsageSummary | null; busy: boolean
    onMetric: (value: UsageMetric) => void; onDays: (value: UsageRange) => void; onHarness: (value: NonNullable<UsageSummaryInput['harness']>) => void; onRefresh: () => void
}) {
    const anchor = useRef<HTMLButtonElement>(null)
    const [open, setOpen] = useState(false)
    useEffect(() => setOpen(false), [metric])
    const label = harness === 'all' ? 'All local tools' : usageHarnessLabels[harness]
    const sourceState = (id: string) => summary?.sources?.find(source => source.id === id)
    const indexing = summary?.sources?.some(source => source.state === 'indexing')
    return <header className="usage-toolbar">
        <div className="usage-source-control"><button ref={anchor} type="button" className="usage-source-trigger" aria-label={`Usage source: ${label}`} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(current => !current)}><span>{label}</span><ChevronDown size={13} /></button>{indexing ? <span role="status" className="usage-indexing">Indexing history...</span> : summary?.daily.length ? <span className="usage-range-caption">{formatUsageDate(summary.daily[0].date)} to {formatUsageDate(summary.daily[summary.daily.length - 1].date)}</span> : null}</div>
        <div className="usage-toolbar-controls">
            <UsageChoice className="usage-metric-select" label="Usage metric" value={metric} onChange={onMetric} options={[{ value: 'cost', label: 'Cost' }, { value: 'tokens', label: 'Tokens' }]} />
            <UsageChoice className="usage-period-select" label="Usage period" value={String(days)} onChange={value => onDays(value === 'all' ? 'all' : Number(value) as UsageRange)} options={([7, 30, 90, 365, 'all'] as const).map(value => ({ value: String(value), label: value === 'all' ? 'All time' : value === 365 ? '1 year' : `${value} days` }))} />
            <SettingsButton variant="ghost" className="!w-8 !px-0" disabled={busy} title="Refresh usage" aria-label="Refresh usage" aria-busy={busy} onClick={onRefresh}><RefreshCw size={14} className={busy ? 'animate-spin motion-reduce:animate-none' : ''} /></SettingsButton>
        </div>
        {open && <AnchoredMenuPopover anchorRef={anchor} autoFocus label="Usage sources" onClose={() => setOpen(false)}>
            <div onKeyDown={event => {
                if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
                const rows = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')]
                const current = rows.indexOf(event.currentTarget.ownerDocument.activeElement as HTMLButtonElement)
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : (current + (event.key === 'ArrowUp' ? -1 : 1) + rows.length) % rows.length
                event.preventDefault(); event.stopPropagation(); rows[next]?.focus()
            }}>
            {(['all', ...Object.keys(usageHarnessLabels)] as Array<NonNullable<UsageSummaryInput['harness']>>).map(id => { const state = sourceState(id); return <button key={id} type="button" role="menuitemradio" aria-checked={harness === id} className="usage-source-option" onClick={() => { onHarness(id); setOpen(false) }}><span className="usage-source-check">{harness === id && <Check size={12} />}</span>{id !== 'all' && <SettingsProviderIcon provider={id === 'zyra-cli' ? 'zyra' : id} size={14} />}<span className="usage-source-name">{id === 'all' ? 'All local tools' : usageHarnessLabels[id]}</span>{state && <span className="usage-source-state" title={state.error}>{state.state === 'ready' ? '' : state.state === 'missing' ? 'No history' : state.state === 'indexing' ? 'Indexing' : 'Unavailable'}</span>}</button> })}
            </div>
        </AnchoredMenuPopover>}
    </header>
}
