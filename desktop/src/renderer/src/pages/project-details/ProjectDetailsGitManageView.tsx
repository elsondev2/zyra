import { GitBranch, GitPullRequest, Link, Plus, RefreshCw } from 'lucide-react'
import { buildGitPublishPlan } from '@/lib/gitPublishPlanner'
import { cn } from '@/lib/utils'
import { Select } from '@/components/ui/FormControls'
import { DiffStats } from './DiffStats'

interface ProjectDetailsGitManageViewProps {
    [key: string]: any
}

export function ProjectDetailsGitManageView(props: ProjectDetailsGitManageViewProps) {
    const {
        isGitRepo,
        loadingGit,
        gitError,
        onOpenCreatePullRequest,
        setShowInitModal,
        currentBranch,
        targetBranch,
        setTargetBranch,
        branches,
        isSwitchingBranch,
        handleSwitchBranch,
        changedFiles,
        hasRemote,
        gitSyncStatus,
        incomingCommits,
        setInitStep,
        unpushedCommits,
        gitHistory,
        gitHistoryTotalCount,
        setGitView,
        remotes,
        tags,
        stashes,
        githubPublishContext,
        hasGitHubRemote,
        pullRequestActionLabel,
        pullRequestActionHint,
        pullRequestActionDisabled
    } = props
    const loadingCounts = loadingGit && !gitError
    const hasAnyGitSurfaceData = Boolean(
        changedFiles.length > 0
        || unpushedCommits.length > 0
        || incomingCommits.length > 0
        || gitHistory.length > 0
        || gitHistoryTotalCount > 0
        || branches.length > 0
        || remotes.length > 0
        || tags.length > 0
        || stashes.length > 0
        || hasRemote !== null
        || gitSyncStatus !== null
    )
    const publishPlan = buildGitPublishPlan({
        currentBranch,
        branches,
        remotes,
        unpushedCommits,
        intent: 'push-all',
        githubPublishContext
    })
    const hasPublishAction = hasRemote === true && (unpushedCommits.length > 0 || publishPlan.currentBranchNeedsPublish)

    if (isGitRepo === false) {
        return (
            <div className="flex flex-col items-center justify-center py-16 px-4">
                <div className="p-6 rounded-2xl bg-white/5 border border-white/10 mb-6">
                    <GitBranch size={48} className="text-white/30" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Git Not Initialized</h3>
                <p className="text-sm text-white/50 text-center mb-6 max-w-md">
                    This project is not a Git repository yet. Initialize Git to start tracking changes and collaborate with others.
                </p>
                <button
                    onClick={() => setShowInitModal(true)}
                    className="px-6 py-3 bg-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/80 text-white text-sm font-medium rounded-lg transition-all flex items-center gap-2"
                >
                    <GitBranch size={18} />
                    Initialize Git Repository
                </button>
            </div>
        )
    }

    if (loadingGit && !gitError && isGitRepo !== false && !hasAnyGitSurfaceData) {
        return (
            <div className="flex flex-col items-center justify-center py-16 px-4">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                    <RefreshCw size={22} className="animate-spin text-white/45" />
                </div>
                <h3 className="text-sm font-medium text-white/80">Loading repository data</h3>
                <p className="mt-2 max-w-md text-center text-xs text-white/45">
                    Reading branch, status, sync, and history details for this project.
                </p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div className="bg-black/20 rounded-xl border border-white/5 p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                    <h3 className="text-sm font-medium text-white/80 flex items-center gap-2">
                        <GitBranch size={16} />
                        Branch Switching
                    </h3>
                    <span className="text-xs text-white/40">
                        Current: <span className="font-mono text-white/70">{currentBranch || 'n/a'}</span>
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <Select
                        value={targetBranch}
                        onChange={setTargetBranch}
                        options={branches.map((branch: any) => ({
                            value: branch.name,
                            label: `${branch.current ? '* ' : ''}${branch.name}${branch.isLocal === false ? ' (remote)' : ''}`
                        }))}
                        placeholder="No branches found"
                        disabled={branches.length === 0 || isSwitchingBranch}
                        className="flex-1"
                        size="md"
                    />
                    <button
                        onClick={handleSwitchBranch}
                        disabled={!targetBranch || targetBranch === currentBranch || isSwitchingBranch}
                        className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/80 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-all flex items-center gap-2"
                    >
                        {isSwitchingBranch ? (
                            <>
                                <RefreshCw size={14} className="animate-spin" />
                                Switching...
                            </>
                        ) : (
                            <>
                                <GitBranch size={14} />
                                Switch
                            </>
                        )}
                    </button>
                </div>
            </div>

            {hasRemote === true && (
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h3 className="text-sm font-medium text-white/85 flex items-center gap-2">
                                <GitPullRequest size={16} />
                                Pull Requests
                            </h3>
                            <p className="mt-1 text-xs text-white/48">
                                {hasGitHubRemote
                                    ? pullRequestActionHint
                                    : 'Add a GitHub remote to use the built-in PR flow. Standard Git push and pull still work with any remote.'}
                            </p>
                        </div>
                        <button
                            onClick={() => onOpenCreatePullRequest?.()}
                            disabled={pullRequestActionDisabled}
                            className={cn(
                                'rounded-lg px-4 py-2 text-sm font-medium transition-all',
                                pullRequestActionDisabled
                                    ? 'cursor-not-allowed bg-white/[0.04] text-white/35'
                                    : 'bg-[var(--accent-primary)]/16 text-white hover:bg-[var(--accent-primary)]/24'
                            )}
                        >
                            {hasGitHubRemote ? pullRequestActionLabel : 'GitHub Remote Required'}
                        </button>
                    </div>
                </div>
            )}

            {hasRemote === false ? (
                <div className="bg-amber-500/10 rounded-xl border border-amber-500/20 p-4">
                    <h3 className="text-sm font-medium text-amber-400 mb-3 flex items-center gap-2">
                        <Link size={16} />
                        No Remote Repository
                    </h3>
                    <p className="text-xs text-white/50 mb-3">
                        Add a remote repository to push your commits to GitHub, GitLab, or other Git hosting services.
                    </p>
                    <button
                        onClick={() => {
                            setInitStep('remote')
                            setShowInitModal(true)
                        }}
                        className="w-full px-4 py-2.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2 border border-amber-500/30"
                    >
                        <Plus size={16} />
                        Add Remote Repository
                    </button>
                </div>
            ) : null}

            <div className="space-y-3">
                {(() => {
                    const hasWorkingChanges = changedFiles.length > 0
                    const hasUnpushedCommits = hasPublishAction
                    const hasIncomingCommits = (gitSyncStatus?.behind || 0) > 0 || incomingCommits.length > 0
                    const effectiveHistoryTotalCount = Math.max(gitHistoryTotalCount || 0, gitHistory.length)
                    const hasRecentCommits = effectiveHistoryTotalCount > 0
                    const visibleSummaryCards =
                        (hasWorkingChanges ? 1 : 0) +
                        (hasIncomingCommits ? 1 : 0) +
                        (hasUnpushedCommits ? 1 : 0) +
                        (hasRecentCommits ? 1 : 0)

                    return (
                        <div className={cn(
                            'grid gap-3',
                            visibleSummaryCards >= 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'
                        )}>
                            {hasWorkingChanges && (
                                <div className="bg-[#E2C08D]/5 rounded-xl border border-[#E2C08D]/20 p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <h4 className="text-sm font-medium text-[#E2C08D]">Working Changes</h4>
                                        <span className="text-xs bg-[#E2C08D]/20 text-[#E2C08D] px-2 py-0.5 rounded-full">
                                            {loadingCounts ? '...' : changedFiles.length}
                                        </span>
                                    </div>
                                    <div className="space-y-1">
                                        {changedFiles.slice(0, 3).map((file: any) => (
                                            <div key={file.path} className="text-xs text-white/60 truncate">{file.name}</div>
                                        ))}
                                        {changedFiles.length > 3 && (
                                            <button onClick={() => setGitView('changes')} className="text-xs text-[#E2C08D] hover:underline">
                                                +{changedFiles.length - 3} more...
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {hasUnpushedCommits && (
                                <div className="bg-blue-500/5 rounded-xl border border-blue-500/20 p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <h4 className="text-sm font-medium text-blue-400">{publishPlan.title}</h4>
                                        <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">
                                            {loadingCounts ? '...' : publishPlan.commitCount}
                                        </span>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="rounded-md border border-white/5 bg-black/20 px-2 py-2 text-xs text-white/60">
                                            {publishPlan.description}
                                        </div>
                                        {unpushedCommits.slice(0, 2).map((commit: any) => (
                                            <div key={commit.hash} className="rounded-md border border-white/5 bg-black/20 px-2 py-1.5">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="text-xs text-white/60 truncate min-w-0">
                                                        <span className="font-mono text-white/40">{commit.shortHash}</span> {commit.message}
                                                    </div>
                                                    <div className="shrink-0">
                                                        <DiffStats additions={commit.additions} deletions={commit.deletions} compact loading={commit.statsLoaded === false} />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        {unpushedCommits.length > 2 && (
                                            <button onClick={() => setGitView('unpushed')} className="text-xs text-blue-400 hover:underline">
                                                +{unpushedCommits.length - 2} more...
                                            </button>
                                        )}
                                        {publishPlan.currentBranchNeedsPublish && unpushedCommits.length === 0 && (
                                            <button onClick={() => setGitView('unpushed')} className="text-xs text-blue-400 hover:underline">
                                                Review local branch status...
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {hasIncomingCommits && (
                                <div className="bg-amber-500/5 rounded-xl border border-amber-500/20 p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <h4 className="text-sm font-medium text-amber-300">Incoming</h4>
                                        <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full">
                                            {loadingCounts ? '...' : (gitSyncStatus?.behind || incomingCommits.length)}
                                        </span>
                                    </div>
                                    <div className="space-y-1">
                                        {incomingCommits.slice(0, 3).map((commit: any) => (
                                            <div key={commit.hash} className="rounded-md border border-white/5 bg-black/20 px-2 py-1.5">
                                                <div className="text-xs text-white/60 truncate min-w-0">
                                                    <span className="font-mono text-white/40">{commit.shortHash}</span> {commit.message}
                                                </div>
                                            </div>
                                        ))}
                                        <button onClick={() => setGitView('pulls')} className="text-xs text-amber-300 hover:underline">
                                            Open Pulls...
                                        </button>
                                    </div>
                                </div>
                            )}

                            {hasRecentCommits && (
                                <div className={cn(
                                    'bg-white/5 rounded-xl border border-white/5 p-4',
                                    visibleSummaryCards === 3 && 'md:col-span-2'
                                )}>
                                    <div className="flex items-center justify-between mb-2">
                                        <h4 className="text-sm font-medium text-white/80">Recent Commits</h4>
                                        <span className="text-xs bg-white/10 text-white/60 px-2 py-0.5 rounded-full">
                                            {loadingCounts ? '...' : effectiveHistoryTotalCount}
                                        </span>
                                    </div>
                                    <div className="space-y-1">
                                        {gitHistory.slice(0, 3).map((commit: any) => (
                                            <div key={commit.hash} className="rounded-md border border-white/5 bg-black/20 px-2 py-1.5">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="text-xs text-white/60 truncate min-w-0">
                                                        <span className="font-mono text-white/40">{commit.shortHash}</span> {commit.message}
                                                    </div>
                                                    <div className="shrink-0">
                                                        <DiffStats additions={commit.additions} deletions={commit.deletions} compact loading={commit.statsLoaded === false} />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        {effectiveHistoryTotalCount > 3 && (
                                            <button onClick={() => setGitView('history')} className="text-xs text-[var(--accent-primary)] hover:underline">
                                                View all...
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                })()}

                {(branches.length > 0 || remotes.length > 0 || tags.length > 0 || stashes.length > 0) && (
                    <div className="bg-white/5 rounded-xl border border-white/5 p-4 space-y-4">
                        <div className="flex items-center justify-between">
                            <h4 className="text-sm font-medium text-white/80">Repository Details</h4>
                            <span className="text-xs text-white/40">Live Git metadata</span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="bg-black/20 rounded-lg border border-white/5 px-3 py-2">
                                <div className="text-white/40">Branches</div>
                                <div className="text-white/80 font-medium">{loadingCounts ? '...' : branches.length}</div>
                            </div>
                            <div className="bg-black/20 rounded-lg border border-white/5 px-3 py-2">
                                <div className="text-white/40">Remotes</div>
                                <div className="text-white/80 font-medium">{loadingCounts ? '...' : remotes.length}</div>
                            </div>
                            <div className="bg-black/20 rounded-lg border border-white/5 px-3 py-2">
                                <div className="text-white/40">Tags</div>
                                <div className="text-white/80 font-medium">{loadingCounts ? '...' : tags.length}</div>
                            </div>
                            <div className="bg-black/20 rounded-lg border border-white/5 px-3 py-2">
                                <div className="text-white/40">Stashes</div>
                                <div className="text-white/80 font-medium">{loadingCounts ? '...' : stashes.length}</div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
