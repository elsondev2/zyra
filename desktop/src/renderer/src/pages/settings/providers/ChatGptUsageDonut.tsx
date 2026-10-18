export function ChatGptUsageDonut({ percent, label }: { percent: number; label?: string }) {
    if (!Number.isFinite(percent)) return null
    const value = Math.max(0, Math.min(100, percent))
    return <svg data-chatgpt-usage-donut data-value={value}
        width="18" height="18" viewBox="0 0 20 20" className="shrink-0"
        role={label ? 'meter' : undefined} aria-label={label} aria-hidden={label ? undefined : true}
        aria-valuemin={label ? 0 : undefined} aria-valuemax={label ? 100 : undefined} aria-valuenow={label ? value : undefined}>
        <circle cx="10" cy="10" r="7.5" fill="none" stroke="var(--settings-track)" strokeWidth="2.5" />
        <circle className="chatgpt-usage-ring" cx="10" cy="10" r="7.5" fill="none" stroke="var(--accent-primary)" strokeWidth="2.5"
            pathLength="100" strokeDasharray={`${value} ${100 - value}`} transform="rotate(-90 10 10)" />
    </svg>
}
