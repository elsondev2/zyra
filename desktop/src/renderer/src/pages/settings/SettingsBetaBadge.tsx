import { cn } from '@/lib/utils'

export function SettingsBetaBadge({
    className,
    compact = false
}: {
    className?: string
    compact?: boolean
}) {
    return (
        <span
            className={cn(
                'inline-flex items-center rounded-full border border-fuchsia-400/25 bg-fuchsia-500/10 font-semibold uppercase tracking-[0.18em] text-fuchsia-200',
                compact ? 'px-2 py-0.5 text-[9px]' : 'px-2.5 py-1 text-[10px]',
                className
            )}
        >
            Beta
        </span>
    )
}
