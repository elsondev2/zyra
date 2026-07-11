import { cn } from '@/lib/utils'

interface DiffStatsProps {
    additions?: number
    deletions?: number
    compact?: boolean
    className?: string
    loading?: boolean
    preserveValuesWhileLoading?: boolean
    showBar?: boolean
}

export function DiffStats({
    additions = 0,
    deletions = 0,
    compact = false,
    className,
    loading = false,
    preserveValuesWhileLoading = false,
    showBar = true
}: DiffStatsProps) {
    const safeAdditions = Math.max(0, additions)
    const safeDeletions = Math.max(0, deletions)
    const total = safeAdditions + safeDeletions
    const addRatio = total > 0 ? (safeAdditions / total) * 100 : 0
    const delRatio = total > 0 ? (safeDeletions / total) * 100 : 0

    if (loading && !preserveValuesWhileLoading) {
        return (
            <div className={cn('flex items-center gap-2', className)} aria-label="Loading diff stats">
                <span className={cn(compact ? 'text-[10px]' : 'text-xs', 'animate-pulse font-mono text-sparkle-text-secondary/60')}>
                    +...
                </span>
                <span className={cn(compact ? 'text-[10px]' : 'text-xs', 'animate-pulse font-mono text-sparkle-text-secondary/60')}>
                    -...
                </span>
                {showBar ? (
                    <div className={cn(compact ? 'h-1.5 w-16' : 'h-2 w-24', 'overflow-hidden rounded-none bg-[color-mix(in_srgb,var(--color-text)_8%,transparent)]')}>
                        <div className="h-full w-full animate-pulse bg-[color-mix(in_srgb,var(--color-text)_12%,transparent)]" />
                    </div>
                ) : null}
            </div>
        )
    }

    return (
        <div className={cn('flex items-center gap-2', className)}>
            <span className={cn(
                compact ? 'text-[10px]' : 'text-xs',
                'font-mono text-emerald-400',
                loading && preserveValuesWhileLoading && 'opacity-85'
            )}>
                +{safeAdditions}
            </span>
            <span className={cn(
                compact ? 'text-[10px]' : 'text-xs',
                'font-mono text-rose-400',
                loading && preserveValuesWhileLoading && 'opacity-85'
            )}>
                -{safeDeletions}
            </span>
            {showBar ? (
                <div className={cn(
                    compact ? 'h-1.5 w-16' : 'h-2 w-24',
                    'overflow-hidden rounded-none bg-[color-mix(in_srgb,var(--color-text)_10%,transparent)]',
                    loading && preserveValuesWhileLoading && 'relative'
                )}>
                    {total > 0 ? (
                        <div className="flex h-full w-full">
                            <div className="h-full bg-emerald-500/90" style={{ width: `${addRatio}%` }} />
                            <div className="h-full bg-rose-500/90" style={{ width: `${delRatio}%` }} />
                        </div>
                    ) : (
                        <div className="h-full w-full bg-[color-mix(in_srgb,var(--color-text)_14%,transparent)]" />
                    )}
                    {loading && preserveValuesWhileLoading ? (
                        <div className="pointer-events-none absolute inset-0 animate-pulse bg-[color-mix(in_srgb,var(--color-text)_8%,transparent)]" />
                    ) : null}
                </div>
            ) : null}
        </div>
    )
}
