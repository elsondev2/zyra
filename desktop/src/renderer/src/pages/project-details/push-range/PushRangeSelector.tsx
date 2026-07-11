import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { DiffStats } from '../DiffStats'
import type { PushRangeSelectorProps } from './types'

export function PushRangeSelector({
    commits,
    activeCommitHash,
    onActiveCommitChange,
    onCommitClick,
    className,
    remoteName
}: PushRangeSelectorProps) {
    const PAGE_SIZE = 15
    const [page, setPage] = useState(1)
    const activeIndex = useMemo(
        () => (activeCommitHash ? commits.findIndex((commit) => commit.hash === activeCommitHash) : -1),
        [activeCommitHash, commits]
    )
    const totalPages = Math.max(1, Math.ceil(commits.length / PAGE_SIZE))
    const pageStart = (page - 1) * PAGE_SIZE
    const pageEnd = pageStart + PAGE_SIZE
    const visibleCommits = useMemo(
        () => commits.slice(pageStart, pageEnd),
        [commits, pageStart, pageEnd]
    )
    const rowHeight = 56
    const rowGap = 6
    const rowStep = rowHeight + rowGap
    const graphWidth = 28
    const nodeX = 14
    const graphHeight = visibleCommits.length > 0 ? (visibleCommits.length * rowStep) - rowGap : 0

    useEffect(() => {
        if (page > totalPages) {
            setPage(totalPages)
        }
    }, [page, totalPages])

    useEffect(() => {
        if (activeIndex < 0) {
            return
        }

        const nextPage = Math.floor(activeIndex / PAGE_SIZE) + 1
        if (nextPage !== page) {
            setPage(nextPage)
        }
    }, [activeIndex, page])

    return (
        <div className={cn(className)}>
            <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">Push Range</p>
                    <p className="mt-1 text-xs text-white/55">Click a commit in the local stream to choose the push boundary.</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] text-white/60">
                    {remoteName ? `${remoteName} push boundary` : 'Local stream'}
                </div>
            </div>

            <div className="relative min-w-0">
                <svg className="pointer-events-none absolute top-0 left-0" width={graphWidth} height={graphHeight}>
                    {visibleCommits.map((commit, index) => {
                        const globalIndex = pageStart + index
                        if (index >= visibleCommits.length - 1) {
                            return null
                        }

                        const y = index * rowStep + rowHeight / 2
                        let stroke = 'rgba(255,255,255,0.12)'

                        if (activeIndex >= 0) {
                            if (globalIndex < activeIndex - 1) {
                                stroke = 'rgba(245,158,11,0.6)'
                            } else if (globalIndex === activeIndex - 1 || globalIndex === activeIndex) {
                                stroke = 'rgba(96,165,250,0.78)'
                            } else if (globalIndex > activeIndex) {
                                stroke = 'rgba(52,211,153,0.6)'
                            }
                        }

                        return (
                            <line
                                key={`push-line-${commit.hash}`}
                                x1={nodeX}
                                y1={y + 6}
                                x2={nodeX}
                                y2={(index + 1) * rowStep + (rowHeight / 2) - 6}
                                stroke={stroke}
                                strokeWidth={globalIndex === activeIndex - 1 || globalIndex === activeIndex ? 3 : 2}
                                opacity={0.95}
                            />
                        )
                    })}

                    {visibleCommits.map((commit, index) => {
                        const y = index * rowStep + rowHeight / 2
                        const globalIndex = pageStart + index
                        const isActive = commit.hash === activeCommitHash
                        const isRetained = activeIndex >= 0 && globalIndex < activeIndex
                        const isIncluded = activeIndex >= 0 && globalIndex > activeIndex
                        const stroke = isActive
                            ? '#60a5fa'
                            : isRetained
                                ? '#f59e0b'
                                : isIncluded
                                    ? '#34d399'
                                    : 'rgba(255,255,255,0.35)'
                        const fill = isActive
                            ? 'rgba(96,165,250,0.22)'
                            : isRetained
                                ? 'rgba(245,158,11,0.16)'
                                : isIncluded
                                    ? 'rgba(52,211,153,0.16)'
                                    : '#09090b'

                        return (
                            <circle
                                key={`push-node-${commit.hash}`}
                                cx={nodeX}
                                cy={y}
                                r={isActive ? 6 : 5}
                                fill={fill}
                                stroke={stroke}
                                strokeWidth={isActive ? 3 : 2}
                            />
                        )
                    })}
                </svg>

                <div className="min-w-0" style={{ marginLeft: graphWidth + 8 }}>
                    {visibleCommits.map((commit, index) => {
                        const globalIndex = pageStart + index
                        const isActive = commit.hash === activeCommitHash
                        const isRetained = activeIndex >= 0 && globalIndex < activeIndex
                        const isIncluded = activeIndex >= 0 && globalIndex > activeIndex

                        return (
                            <div
                                key={commit.hash}
                                className={cn(
                                    'group flex items-center justify-between rounded-xl border pl-3 pr-2 transition-colors',
                                    isActive
                                        ? 'border-blue-400/25 bg-blue-400/10 hover:bg-blue-400/15'
                                        : isRetained
                                            ? 'border-amber-400/15 bg-amber-400/6 hover:bg-amber-400/10'
                                            : isIncluded
                                                ? 'border-emerald-400/15 bg-emerald-400/6 hover:bg-emerald-400/10'
                                                : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]'
                                )}
                                style={{
                                    height: rowHeight,
                                    marginBottom: index === visibleCommits.length - 1 ? 0 : rowGap
                                }}
                            >
                                <button
                                    type="button"
                                    onClick={() => onCommitClick?.(commit)}
                                    className="flex min-w-0 flex-1 items-center justify-between gap-3 py-2 text-left"
                                >
                                    <div className="min-w-0 pr-4">
                                        <div className="mb-0.5 flex items-center gap-2">
                                            <span className="truncate text-sm font-medium text-white">{commit.message}</span>
                                            {isActive ? (
                                                <span className="rounded-full border border-blue-400/20 bg-blue-400/12 px-2 py-0.5 text-[10px] font-medium text-blue-100">
                                                    Target
                                                </span>
                                            ) : isRetained ? (
                                                <span className="rounded-full border border-amber-400/20 bg-amber-400/12 px-2 py-0.5 text-[10px] font-medium text-amber-200">
                                                    Stay local
                                                </span>
                                            ) : isIncluded ? (
                                                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/12 px-2 py-0.5 text-[10px] font-medium text-emerald-100">
                                                    Included
                                                </span>
                                            ) : null}
                                        </div>
                                        <div className="mt-1 flex items-center gap-3 text-[11px] text-white/40">
                                            <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-white/50">{commit.shortHash}</span>
                                            <span>{commit.author}</span>
                                            <span>{new Date(commit.date).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                    <div className="shrink-0">
                                        <DiffStats
                                            additions={commit.additions}
                                            deletions={commit.deletions}
                                            compact
                                            loading={commit.statsLoaded === false}
                                        />
                                    </div>
                                </button>
                                <div className="shrink-0 pl-3">
                                    <button
                                        type="button"
                                        onClick={() => onActiveCommitChange(commit.hash)}
                                        className={cn(
                                            'rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-colors',
                                            isActive
                                                ? 'border-blue-400/25 bg-blue-400/15 text-blue-100'
                                                : 'border-white/10 bg-white/[0.03] text-white/70 hover:border-white/20 hover:bg-white/[0.05] hover:text-white'
                                        )}
                                    >
                                        {isActive ? 'Selected' : 'Set Target'}
                                    </button>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            {totalPages > 1 && (
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/5 pt-3">
                    <p className="text-xs text-white/45">
                        Showing {pageStart + 1}-{Math.min(pageEnd, commits.length)} of {commits.length} local commits.
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setPage((current) => Math.max(1, current - 1))}
                            disabled={page <= 1}
                            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70 transition-colors hover:border-white/20 hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            Previous
                        </button>
                        <span className="text-xs text-white/45">
                            {page} / {totalPages}
                        </span>
                        <button
                            type="button"
                            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                            disabled={page >= totalPages}
                            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70 transition-colors hover:border-white/20 hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
