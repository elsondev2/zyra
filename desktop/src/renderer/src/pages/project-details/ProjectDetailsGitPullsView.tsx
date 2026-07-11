import { useState } from 'react'
import { ArrowDownCircle, Link, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DiffStats } from './DiffStats'

const panelClass = 'rounded-xl border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-card)_88%,transparent)]'
const mutedPanelClass = 'rounded-xl border border-[color-mix(in_srgb,var(--color-text)_8%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_4%,transparent)]'
const secondaryButtonClass = 'inline-flex items-center justify-center gap-2 rounded-lg bg-[color-mix(in_srgb,var(--color-text)_6%,transparent)] px-3.5 py-2 text-xs font-medium text-sparkle-text-secondary transition-colors hover:bg-[color-mix(in_srgb,var(--color-text)_10%,transparent)] hover:text-sparkle-text disabled:cursor-not-allowed disabled:opacity-40'

function formatDateTime(value: number | null | undefined) {
    return value ? new Date(value).toLocaleString() : 'Never'
}

function formatSyncSource(repoUsesForkOrigin: boolean, gitSyncStatus: any, originRepoDisplay: string, upstreamRepoDisplay: string) {
    if (repoUsesForkOrigin) return upstreamRepoDisplay
    return gitSyncStatus?.upstreamBranch || originRepoDisplay || 'tracked branch'
}

