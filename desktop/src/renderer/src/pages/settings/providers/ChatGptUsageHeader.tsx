import type { ReactNode } from 'react'
import type { ChatGptAccountUsageWindow } from '@shared/onboarding/contracts'

export function usageResetDate(value: string | number) {
    return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function usageWindowResetLabel(window: ChatGptAccountUsageWindow | null, now = Date.now()) {
    const reset = window?.resetAt ? Date.parse(window.resetAt) : NaN
    if (!Number.isFinite(reset)) return 'Reset time unavailable'
    if (reset <= now) return 'Reset passed · Refresh to check'
    const hours = Math.floor((reset - now) / 3600000)
    const countdown = hours < 1 ? `in ${Math.max(1, Math.ceil((reset - now) / 60000))}m` : hours >= 24 ? `in ${Math.floor(hours / 24)}d ${hours % 24}h` : `in ${hours}h`
    return `Resets ${countdown}`
}

export function ChatGptUsageHeader({ label, headerAction }: { label: string; headerAction?: ReactNode }) {
    return <header data-chatgpt-usage-header className="mb-2 flex min-h-8 items-center justify-between gap-4 px-1">
        <h3 className="text-[13px] font-medium text-[var(--settings-text-secondary)]">{label}</h3>
        {headerAction}
    </header>
}
