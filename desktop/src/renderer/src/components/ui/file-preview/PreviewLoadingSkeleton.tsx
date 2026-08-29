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

const CONTENT_LINE_WIDTHS = ['54%', '76%', '68%', '39%', '72%', '61%', '81%', '46%', '66%', '58%', '74%', '35%']

export function PreviewContentSkeleton({ className }: { className?: string }) {
    return (
        <div
            className={cn('flex h-full min-h-[16rem] w-full overflow-hidden bg-sparkle-card', className)}
            role="status"
            aria-label="Loading file preview"
        >
            <div className="w-12 shrink-0 border-r border-[var(--surface-divider)]/70 px-2 py-4" aria-hidden="true">
                {CONTENT_LINE_WIDTHS.map((_, index) => (
                    <span key={index} className="mb-2.5 block h-2 w-full rounded-[2px] bg-sparkle-text/[0.035]" />
                ))}
            </div>
            <div className="min-w-0 flex-1 px-4 py-4" aria-hidden="true">
                {CONTENT_LINE_WIDTHS.map((width, index) => (
                    <span
                        key={index}
                        className="mb-2.5 block h-2 animate-pulse rounded-[2px] bg-sparkle-text/[0.055] motion-reduce:animate-none"
                        style={{ width, marginLeft: index === 2 || index === 3 || index === 7 ? 18 : 0 }}
                    />
                ))}
            </div>
            <div className="hidden w-16 shrink-0 border-l border-[var(--surface-divider)]/60 px-2 py-4 sm:block" aria-hidden="true">
                <span className="block h-24 w-full rounded-[2px] bg-sparkle-text/[0.035]" />
            </div>
        </div>
    )
}
