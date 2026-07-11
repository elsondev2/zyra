import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { RateLimitCard, UsageMode } from './assistant-account-rate-limits'

const LEVEL_COLORS = {
    good: '#34d399',
    warn: '#fbbf24',
    danger: '#f87171'
} as const

function useAnimatedNumber(target: number, duration = 450): number {
    const [value, setValue] = useState(target)
    const rafRef = useRef<number | null>(null)
    const currentRef = useRef(target)

    useEffect(() => {
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current)
            rafRef.current = null
        }
        const from = currentRef.current
        if (from === target) return
        const start = performance.now()
        const animate = (now: number) => {
            const t = Math.min((now - start) / duration, 1)
            const eased = 1 - Math.pow(1 - t, 3)
            const next = Math.round(from + (target - from) * eased)
            currentRef.current = next
            setValue(next)
            if (t < 1) {
                rafRef.current = requestAnimationFrame(animate)
            } else {
                currentRef.current = target
                setValue(target)
                rafRef.current = null
            }
        }
        rafRef.current = requestAnimationFrame(animate)
        return () => {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current)
                rafRef.current = null
            }
        }
    }, [target, duration])

    return value
}

function clampPercent(value: number): number {
    if (!Number.isFinite(value)) return 0
    return Math.max(0, Math.min(100, value))
}

export function AccountField({
    icon,
    label,
    value,
    accent
}: {
    icon: React.ReactNode
    label: string
    value: string
    accent?: boolean
}) {
    return (
        <div className="group rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3.5 transition-colors hover:border-white/20 hover:bg-white/[0.05]">
            <div className="mb-2 flex items-center gap-2 text-sparkle-text-muted">
                {icon}
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em]">{label}</span>
            </div>
            <p className={cn(
                'text-sm font-medium',
                accent ? 'text-[var(--accent-primary)]' : 'text-sparkle-text'
            )}>{value}</p>
        </div>
    )
}

export function RateLimitUsageCard({ card, mode }: { card: RateLimitCard; mode: UsageMode }) {
    const pct = clampPercent(card.percent)
    const animatedPct = useAnimatedNumber(Math.round(pct), 650)
    const level: 'good' | 'warn' | 'danger' = mode === 'remaining'
        ? pct >= 40 ? 'good' : pct >= 20 ? 'warn' : 'danger'
        : pct <= 60 ? 'good' : pct <= 80 ? 'warn' : 'danger'
    const color = LEVEL_COLORS[level]

    return (
        <article className="flex flex-col gap-3 rounded-xl border border-white/10 bg-sparkle-card p-4 transition-colors hover:border-white/20">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-sparkle-text">{card.bucketLabel}</p>
                    <p className="mt-0.5 text-xs text-sparkle-text-muted">{card.durationLabel}</p>
                </div>
                {(card.planLabel || card.creditLabel) ? (
                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                        {card.planLabel ? (
                            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-sparkle-text-muted">
                                {card.planLabel}
                            </span>
                        ) : null}
                        {card.creditLabel ? (
                            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-sparkle-text-muted">
                                {card.creditLabel}
                            </span>
                        ) : null}
                    </div>
                ) : null}
            </div>
            <div>
                <div className="mb-2 flex items-baseline justify-between gap-2">
                    <span
                        className="text-2xl font-semibold tabular-nums"
                        style={{ color, transition: 'color 0.4s ease' }}
                    >
                        {animatedPct}%
                    </span>
                    <span className="text-xs text-sparkle-text-secondary">{card.percentLabel}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                    <div
                        className="h-full rounded-full"
                        style={{
                            width: `${animatedPct}%`,
                            backgroundColor: color,
                            boxShadow: `0 0 12px ${color}22`,
                            transition: 'background-color 0.45s ease, box-shadow 0.45s ease'
                        }}
                    />
                </div>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] pt-2">
                <span className="text-xs text-sparkle-text-secondary">{card.resetSummary}</span>
                <span className="text-[10px] text-sparkle-text-muted">{card.resetAbsolute}</span>
            </div>
        </article>
    )
}
