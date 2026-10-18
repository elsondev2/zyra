import { SettingsSection } from '../settings-layout'

export function ChatGptLimitsLoading() {
    return <div data-chatgpt-limits-loading aria-busy="true" role="status" aria-label="Loading ChatGPT limits">
        <span className="sr-only">Loading ChatGPT limits…</span>
        <SettingsSection title="ChatGPT usage" displayTitle={<span aria-hidden="true" className="h-3 w-24 rounded bg-[var(--settings-track)]" />} headerAction={<span aria-hidden="true" className="size-4 rounded bg-[var(--settings-track)]" />}>
            <div aria-hidden="true">
                {[0, 1].map(row => <div key={row} className="flex min-h-[72px] items-center justify-between gap-6 border-b border-[var(--settings-row-divider)] px-4 py-3 last:border-b-0">
                    <div className="space-y-2"><div className="h-3 w-28 rounded bg-[var(--settings-track)]" /><div className="h-2 w-36 rounded bg-[var(--settings-track)]" /></div>
                    <div className="flex items-center gap-2"><div className="size-[18px] rounded-full border-2 border-[var(--settings-track)]" /><div className="space-y-2"><div className="h-3 w-20 rounded bg-[var(--settings-track)]" /><div className="h-2 w-24 rounded bg-[var(--settings-track)]" /></div></div>
                </div>)}
            </div>
        </SettingsSection>
    </div>
}
