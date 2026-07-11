import { Loader2 } from 'lucide-react'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { readProjectGitOverview } from '@/lib/projectGitOverview'
import { getCachedProjectGitSnapshot } from '@/lib/projectViewCache'
import { cn } from '@/lib/utils'
import { DiffStats } from '../project-details/DiffStats'

type AssistantProjectGitChipProps = {
    projectPath?: string | null
    refreshToken?: string | number | null
    variant?: 'header' | 'menu'
}

type GitSummaryState = {
    isGitRepo: boolean
    loading: boolean
    resolved: boolean
    additions: number
    deletions: number
}

type GitSummaryCacheEntry = {
    refreshKey: string
    state: Omit<GitSummaryState, 'loading'>
}

const INITIAL_STATE: GitSummaryState = {
    isGitRepo: false,
    loading: false,
    resolved: false,
    additions: 0,
    deletions: 0
}

const gitSummaryCache = new Map<string, GitSummaryCacheEntry>()

function GitHubMark({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 16 16" aria-hidden="true" className={className} fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
        </svg>
    )
}

function computeStatusTotals(entries: Array<{ additions?: number; deletions?: number }>) {
    return entries.reduce<{ additions: number; deletions: number }>((summary, entry) => ({
        additions: summary.additions + Math.max(0, Number(entry.additions) || 0),
        deletions: summary.deletions + Math.max(0, Number(entry.deletions) || 0)
    }), { additions: 0, deletions: 0 })
}

