import { ExternalLink, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type PreviewHeaderStatusActionsProps = {
    showCloseButton?: boolean
    isIdeChrome?: boolean
    isEditMode: boolean
    isHtml: boolean
    isCsv: boolean
    csvDistinctColorsEnabled: boolean
    onCsvDistinctColorsEnabledChange: (enabled: boolean) => void
    onOpenInBrowser: () => void
    onClose: () => void
    controlGroupClass: string
}

export function PreviewHeaderStatusActions({
    showCloseButton = true,
    isIdeChrome = false,
    isEditMode,
    isHtml,
    isCsv,
    csvDistinctColorsEnabled,
    onCsvDistinctColorsEnabledChange,
    onOpenInBrowser,
    onClose,
    controlGroupClass
}: PreviewHeaderStatusActionsProps) {
    return (
        <div className="flex min-w-0 self-stretch flex-wrap items-center justify-end gap-1">
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-1">
                {isHtml && !isEditMode && (
                    <button
                        onClick={onOpenInBrowser}
                        className={cn(
                            isIdeChrome
                                ? 'inline-flex h-7 w-7 items-center justify-center rounded-md text-xs text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white'
                                : 'inline-flex h-6 w-6 items-center justify-center rounded-md text-xs text-white/60 transition-colors hover:bg-white/10 hover:text-white'
                        )}
                        title="Open in Browser"
                        aria-label="Open in browser"
                    >
                        <ExternalLink size={14} />
                        <span className="sr-only">Open</span>
                    </button>
                )}
                {isCsv && (
                    <div className={cn(
                        'flex items-center',
                        isIdeChrome
                            ? 'gap-1.5 rounded-md border border-white/[0.07] bg-white/[0.03] px-1.5 py-1'
                            : 'gap-1.5 rounded-md border border-white/10 bg-white/5 px-1.5 py-1'
                    )}>
                        <span className={cn(isIdeChrome ? 'text-[11px] text-white/45' : 'text-xs text-white/60')}>
                            {isIdeChrome ? 'Columns' : 'Column Colors'}
                        </span>
                        <button
                            type="button"
                            onClick={() => onCsvDistinctColorsEnabledChange(!csvDistinctColorsEnabled)}
                            className="group"
                            title={csvDistinctColorsEnabled ? 'Disable distinct column colors' : 'Enable distinct column colors'}
                            aria-pressed={csvDistinctColorsEnabled}
                        >
                            <span className={cn(
                                'inline-flex items-center rounded-full transition-colors',
                                isIdeChrome ? 'h-4 w-7' : 'h-5 w-9',
                                csvDistinctColorsEnabled ? 'bg-emerald-400/80' : 'bg-white/20'
                            )}>
                                <span className={cn(
                                    'rounded-full bg-white shadow transition-transform',
                                    isIdeChrome ? 'h-3 w-3' : 'h-4 w-4',
                                    csvDistinctColorsEnabled
                                        ? (isIdeChrome ? 'translate-x-3.5' : 'translate-x-4')
                                        : 'translate-x-0.5'
                                )} />
                            </span>
                        </button>
                    </div>
                )}
            </div>

            {showCloseButton && (
                <button
                    onClick={onClose}
                    className={cn(
                        'shrink-0 items-center justify-center transition-colors',
                        isIdeChrome
                            ? 'inline-flex h-7 w-7 rounded-md border border-transparent text-white/45 hover:bg-white/[0.06] hover:text-white'
                            : 'inline-flex -my-1 self-stretch border-l border-white/5 px-3.5 text-white/42 hover:border-red-400/25 hover:bg-red-500/[0.22] hover:text-red-100'
                    )}
                    title="Close (Esc)"
                >
                    <X size={isIdeChrome ? 15 : 16} />
                </button>
            )}
        </div>
    )
}