export function ProjectDetailsGitPullsView(props: any) {
    const [selectedSource, setSelectedSource] = useState<'origin' | 'upstream'>('upstream')
    const {
        repoUsesForkOrigin,
        incomingStatsLoading,
        gitSyncStatus,
        currentBranch,
        originRepoDisplay,
        upstreamRepoDisplay,
        isFetching,
        activeFetchTarget,
        activeUpdateTarget,
        canFetchOrigin,
        showFetchUpstreamButton,
        canSyncFromUpstream,
        isPulling,
        hasRemote,
        shouldHighlightPull,
        pullStatusItems,
        lastFetched,
        lastPulled,
        pagedIncomingCommits,
        incomingCommits,
        pullsPage,
        setPullsPage,
        ITEMS_PER_PAGE,
        handleFetchOrigin,
        handleFetchUpstream,
        handlePullFromOrigin,
        handleSyncFromUpstream,
        handlePull,
        handleCommitClick
    } = props

    const branchName = incomingStatsLoading ? 'Loading...' : (gitSyncStatus?.currentBranch || currentBranch || 'Unknown')
    const trackedBranch = incomingStatsLoading ? 'Loading...' : (gitSyncStatus?.upstreamBranch || 'Not configured')
    const behindCount = incomingStatsLoading ? null : (gitSyncStatus?.behind || 0)
    const syncSource = formatSyncSource(repoUsesForkOrigin, gitSyncStatus, originRepoDisplay, upstreamRepoDisplay)
    const syncTarget = repoUsesForkOrigin ? originRepoDisplay : branchName
    const showReadyTag = pullStatusItems.includes('Ready to pull')
    const checkButtonLabel = repoUsesForkOrigin ? 'Check' : 'Check remote'
    const sourceRows = repoUsesForkOrigin
        ? [
            {
                key: 'origin',
                label: 'Fork',
                value: originRepoDisplay,
                description: 'Your remote copy',
                checkLabel: 'Check',
                updateLabel: 'Update from fork',
                checkLoading: isFetching && activeFetchTarget === 'origin',
                updateLoading: isPulling && activeUpdateTarget === 'origin',
                checkDisabled: isFetching || !canFetchOrigin,
                updateDisabled: isPulling || hasRemote !== true || !canFetchOrigin,
                onCheck: handleFetchOrigin,
                onUpdate: handlePullFromOrigin
            },
            {
                key: 'upstream',
                label: 'Original',
                value: upstreamRepoDisplay,
                description: 'Source project',
                checkLabel: 'Check',
                updateLabel: 'Update from original',
                checkLoading: isFetching && activeFetchTarget === 'upstream',
                updateLoading: isPulling && activeUpdateTarget === 'upstream',
                checkDisabled: isFetching || !showFetchUpstreamButton,
                updateDisabled: isPulling || !canSyncFromUpstream,
                onCheck: handleFetchUpstream,
                onUpdate: handleSyncFromUpstream
            }
        ]
        : [
            {
                key: 'origin',
                label: 'Remote',
                value: originRepoDisplay,
                description: trackedBranch,
                checkLabel: checkButtonLabel,
                updateLabel: 'Update local',
                checkLoading: isFetching && activeFetchTarget === 'origin',
                updateLoading: isPulling,
                checkDisabled: isFetching || !canFetchOrigin,
                updateDisabled: isPulling || hasRemote !== true || (gitSyncStatus?.behind || 0) === 0,
                onCheck: handleFetchOrigin,
                onUpdate: handlePull
            }
        ]
    const selectedRow = repoUsesForkOrigin
        ? (sourceRows.find((row) => row.key === selectedSource) || sourceRows[1] || sourceRows[0])
        : sourceRows[0]

    return (
        <div className="space-y-4 text-sparkle-text">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                <div className={cn(mutedPanelClass, 'min-w-0 p-3')}>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sparkle-text-secondary">Branch</p>
                    <p className="mt-1 truncate text-sm font-semibold text-sparkle-text">{branchName}</p>
                </div>
                <div className={cn(mutedPanelClass, 'min-w-0 p-3')}>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sparkle-text-secondary">Tracking</p>
                    <p className="mt-1 truncate text-sm font-semibold text-sparkle-text">{trackedBranch}</p>
                </div>
                <div className={cn(mutedPanelClass, 'min-w-0 p-3')}>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sparkle-text-secondary">
                        {repoUsesForkOrigin ? 'Fork Origin' : 'Remote'}
                    </p>
                    <p className="mt-1 truncate text-sm font-semibold text-sparkle-text">{originRepoDisplay}</p>
                </div>
                <div className={cn(mutedPanelClass, 'min-w-0 p-3')}>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sparkle-text-secondary">Incoming</p>
                    <p className="mt-1 text-xl font-semibold text-sparkle-text">{behindCount === null ? '...' : behindCount}</p>
                </div>
            </div>

            <div className={cn(panelClass, 'p-4')}>
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="min-w-0">
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                    <h3 className="truncate text-sm font-semibold text-sparkle-text">
                                        {repoUsesForkOrigin ? 'Fork sync' : 'Incoming changes'}
                                    </h3>
                                    {repoUsesForkOrigin ? (
                                        <div className="inline-flex overflow-hidden rounded-lg bg-[color-mix(in_srgb,var(--color-text)_6%,transparent)] p-0.5">
                                            {sourceRows.map((row) => (
                                                <button
                                                    key={row.key}
                                                    type="button"
                                                    onClick={() => setSelectedSource(row.key as 'origin' | 'upstream')}
                                                    className={cn(
                                                        'rounded-md px-2.5 py-1 text-[10px] font-semibold transition-colors',
                                                        selectedRow.key === row.key
                                                            ? 'bg-[var(--accent-primary)]/18 text-[var(--accent-primary)]'
                                                            : 'text-sparkle-text-secondary hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)] hover:text-sparkle-text'
                                                    )}
                                                >
                                                    {row.label}
                                                </button>
                                            ))}
                                        </div>
                                    ) : null}
                                    {showReadyTag ? (
                                        <span className="shrink-0 rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10px] font-semibold text-emerald-500">
                                            Ready to pull
                                        </span>
                                    ) : null}
                                </div>
                                <p className="mt-0.5 truncate text-xs text-sparkle-text-secondary">
                                    {syncSource} to {syncTarget}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="w-full rounded-xl bg-[color-mix(in_srgb,var(--color-text)_4%,transparent)] px-3 py-2.5 xl:w-auto xl:shrink-0">
                        <div className="grid gap-2 sm:grid-cols-[minmax(180px,240px)_96px_176px] sm:items-center">
                            <div className="min-w-0">
                                <div className="flex min-w-0 items-center gap-2">
                                    <span className="shrink-0 text-sm font-semibold text-sparkle-text">{selectedRow.label}</span>
                                    <span className="truncate text-xs text-sparkle-text-secondary">{selectedRow.value}</span>
                                </div>
                                <p className="mt-0.5 truncate text-xs text-sparkle-text-secondary">{selectedRow.description}</p>
                            </div>
                            <button
                                onClick={() => { void selectedRow.onCheck() }}
                                disabled={selectedRow.checkDisabled}
                                className={cn(secondaryButtonClass, 'w-full')}
                            >
                                {selectedRow.checkLoading ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                                <span className="truncate">{selectedRow.checkLabel}</span>
                            </button>
                            <button
                                onClick={() => { void selectedRow.onUpdate() }}
                                disabled={selectedRow.updateDisabled}
                                className={cn(
                                    'inline-flex w-full items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                                    selectedRow.key === 'upstream' || (!repoUsesForkOrigin && shouldHighlightPull)
                                        ? 'bg-[var(--accent-primary)]/18 text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/26'
                                        : 'bg-[color-mix(in_srgb,var(--color-text)_6%,transparent)] text-sparkle-text hover:bg-[color-mix(in_srgb,var(--color-text)_10%,transparent)]'
                                )}
                            >
                                {selectedRow.updateLoading ? <RefreshCw size={14} className="animate-spin" /> : <ArrowDownCircle size={14} />}
                                <span className="truncate">{selectedRow.updateLoading ? 'Updating...' : selectedRow.updateLabel}</span>
                            </button>
                        </div>
                    </div>
                </div>

                <div className="mt-3 grid gap-2 text-xs text-sparkle-text-secondary sm:grid-cols-2">
                    <span>Last fetched: {formatDateTime(lastFetched)}</span>
                    <span className="sm:text-right">Last pulled: {formatDateTime(lastPulled)}</span>
                </div>
            </div>

            {hasRemote === false ? (
                <div className="rounded-xl bg-amber-500/10 p-4 text-amber-600 dark:text-amber-300">
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                        <Link size={16} />
                        No Remote Repository
                    </h3>
                    <p className="text-xs opacity-80">Add a remote before fetch and pull are available.</p>
                </div>
            ) : incomingCommits.length > 0 ? (
                <>
                    <div className={cn(panelClass, 'overflow-hidden')}>
                        <div className="flex items-center justify-between gap-3 border-b border-[color-mix(in_srgb,var(--color-text)_8%,transparent)] px-4 py-3">
                            <div>
                                <h3 className="text-sm font-semibold text-sparkle-text">Incoming commits</h3>
                                <p className="text-xs text-sparkle-text-secondary">
                                    {incomingCommits.length} commit{incomingCommits.length === 1 ? '' : 's'} ready from {syncSource}
                                </p>
                            </div>
                        </div>
                        <div className="divide-y divide-[color-mix(in_srgb,var(--color-text)_7%,transparent)]">
                            {pagedIncomingCommits.map((commit: any) => (
                                <button
                                    key={commit.hash}
                                    type="button"
                                    onClick={() => handleCommitClick(commit)}
                                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)]"
                                >
                                    <ArrowDownCircle size={15} className="mt-1 shrink-0 text-[var(--accent-primary)]" />
                                    <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold text-sparkle-text">{commit.message}</p>
                                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-sparkle-text-secondary">
                                                <span className="font-mono">{commit.shortHash}</span>
                                                <span>{commit.author}</span>
                                                <span>{new Date(commit.date).toLocaleDateString()}</span>
                                            </div>
                                        </div>
                                        <DiffStats additions={commit.additions} deletions={commit.deletions} loading={incomingStatsLoading} className="shrink-0" />
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                    {incomingCommits.length > ITEMS_PER_PAGE && (
                        <div className="flex items-center justify-between pt-1">
                            <span className="text-xs text-sparkle-text-secondary">
                                Showing {((pullsPage - 1) * ITEMS_PER_PAGE) + 1}-{Math.min(pullsPage * ITEMS_PER_PAGE, incomingCommits.length)} of {incomingCommits.length}
                            </span>
                            <div className="flex items-center gap-2">
                                <button onClick={() => setPullsPage((p: number) => Math.max(1, p - 1))} disabled={pullsPage === 1} className={secondaryButtonClass}>Previous</button>
                                <span className="px-2 text-xs text-sparkle-text-secondary">{pullsPage} / {Math.ceil(incomingCommits.length / ITEMS_PER_PAGE)}</span>
                                <button onClick={() => setPullsPage((p: number) => Math.min(Math.ceil(incomingCommits.length / ITEMS_PER_PAGE), p + 1))} disabled={pullsPage >= Math.ceil(incomingCommits.length / ITEMS_PER_PAGE)} className={secondaryButtonClass}>Next</button>
                            </div>
                        </div>
                    )}
                </>
            ) : (
                <div className={cn(panelClass, 'flex flex-col items-center justify-center py-20 text-center')}>
                    <ArrowDownCircle size={42} className="mb-3 text-sparkle-text-secondary opacity-60" />
                    <p className="text-sm font-semibold text-sparkle-text">No incoming commits</p>
                    <p className="mt-1 text-xs text-sparkle-text-secondary">Your branch is not behind its tracked source.</p>
                </div>
            )}
        </div>
    )
}
