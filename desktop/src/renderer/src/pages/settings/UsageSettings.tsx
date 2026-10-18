import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { SettingsNotice, SettingsSection } from './settings-layout'
import { useUsageSummary } from './usage/useUsageSummary'
import { readUsagePreferences, saveUsagePreferences, type UsagePagePreferences } from './usage/usage-page-preferences'
import { UsageToolbar } from './usage/UsageToolbar'
import { UsageOverview } from './usage/UsageOverview'
import { UsageTotals } from './usage/UsageTotals'
import { UsageMeasurementCoverage } from './usage/UsageMeasurementCoverage'
import { UsageBreakdown } from './usage/UsageBreakdown'
import './usage/UsagePage.css'

export default function UsageSettings() {
    const [preferences, setPreferences] = useState(readUsagePreferences)
    const { metric, days, harness, breakdown, chartView } = preferences
    const { summary, loading, error, refresh } = useUsageSummary(days, harness)
    useEffect(() => saveUsagePreferences(preferences), [preferences])
    const change = (patch: Partial<UsagePagePreferences>) => setPreferences(current => ({ ...current, ...patch }))

    return <div className="usage-page-content">
        <UsageToolbar metric={metric} days={days} harness={harness} summary={summary} busy={loading} onMetric={value => change({ metric: value })} onDays={value => change({ days: value })} onHarness={value => change({ harness: value })} onRefresh={refresh} />
        {error && <SettingsNotice tone="error">{error}{summary ? ' Showing the last successful refresh.' : ''}</SettingsNotice>}
        {!summary ? <p role="status" className="usage-quiet-copy">{error ? 'Usage is unavailable. Refresh to retry.' : 'Loading usage...'}</p> : <>
            <UsageOverview summary={summary} metric={metric} chartView={chartView} onChartView={value => change({ chartView: value })} />
            <SettingsSection title="Token totals" bodyClassName="space-y-5 p-4">
                <UsageTotals totals={summary.totals} />
                <UsageMeasurementCoverage totals={summary.totals} />
            </SettingsSection>
            <UsageBreakdown summary={summary} metric={metric} mode={breakdown} onMode={value => change({ breakdown: value })} />
            <footer className="usage-footer"><p>Model costs include recorded amounts and API-equivalent estimates. They are not subscription charges. {summary.totals.turns > summary.totals.meteredTurns ? `${summary.totals.turns - summary.totals.meteredTurns} records have no token counts. ` : ''}{summary.totals.turns > summary.totals.pricedTurns ? `${summary.totals.turns - summary.totals.pricedTurns} records are unpriced. An asterisk marks partial cost.` : ''}</p><div><span>Updated {new Date(summary.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {summary.timeZone}</span><Link to="/settings/providers/limits">Account limits</Link></div>{summary.sources?.some(source => source.state === 'indexing') && <p role="status">Indexing local history. Totals are still growing.</p>}{summary.sources?.some(source => source.state === 'error') && <p>Some history is unavailable. Check the source menu.</p>}</footer>
        </>}
    </div>
}
