import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDownCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PushRangeGraph, PushRangePreview } from './push-range/PushRangeGraph'
import { PushRangeSelector } from './push-range/PushRangeSelector'
import type { PushRangeConfirmModalProps } from './push-range/types'
import { buildPushRangeSummary, formatCommitCount } from './push-range/utils'

export { buildPushRangeSummary, PushRangePreview, PushRangeSelector }
export type {
    PreviewRow,
    PushRangeConfirmModalProps,
    PushRangePreviewProps,
    PushRangeSelectorProps,
    PushRangeSummary
} from './push-range/types'

export function PushRangeConfirmModal({
    isOpen,
    summary,
    isPushing = false,
    dontShowAgain,
    setDontShowAgain,
    remoteName,
    onCancel,
    onConfirm
}: PushRangeConfirmModalProps) {
    const [showAll, setShowAll] = useState(false)

    useEffect(() => {
        if (!isOpen) {
            setShowAll(false)
            return
        }

        const originalOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'

        return () => {
            document.body.style.overflow = originalOverflow
        }
    }, [isOpen])

    if (!isOpen || !summary || typeof document === 'undefined') {
        return null
    }

    return createPortal(
        <div
            className="fixed inset-0 z-[140] flex animate-fadeIn items-center justify-center bg-black/60 backdrop-blur-md"
            onClick={onCancel}
        >
            <div
                className="m-4 flex max-h-[95vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-sparkle-card shadow-2xl"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="border-b border-white/10 bg-white/[0.02] px-6 py-5">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-[11px] uppercase tracking-[0.2em] text-white/35">Confirm Partial Push</p>
                            <h3 className="mt-1 text-lg font-semibold text-white">Push up to this commit?</h3>
                            <p className="mt-2 text-sm text-white/60">
                                This will send {formatCommitCount(summary.commitsToPush.length, 'commit')} to {remoteName || 'remote'} and leave {formatCommitCount(summary.newerLocalCommits.length, 'newer local commit', 'newer local commits')} on this device.
                            </p>
                        </div>
                        <div className="shrink-0 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-right">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">Target</p>
                            <p className="mt-1 text-sm font-medium text-white/90">{summary.selectedCommit.shortHash}</p>
                        </div>
                    </div>
                </div>

                <div className="project-surface-scrollbar flex-1 overflow-y-auto px-6 py-5">
                    <div className="mb-4 grid gap-3 md:grid-cols-3">
                        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">Will Push</p>
                            <p className="mt-2 text-2xl font-semibold text-emerald-100">{summary.commitsToPush.length}</p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">Stays Local</p>
                            <p className="mt-2 text-2xl font-semibold text-amber-100">{summary.newerLocalCommits.length}</p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">Selected</p>
                            <p className="mt-2 truncate text-sm font-medium text-white/88">{summary.selectedCommit.message}</p>
                        </div>
                    </div>

                    <PushRangeGraph summary={summary} compact={!showAll} showCloudBoundary className="border-white/10" remoteName={remoteName} />

                    <div className="mt-4 flex items-center justify-between gap-3">
                        <button
                            type="button"
                            onClick={() => setShowAll((value) => !value)}
                            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/70 transition-all hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
                        >
                            <ArrowDownCircle size={14} className={cn('transition-transform', showAll && 'rotate-180')} />
                            {showAll ? 'Show Smaller Subset' : 'Show Full Commit Chain'}
                        </button>
                        <p className="text-xs text-white/40">
                            Review the exact chain before approving the push.
                        </p>
                    </div>
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-white/10 bg-white/[0.02] px-6 py-4">
                    <label className="inline-flex cursor-pointer items-center gap-3 text-sm text-white/70">
                        <input
                            type="checkbox"
                            checked={dontShowAgain}
                            onChange={(event) => setDontShowAgain(event.target.checked)}
                            className="h-4 w-4 rounded border border-white/20 bg-transparent accent-[var(--accent-primary)]"
                        />
                        <span>Don't show again</span>
                    </label>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="rounded-lg border border-white/10 px-3.5 py-2 text-sm text-white/65 transition-all hover:border-white/20 hover:bg-white/[0.04] hover:text-white"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={onConfirm}
                            disabled={isPushing}
                            className="rounded-lg border border-blue-400/25 bg-blue-400/12 px-4 py-2 text-sm font-medium text-blue-100 transition-all hover:bg-blue-400/20 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            {isPushing ? 'Pushing...' : 'Approve Push Range'}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    )
}
