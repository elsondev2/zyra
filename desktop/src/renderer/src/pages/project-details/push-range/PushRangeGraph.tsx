import { useMemo } from 'react'
import { Cloud, GitCommitHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DiffStats } from '../DiffStats'
import type { PushRangePreviewProps } from './types'
import { buildPreviewRows, formatCommitCount, getRoleTone } from './utils'

function PushRangeGraph({
    summary,
    compact = false,
    className,
    showCloudBoundary = true,
    remoteName
}: PushRangePreviewProps) {
    const rows = useMemo(
        () => buildPreviewRows(summary, compact, showCloudBoundary),
        [summary, compact, showCloudBoundary]
    )

    return (
        <div className={cn('rounded-xl border border-white/10 bg-sparkle-card p-3', className)}>
            <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">Push Range</p>
                    <p className="mt-1 text-xs text-white/55">
                        {formatCommitCount(summary.commitsToPush.length, 'commit')} will push.
                        {' '}
                        {formatCommitCount(summary.newerLocalCommits.length, 'commit')} stays local.
                    </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/60">
                    {remoteName || 'remote'}
                </div>
            </div>

            <div className="space-y-2">
                {rows.map((row, index) => {
                    const isLastRow = index === rows.length - 1

                    if (row.kind === 'collapsed-local') {
                        return (
                            <div key={`collapsed-local-${index}`} className="flex items-start gap-3">
                                <div className="flex w-5 flex-col items-center">
                                    <div className="h-2 w-2 rounded-full bg-amber-400/75" />
                                    {!isLastRow && <div className="mt-1 h-7 w-px bg-amber-400/35" />}
                                </div>
                                <div className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-white/50">
                                    +{row.count} newer local {row.count === 1 ? 'commit' : 'commits'}
                                </div>
                            </div>
                        )
                    }

                    if (row.kind === 'collapsed-push') {
                        return (
                            <div key={`collapsed-push-${index}`} className="flex items-start gap-3">
                                <div className="flex w-5 flex-col items-center">
                                    <div className="h-2 w-2 rounded-full bg-emerald-400/75" />
                                    {!isLastRow && <div className="mt-1 h-7 w-px bg-emerald-400/35" />}
                                </div>
                                <div className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-white/50">
                                    +{row.count} more included {row.count === 1 ? 'commit' : 'commits'}
                                </div>
                            </div>
                        )
                    }

                    if (row.kind === 'cloud-boundary') {
                        return (
                            <div key={`cloud-${index}`} className="flex items-start gap-3">
                                <div className="flex w-5 flex-col items-center">
                                    <div className="flex h-4 w-4 items-center justify-center rounded-full border border-emerald-400/25 bg-emerald-400/12 text-emerald-100">
                                        <Cloud size={10} />
                                    </div>
                                </div>
                                <div className="min-w-0 flex-1 rounded-lg border border-emerald-400/20 bg-emerald-400/8 px-3 py-2 text-[11px] text-emerald-100/85">
                                    {remoteName || 'Remote'} catches up here after this push.
                                </div>
                            </div>
                        )
                    }

                    const tone = getRoleTone(row.role)

                    return (
                        <div key={row.commit.hash} className="flex items-start gap-3">
                            <div className="flex w-5 flex-col items-center">
                                <div className={cn('h-2.5 w-2.5 rounded-full', tone.dotClassName)} />
                                {!isLastRow && <div className={cn('mt-1 h-9 w-px', tone.lineClassName)} />}
                            </div>
                            <div className={cn('group min-w-0 flex-1 rounded-xl py-2.5 pl-3 pr-2 transition-colors', tone.rowClassName)}>
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 pr-4">
                                        <div className="mb-0.5 flex items-center gap-2">
                                            <GitCommitHorizontal size={12} className="shrink-0 text-white/40" />
                                            <span className="truncate text-sm font-medium text-white">{row.commit.message}</span>
                                            <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium', tone.badgeClassName)}>
                                                {tone.badgeLabel}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3 text-[11px] text-white/40">
                                            <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-white/50">{row.commit.shortHash}</span>
                                            <span>{row.commit.author}</span>
                                            {!compact && <span>{new Date(row.commit.date).toLocaleDateString()}</span>}
                                        </div>
                                    </div>
                                    <div className="shrink-0">
                                        <DiffStats
                                            additions={row.commit.additions}
                                            deletions={row.commit.deletions}
                                            compact
                                            loading={row.commit.statsLoaded === false}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

export function PushRangePreview(props: PushRangePreviewProps) {
    return <PushRangeGraph {...props} />
}

export { PushRangeGraph }
