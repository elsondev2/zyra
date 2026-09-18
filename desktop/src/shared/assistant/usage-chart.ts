import { emptyUsageTotals, type UsageSummary, type UsageTotals } from './usage-summary'
export type UsageChartView = 'daily' | 'cumulative' | 'weekly' | 'activity'
export function projectUsageChart(daily: UsageSummary['daily'], view: UsageChartView): UsageSummary['daily'] {
    if (view === 'daily' || view === 'activity') return daily
    const keys = Object.keys(emptyUsageTotals()) as Array<keyof UsageTotals>
    if (view === 'cumulative') {
        const running = emptyUsageTotals()
        return daily.map(day => { for (const key of keys) running[key] += day[key]; return {date:day.date,...running} })
    }
    const weeks = new Map<string,UsageSummary['daily'][number]>()
    for (const day of daily) {
        const date = new Date(day.date+'T12:00:00Z')
        date.setUTCDate(date.getUTCDate() - (date.getUTCDay()+6)%7)
        const monday = date.toISOString().slice(0,10)
        const row = weeks.get(monday) || {date:monday,...emptyUsageTotals()}
        for (const key of keys) row[key] += day[key]
        weeks.set(monday,row)
    }
    return [...weeks.values()]
}
