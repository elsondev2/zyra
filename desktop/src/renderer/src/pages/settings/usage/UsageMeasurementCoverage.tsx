import type { UsageTotals } from '@shared/assistant/usage-summary'

export function UsageMeasurementCoverage({ totals }: { totals: UsageTotals }) {
    return <dl className="usage-measurement-coverage" aria-label="Measurement coverage">
        <div><dt>Token counts</dt><dd>{totals.meteredTurns.toLocaleString()} of {totals.turns.toLocaleString()} records</dd></div>
        <div><dt>Prices available</dt><dd>{totals.pricedTurns.toLocaleString()} of {totals.turns.toLocaleString()} records</dd></div>
    </dl>
}
