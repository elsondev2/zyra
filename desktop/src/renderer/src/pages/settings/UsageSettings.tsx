import type { UsageChartView } from '@shared/assistant/usage-chart'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { emptyUsageTotals, usageProviderLabel, usageHarnessLabels, type UsageBreakdown, type UsageRange, type UsageSummaryInput } from '@shared/assistant/usage-summary'
import { SettingsButton, SettingsNotice, SettingsSelect } from './settings-layout'
import { createSettingsSectionTargetId } from './settings-search'
import { UsageActivityChart, formatTokens } from './usage/UsageActivityChart'
import { useUsageSummary } from './usage/useUsageSummary'
const usd = (value: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: value > 0 && value < .01 ? 4 : 2 }).format(value)
const tokenKinds = [['input', 'Uncached input'], ['cached', 'Cache read'], ['cacheWrite', 'Cache write'], ['output', 'Output']] as const
export default function UsageSettings() {
    const [chartView, setChartView] = useState<UsageChartView>('daily')
    const [days, setDays] = useState<UsageRange>(30)
    const [harness, setHarness] = useState<NonNullable<UsageSummaryInput['harness']>>('all')
    const [showAllRows, setShowAllRows] = useState(false)
    const [breakdown, setBreakdown] = useState<'provider' | 'model' | 'harness'>('harness')
    const { summary, loading, error, refresh } = useUsageSummary(days, harness)
    const rows = useMemo(() => {
        if (!summary) return []
        const providers = new Map<string, UsageBreakdown>()
        for (const model of summary.models) {
            const id = breakdown === 'harness' ? model.harness || 'zyra' : breakdown === 'model' ? `${model.provider}/${model.model}` : model.provider
            const row = providers.get(id) || { id, provider: model.provider, harness: model.harness || 'zyra', model: breakdown === 'model' ? model.model : '', ...emptyUsageTotals() }
            for (const key of Object.keys(emptyUsageTotals()) as Array<keyof ReturnType<typeof emptyUsageTotals>>) row[key] += model[key]
            providers.set(id, row)
        }
        return [...providers.values()].sort((a, b) => b.tokens - a.tokens)
    }, [summary, breakdown])
    const totals = summary?.totals
    return <>
        <div className="flex flex-wrap items-center justify-between gap-4">
            <SettingsSelect aria-label="Usage source" value={harness} onChange={event => setHarness(event.target.value as typeof harness)}><option value="all">All local tools</option>{Object.entries(usageHarnessLabels).map(([id,label]) => <option key={id} value={id}>{label}</option>)}</SettingsSelect>
            <div className="flex items-center gap-1" role="group" aria-label="Usage period">{([7, 30, 90, 365, 'all'] as const).map(range => <button key={range} type="button" aria-pressed={days === range} onClick={() => setDays(range)} className={`rounded-md px-2 py-1.5 text-xs transition-colors focus-visible:outline focus-visible:outline-[var(--accent-primary)] ${days === range ? 'bg-[var(--settings-nav-active)] text-[var(--settings-text)]' : 'text-[var(--settings-text-muted)] hover:bg-[var(--settings-row-hover)]'}`}>{range === 'all' ? 'All time' : range === 365 ? '1 year' : `${range} days`}</button>)}</div>
            <SettingsButton variant="ghost" disabled={loading} onClick={refresh}><RefreshCw size={13} className={loading ? 'animate-spin motion-reduce:animate-none' : ''} />{loading ? 'Refreshing' : 'Refresh'}</SettingsButton>
        </div>
        {summary?.sources && <details className="text-[11px] text-[var(--settings-text-muted)]"><summary className="cursor-pointer py-1">{summary.sources.some(source => source.state === 'indexing') ? 'Indexing local history · totals are still growing' : summary.sources.some(source => source.state === 'error') ? 'Some history is unavailable · review sources' : `${summary.sources.filter(source => source.state === 'ready').length} sources available`}<span className="ml-2 text-[var(--settings-text-faint)]">Coverage</span></summary><div className="mt-3 space-y-2 border-l border-[var(--settings-divider)] pl-3">{summary.sources.map(source => <div key={source.id} className="flex flex-wrap justify-between gap-2"><span>{usageHarnessLabels[source.id]}</span><span>{source.state === 'ready' ? `${source.files.toLocaleString()} files · ${source.records.toLocaleString()} records` : source.state === 'missing' ? 'No local history found' : source.state === 'indexing' ? `Indexing · ${source.files} files` : source.error}</span></div>)}<p className="pt-2 leading-relaxed">Canonical transcripts take precedence over chat summaries. Desktop-owned sessions appear under Zyra; CLI history includes known projects. Empty sources may contain only unmetered or failed requests.</p></div></details>}
        {error && <SettingsNotice tone="error">{error}{summary ? ' Showing the last successful refresh.' : ''}</SettingsNotice>}
        {!summary ? <div role="status" className="flex min-h-60 items-center justify-center text-sm text-[var(--settings-text-muted)]">{error ? 'Usage is unavailable.' : 'Reading recorded usage…'}</div> : <>
            <section aria-label="Token activity" data-settings-section-title="Token activity" data-settings-search-target={createSettingsSectionTargetId('Token activity')} tabIndex={-1} className="space-y-8 border-b border-[var(--settings-divider)] pb-8">
                <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5 pt-2"><div><div className="mb-3 text-xs text-[var(--settings-text-muted)]">Processed tokens</div><div className="text-[42px] font-medium leading-none tracking-[-0.04em] tabular-nums" title={totals!.tokens.toLocaleString()}>{totals!.meteredTurns ? formatTokens(totals!.tokens) : '—'}</div></div><div className="flex gap-8 pb-1 text-sm"><div><div className="mb-1.5 text-[11px] text-[var(--settings-text-muted)]">Metered records</div><span className="tabular-nums">{totals!.turns.toLocaleString()}</span></div><div><div className="mb-1.5 text-[11px] text-[var(--settings-text-muted)]">Recorded cost{totals!.pricedTurns < totals!.turns && totals!.pricedTurns > 0 ? ' · partial' : ''}</div><span className="tabular-nums">{totals!.pricedTurns ? usd(totals!.costUsd) : '—'}</span></div></div></div>
                <UsageActivityChart daily={summary.daily} view={chartView} onViewChange={setChartView} />
            </section>
            <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">{tokenKinds.map(([key, label]) => <div key={key}><div className="mb-1.5 text-[11px] text-[var(--settings-text-muted)]">{label}</div><div className="text-lg font-medium tabular-nums" title={totals![key].toLocaleString()}>{totals!.meteredTurns ? formatTokens(totals![key]) : '—'}</div></div>)}</div>
            <section aria-label="Breakdown" data-settings-section-title="Breakdown" data-settings-search-target={createSettingsSectionTargetId('Breakdown')} tabIndex={-1}>
                <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-sm font-medium">Breakdown</h2><SettingsSelect aria-label="Group usage by" value={breakdown} onChange={event => setBreakdown(event.target.value as 'provider' | 'model' | 'harness')}><option value="harness">By tool</option><option value="provider">By provider</option><option value="model">By model</option></SettingsSelect></div>
                {rows.length ? <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="border-b border-[var(--settings-divider)] text-[10px] text-[var(--settings-text-muted)]"><tr><th className="pb-3 font-normal">{breakdown === 'harness' ? 'Tool' : breakdown === 'provider' ? 'Provider' : 'Model'}</th><th className="pb-3 text-right font-normal">Tokens</th><th className="pb-3 pl-4 text-right font-normal">Records</th><th className="pb-3 pl-4 text-right font-normal">Recorded cost</th></tr></thead><tbody>{(showAllRows ? rows : rows.slice(0,8)).map(row => <tr key={row.id} className="border-b border-[var(--settings-divider)] last:border-0"><td className="max-w-48 py-3 pr-5"><div className="truncate font-medium" title={row.model || usageProviderLabel(row.provider)}>{breakdown === 'harness' ? usageHarnessLabels[row.harness || 'zyra'] : breakdown === 'provider' ? usageProviderLabel(row.provider) : row.model}</div>{breakdown === 'model' && <div className="mt-1 text-[10px] text-[var(--settings-text-muted)]">{usageProviderLabel(row.provider)}</div>}<div className="mt-2 h-0.5 w-20 overflow-hidden rounded-full bg-[var(--settings-track)]"><div className="h-full bg-[var(--accent-primary)]" style={{ width: `${totals!.tokens ? row.tokens / totals!.tokens * 100 : 0}%` }} /></div></td><td className="py-3 text-right tabular-nums" title={row.tokens.toLocaleString()}>{row.meteredTurns ? formatTokens(row.tokens) : '—'}</td><td className="py-3 pl-4 text-right tabular-nums text-[var(--settings-text-secondary)]">{row.turns}</td><td className="py-3 pl-4 text-right tabular-nums" title={row.pricedTurns < row.turns ? `${row.pricedTurns} of ${row.turns} records reported cost` : 'Harness-recorded model cost, not a bill'}>{row.pricedTurns ? `${usd(row.costUsd)}${row.pricedTurns < row.turns ? ' *' : ''}` : '—'}</td></tr>)}</tbody></table></div> : <div className="py-8 text-center text-sm text-[var(--settings-text-muted)]">No recorded activity for this source and period.</div>}
                {rows.length > 8 && <button type="button" className="mt-3 text-xs text-[var(--settings-text-muted)] hover:text-[var(--settings-text)]" aria-expanded={showAllRows} onClick={() => setShowAllRows(value => !value)}>{showAllRows ? 'Show less' : `Show all ${rows.length}`}</button>}
            </section>
            <footer className="space-y-2 text-[11px] leading-relaxed text-[var(--settings-text-muted)]"><p>{harness === 'zyra' ? 'Recorded Zyra activity on this device.' : 'Local history only, with copied responses counted once. Missing or deleted logs cannot be recovered.'} {totals!.turns > totals!.meteredTurns ? `${totals!.turns - totals!.meteredTurns} records have no token counts. ` : ''}Recorded costs may be estimates; they are not subscription charges. An asterisk means some costs are unavailable.</p><div className="flex flex-wrap justify-between gap-2"><span>Updated {new Date(summary.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {summary.timeZone}</span><Link to="/settings/providers/limits" className="text-[var(--accent-primary)] hover:underline">Subscription limits →</Link></div></footer>
        </>}
    </>
}