export const AssistantProjectGitChip = memo(function AssistantProjectGitChip({
    projectPath,
    refreshToken,
    variant = 'header'
}: AssistantProjectGitChipProps) {
    const normalizedProjectPath = useMemo(() => String(projectPath || '').trim(), [projectPath])
    const refreshKey = useMemo(() => String(refreshToken ?? ''), [refreshToken])
    const requestIdRef = useRef(0)
    const [state, setState] = useState<GitSummaryState>(INITIAL_STATE)

    useEffect(() => {
        if (!normalizedProjectPath) {
            setState(INITIAL_STATE)
            return
        }

        const cached = gitSummaryCache.get(normalizedProjectPath) || null
        if (cached) {
            setState({
                ...cached.state,
                loading: false
            })
            if (cached.refreshKey === refreshKey) {
                return
            }
        }

        let cancelled = false
        const requestId = ++requestIdRef.current

        if (!cached) {
            setState((current) => ({
                ...current,
                loading: true
            }))
        }

        void (async () => {
            try {
                const cachedGitSnapshot = getCachedProjectGitSnapshot(normalizedProjectPath)
                const cachedEntries = Array.isArray(cachedGitSnapshot?.gitStatusDetails)
                    ? cachedGitSnapshot.gitStatusDetails
                    : []
                const hasFullyLoadedCachedStats = cachedEntries.length > 0 && cachedEntries.every((entry) => entry.statsLoaded === true)
                if (cachedGitSnapshot?.isGitRepo === true && hasFullyLoadedCachedStats) {
                    const cachedTotals = computeStatusTotals(cachedEntries)
                    setState({
                        isGitRepo: true,
                        loading: true,
                        resolved: true,
                        additions: cachedTotals.additions,
                        deletions: cachedTotals.deletions
                    })
                }

                const overview = await readProjectGitOverview(normalizedProjectPath)
                if (cancelled || requestId !== requestIdRef.current) return

                if (!overview?.isGitRepo) {
                    gitSummaryCache.set(normalizedProjectPath, {
                        refreshKey,
                        state: {
                            isGitRepo: false,
                            resolved: true,
                            additions: 0,
                            deletions: 0
                        }
                    })
                    setState({
                        ...INITIAL_STATE,
                        resolved: true
                    })
                    return
                }

                if (overview.changedCount === 0) {
                    const nextState: Omit<GitSummaryState, 'loading'> = {
                        isGitRepo: true,
                        resolved: true,
                        additions: 0,
                        deletions: 0
                    }
                    gitSummaryCache.set(normalizedProjectPath, {
                        refreshKey,
                        state: nextState
                    })
                    setState({
                        ...nextState,
                        loading: false
                    })
                    return
                }

                if (hasFullyLoadedCachedStats && cachedEntries.length === overview.changedCount) {
                    const cachedTotals = computeStatusTotals(cachedEntries)
                    const nextState: Omit<GitSummaryState, 'loading'> = {
                        isGitRepo: true,
                        resolved: true,
                        additions: cachedTotals.additions,
                        deletions: cachedTotals.deletions
                    }
                    gitSummaryCache.set(normalizedProjectPath, {
                        refreshKey,
                        state: nextState
                    })
                    setState({
                        ...nextState,
                        loading: false
                    })
                    return
                }

                const statusResult = await window.devscope.getGitStatusDetailed(normalizedProjectPath, {
                    includeStats: true
                })
                if (cancelled || requestId !== requestIdRef.current) return

                if (!statusResult?.success) {
                    const fallbackState: Omit<GitSummaryState, 'loading'> = cached?.state?.isGitRepo
                        ? cached.state
                        : {
                            isGitRepo: true,
                            resolved: true,
                            additions: 0,
                            deletions: 0
                        }
                    gitSummaryCache.set(normalizedProjectPath, {
                        refreshKey,
                        state: fallbackState
                    })
                    setState({
                        ...fallbackState,
                        loading: false
                    })
                    return
                }

                const totals = computeStatusTotals(statusResult.entries || [])

                const nextState: Omit<GitSummaryState, 'loading'> = {
                    isGitRepo: true,
                    resolved: true,
                    additions: totals.additions,
                    deletions: totals.deletions
                }
                gitSummaryCache.set(normalizedProjectPath, {
                    refreshKey,
                    state: nextState
                })

                setState({
                    ...nextState,
                    loading: false
                })
            } catch {
                if (cancelled || requestId !== requestIdRef.current) return
                if (cached) {
                    setState({
                        ...cached.state,
                        loading: false
                    })
                    return
                }
                setState(INITIAL_STATE)
            }
        })()

        return () => {
            cancelled = true
        }
    }, [normalizedProjectPath, refreshKey])

    if (!normalizedProjectPath) return null

    const showMissingGitState = variant === 'menu' && state.resolved && !state.isGitRepo
    const showCheckingState = variant === 'menu' && state.loading && !state.isGitRepo

    if (variant === 'header' && !state.isGitRepo && !state.loading) return null
    if (variant === 'menu' && !state.isGitRepo && !state.loading && !state.resolved) return null

    return (
        <div
            className={cn(
                variant === 'menu'
                    ? 'flex w-full items-center justify-between gap-3 rounded-md border border-transparent bg-white/[0.03] px-2.5 py-2 text-[11px] font-medium text-sparkle-text-secondary'
                    : 'inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-sparkle-card px-2.5 text-[11px] font-medium text-sparkle-text-secondary transition-colors hover:border-white/20 hover:bg-white/[0.03] hover:text-sparkle-text',
            )}
            title={normalizedProjectPath || 'Git changes'}
        >
            <div className="flex min-w-0 items-center gap-1.5">
                {state.loading ? <Loader2 size={13} className="shrink-0 animate-spin text-sparkle-text-muted/70" /> : <GitHubMark className="h-3.5 w-3.5 shrink-0 text-white/90" />}
                {variant === 'menu' ? (
                    <span className="truncate text-[10px] uppercase tracking-[0.14em] text-sparkle-text-muted/70">
                        {showMissingGitState ? 'Git' : 'Git changes'}
                    </span>
                ) : null}
            </div>
            {showMissingGitState ? (
                <span className="truncate text-[11px] text-sparkle-text-muted/70">No Git initialized in this dir</span>
            ) : showCheckingState ? (
                <span className="truncate text-[11px] text-sparkle-text-muted/70">Checking Git…</span>
            ) : (
                <DiffStats
                    additions={state.additions}
                    deletions={state.deletions}
                    compact
                    loading={state.loading}
                    preserveValuesWhileLoading
                    showBar={false}
                    className="gap-1.5"
                />
            )}
        </div>
    )
})
