import type { UsageTotals as Totals } from '@shared/assistant/usage-summary'
import { formatUsageTokens } from './usage-presentation'

const fields = [['input', 'Uncached input'], ['cached', 'Cached input'], ['output', 'Output'], ['cacheWrite', 'Cache write']] as const
export function UsageTotals({ totals }: { totals: Totals }) {
    const measured = totals.meteredTurns > 0 || totals.turns === 0
    return <section className="usage-token-summary" aria-label="Usage totals">
        <div className="usage-token-total"><span>Processed tokens</span><strong title={totals.tokens.toLocaleString()}>{measured ? formatUsageTokens(totals.tokens) : '—'}</strong></div>
        <dl className="usage-totals">{fields.map(([key, label]) => <div key={key}><dt>{label}</dt><dd title={totals[key].toLocaleString()}>{measured ? formatUsageTokens(totals[key]) : '—'}</dd></div>)}</dl>
    </section>
}
