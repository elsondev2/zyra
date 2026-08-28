import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export function PreviewHistoryNavigation({
    canGoBack,
    canGoForward,
    onBack,
    onForward,
    expanded = false
}: {
    canGoBack: boolean
    canGoForward: boolean
    onBack: () => void
    onForward: () => void
    expanded?: boolean
}) {
    const buttonClass = 'inline-flex h-6 w-6 items-center justify-center rounded-[5px] text-sparkle-text-muted transition-colors hover:bg-[var(--surface-hover)] hover:text-sparkle-text disabled:cursor-default disabled:text-sparkle-text-muted/25 disabled:hover:bg-transparent'

    return (
        <div className={cn(
            'flex shrink-0 items-center gap-0.5',
            expanded ? 'h-full px-1' : 'px-0.5'
        )} aria-label="File preview history">
            <button
                type="button"
                onClick={onBack}
                disabled={!canGoBack}
                className={buttonClass}
                title={canGoBack ? 'Back to previous file' : 'No previous file'}
                aria-label="Back to previous file"
            >
                <ChevronLeft size={15} />
            </button>
            <button
                type="button"
                onClick={onForward}
                disabled={!canGoForward}
                className={buttonClass}
                title={canGoForward ? 'Forward to next file' : 'No next file'}
                aria-label="Forward to next file"
            >
                <ChevronRight size={15} />
            </button>
        </div>
    )
}
