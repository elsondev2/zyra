import { cn } from '@/lib/utils'

const TREE_ROW_WIDTHS = ['58%', '72%', '46%', '64%', '39%', '69%', '52%', '61%', '43%']
const TREE_ROW_DEPTHS = [0, 1, 1, 0, 1, 2, 0, 1, 0]

export function PreviewTreeSkeleton({
    rows = 9,
    compact = false,
    className
}: {
    rows?: number
    compact?: boolean
    className?: string
}) {
    return (
        <div
            className={cn('min-h-0 w-full overflow-hidden px-2 py-2', className)}
            role="status"
            aria-label="Loading project files"
        >
            <div className="flex flex-col" aria-hidden="true">
                {Array.from({ length: rows }, (_, index) => {
                    const depth = TREE_ROW_DEPTHS[index % TREE_ROW_DEPTHS.length]
                    const width = TREE_ROW_WIDTHS[index % TREE_ROW_WIDTHS.length]
                    return (
                        <div
                            key={index}
                            className={cn('flex items-center gap-1.5', compact ? 'h-6' : 'h-8')}
                            style={{ paddingLeft: `${depth * 12}px` }}
                        >
                            <span className="size-3 shrink-0 rounded-[3px] bg-sparkle-text/[0.045]" />
                            <span className={cn('shrink-0 rounded-[4px] bg-sparkle-text/[0.07]', compact ? 'size-3.5' : 'size-4')} />
                            <span
                                className="h-2.5 max-w-[190px] animate-pulse rounded-[3px] bg-sparkle-text/[0.065] motion-reduce:animate-none"
                                style={{ width }}
                            />
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

export function PreviewContentSkeleton({
    className,
    label = 'Loading file...'
}: {
    className?: string
    label?: string
}) {
    return (
        <div
            className={cn('flex h-full min-h-[16rem] w-full items-center justify-center overflow-hidden bg-sparkle-card px-6 text-center', className)}
            role="status"
            aria-live="polite"
            aria-label={label}
        >
            <span className="text-[11px] font-medium text-sparkle-text-muted/70">{label}</span>
        </div>
    )
}
