import type { UsageSummary } from '@shared/assistant/usage-summary'
import type { UsageChartView } from '@shared/assistant/usage-chart'
import { SettingsInfoTooltip } from '../SettingsInfoTooltip'
import { SettingsProviderIcon } from '../SettingsProviderIcon'
import { formatUsageMeasurement, groupUsageRows, hasUsageValue, usageMetricValue } from './usage-presentation'
import { UsageTrendChart } from './UsageTrendChart'
import { SettingsSection } from '../settings-layout'

export function UsageOverview({ summary, metric, chartView, onChartView }: { summary: UsageSummary; metric: 'cost' | 'tokens'; chartView: UsageChartView; onChartView: (value: UsageChartView) => void }) {
    const tools = groupUsageRows(summary, 'harness', metric)
    return <SettingsSection title="Token activity" hideHeader bodyClassName="p-4">
        <div className="usage-overview">
        <div className="usage-headline-column"><div className="usage-headline"><span>{metric === 'cost' ? 'Model cost' : 'Processed tokens'}</span><strong data-usage-headline title={hasUsageValue(summary.totals, metric) ? usageMetricValue(summary.totals, metric).toLocaleString() : 'Usage is not metered'}>{hasUsageValue(summary.totals, metric) ? formatUsageMeasurement(summary.totals, metric) : '—'}</strong><span>{summary.totals.turns.toLocaleString()} records{metric === 'cost' ? ' · API value' : ''}{metric === 'cost' && <SettingsInfoTooltip label="About usage cost">Recorded model costs and API-equivalent estimates. This is not your subscription bill. An asterisk marks partial measurements.</SettingsInfoTooltip>}</span></div>
            <div className="usage-tool-list" aria-label="Usage by tool">{tools.map(row => <div key={row.id} className="usage-tool-summary"><span className="usage-tool-name"><SettingsProviderIcon provider={row.harness === 'zyra-cli' ? 'zyra' : row.harness || ''} size={15} /><strong>{row.label}</strong></span><strong>{formatUsageMeasurement(row.totals, metric)}</strong></div>)}</div>
            {!tools.length && <p className="usage-quiet-copy">No recorded activity in this period.</p>}
        </div>
        <UsageTrendChart daily={summary.daily} metric={metric} view={chartView} onViewChange={onChartView} />
        </div>
    </SettingsSection>
}
