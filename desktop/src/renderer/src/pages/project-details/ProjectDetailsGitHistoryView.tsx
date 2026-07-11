import { GitBranch, RefreshCw } from 'lucide-react'
import { GitGraph } from './GitGraph'

export function ProjectDetailsGitHistoryView(props: any) {
    const {
        historyLoading,
        visibleHistorySource,
        visibleHistoryCommits,
        handleCommitClick,
        localOnlyCommitHashes,
        hasRemote,
        remoteHeadCommitHash,
        effectiveHistoryTotalCount,
        COMMITS_PER_PAGE,
        historyHasMore,
        loadingMoreHistory,
        commitPage,
        totalHistoryPages,
        setCommitPage,
        handleNextHistoryPage
    } = props

    if (historyLoading && visibleHistorySource.length === 0) {
        return (
            <div className="flex items-center justify-center py-24 text-white/30">
                <RefreshCw size={24} className="animate-spin mb-2" />
                <p className="text-xs">Loading history...</p>
            </div>
        )
    }

    if (visibleHistorySource.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-24 text-white/30">
                <GitBranch size={48} className="mb-4 opacity-50" />
                <p>No commit history found</p>
            </div>
        )
    }

    return (
        <>
            <GitGraph
                commits={visibleHistoryCommits}
                laneSourceCommits={visibleHistorySource}
                onCommitClick={handleCommitClick}
                localOnlyCommitHashes={localOnlyCommitHashes}
                hasRemote={hasRemote}
                remoteHeadCommitHash={remoteHeadCommitHash}
            />
            {(effectiveHistoryTotalCount > COMMITS_PER_PAGE || historyHasMore || loadingMoreHistory) && (
                <div className="flex items-center justify-between pt-4 mt-4 border-t border-white/5">
                    <span className="text-xs text-white/40">
                        Showing {((commitPage - 1) * COMMITS_PER_PAGE) + 1}-{Math.min(commitPage * COMMITS_PER_PAGE, effectiveHistoryTotalCount)} of {effectiveHistoryTotalCount}
                    </span>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setCommitPage((p: number) => Math.max(1, p - 1))} disabled={commitPage === 1} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all">Previous</button>
                        <span className="text-xs text-white/60 px-2">{commitPage} / {totalHistoryPages}</span>
                        <button onClick={() => { void handleNextHistoryPage() }} disabled={loadingMoreHistory || (!historyHasMore && commitPage >= totalHistoryPages)} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                            {loadingMoreHistory ? 'Loading...' : commitPage >= totalHistoryPages && historyHasMore ? 'Load More' : 'Next'}
                        </button>
                    </div>
                </div>
            )}
            {loadingMoreHistory && (
                <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-white/55">
                    <div className="flex items-center gap-2">
                        <RefreshCw size={12} className="animate-spin text-[var(--accent-primary)]" />
                        <span>Loading more history...</span>
                    </div>
                </div>
            )}
        </>
    )
}
