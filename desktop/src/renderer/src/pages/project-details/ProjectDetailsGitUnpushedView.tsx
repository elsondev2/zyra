import { useMemo, useState } from 'react'
import { GitPullRequest, Link, Plus, RefreshCw, Upload } from 'lucide-react'
import { buildGitPublishPlan } from '@/lib/gitPublishPlanner'
import { Select } from '@/components/ui/FormControls'
import { GitGraph } from './GitGraph'

type InitStepSetter = (step: string) => void
type BoolSetter = (value: boolean) => void

export function ProjectDetailsGitUnpushedView(props: {
    hasRemote: boolean | null
    setInitStep: InitStepSetter
    setShowInitModal: BoolSetter
    showPushAction: boolean
    currentBranch: string
    branches: any[]
    remotes: any[]
    hasGitHubRemote: boolean
    pullRequestActionLabel: string
    pullRequestActionDisabled: boolean
    onPushCommits: (options?: { commitHash?: string }) => Promise<void> | void
    isPushing: boolean
    onOpenCreatePullRequest: () => void
    unpushedCommits: any[]
    onCommitClick: (commit: any) => void
    localOnlyCommitHashes: Set<string>
}) {
    const {
        hasRemote,
        setInitStep,
        setShowInitModal,
        showPushAction,
        currentBranch,
        branches,
        remotes,
        hasGitHubRemote,
        pullRequestActionLabel,
        pullRequestActionDisabled,
        onPushCommits,
        isPushing,
        onOpenCreatePullRequest,
        unpushedCommits,
        onCommitClick,
        localOnlyCommitHashes
    } = props
    const ALL_COMMITS_VALUE = '__all__'
    const [selectedPushCommitHash, setSelectedPushCommitHash] = useState<string>(ALL_COMMITS_VALUE)
    const selectedCommitHash = selectedPushCommitHash === ALL_COMMITS_VALUE ? null : selectedPushCommitHash
    const pushPlan = useMemo(() => buildGitPublishPlan({
        currentBranch,
        branches,
        remotes,
        unpushedCommits,
        selectedCommitHash,
        intent: selectedCommitHash ? 'push-range' : 'push-all'
    }), [branches, currentBranch, remotes, selectedCommitHash, unpushedCommits])
    const pushSelectorOptions = useMemo(() => [
        {
            value: ALL_COMMITS_VALUE,
            label: `All local commits (${unpushedCommits.length})`
        },
        ...unpushedCommits.map((commit) => ({
            value: commit.hash,
            label: `Up to ${commit.shortHash} · ${commit.message}`
        }))
    ], [unpushedCommits])

    return (
        <>
            {hasRemote === false ? (
                <div className="bg-amber-500/10 rounded-xl border border-amber-500/20 p-4 mb-4">
                    <h3 className="text-sm font-medium text-amber-400 mb-3 flex items-center gap-2">
                        <Link size={16} />
                        No Remote Repository
                    </h3>
                    <p className="text-xs text-white/50 mb-3">
                        Add a remote repository to publish this branch and push commits.
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

            {showPushAction && (
                <div className="bg-black/20 rounded-xl border border-white/5 p-4 mb-4">
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <div className="min-w-0 flex-1">
                                <Select
                                    value={selectedPushCommitHash}
                                    onChange={setSelectedPushCommitHash}
                                    options={pushSelectorOptions}
                                    placeholder="Select commit range"
                                    className="w-full"
                                    size="md"
                                />
                            </div>
                            <button
                                onClick={() => void onPushCommits(selectedCommitHash ? { commitHash: selectedCommitHash } : undefined)}
                                disabled={isPushing || pushPlan.commitCount <= 0}
                                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--accent-primary)]/16 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[var(--accent-primary)]/24 disabled:cursor-not-allowed disabled:bg-white/[0.04] disabled:text-white/35"
                            >
                                {isPushing ? <RefreshCw size={14} className="animate-spin" /> : <Upload size={14} />}
                                {isPushing ? 'Pushing...' : pushPlan.currentBranchNeedsPublish ? 'Publish Branch' : 'Push Commits'}
                            </button>
                            <button
                                onClick={onOpenCreatePullRequest}
                                disabled={pullRequestActionDisabled}
                                className="inline-flex items-center justify-center gap-2 rounded-lg bg-white/[0.05] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:bg-white/[0.04] disabled:text-white/35"
                            >
                                <GitPullRequest size={14} />
                                {hasGitHubRemote ? pullRequestActionLabel : 'GitHub Remote Required'}
                            </button>
                        </div>
                        <div className="text-[11px] text-white/45">
                            {selectedCommitHash
                                ? `${pushPlan.commitCount} commit${pushPlan.commitCount === 1 ? '' : 's'} will be pushed.`
                                : `${unpushedCommits.length} local commit${unpushedCommits.length === 1 ? '' : 's'} available.`}
                        </div>
                    </div>
                </div>
            )}

            {unpushedCommits.length > 0 ? (
                <GitGraph
                    commits={unpushedCommits}
                    laneSourceCommits={unpushedCommits}
                    onCommitClick={onCommitClick}
                    localOnlyCommitHashes={localOnlyCommitHashes}
                    hasRemote={hasRemote}
                    remoteHeadCommitHash={null}
                />
            ) : (
                <div className="flex flex-col items-center justify-center py-24 text-white/30">
                    <GitPullRequest size={48} className="mb-4 opacity-50" />
                    <p>No unpushed commits</p>
                    <p className="text-xs opacity-50">All commits are synced</p>
                </div>
            )}
        </>
    )
}
