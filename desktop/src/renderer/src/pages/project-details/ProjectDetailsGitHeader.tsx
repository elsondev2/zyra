import { Check, GitBranch, Info, RefreshCw, User } from 'lucide-react'
import { cn } from '@/lib/utils'

type GitViewTab = 'manage' | 'changes' | 'unpushed' | 'pulls' | 'history'

type PushAccessIndicator = {
    allowed: boolean
    inferred: boolean
}

type GitUserSummary = {
    name?: string
}

type ProjectDetailsGitHeaderProps = {
    gitUser: GitUserSummary | null | undefined
    repoOwner?: string | null
    pushAccessIndicator: PushAccessIndicator
    gitView: GitViewTab
    onGitViewChange: (view: GitViewTab) => void
    changedFilesCount: number
    unpushedCommitsCount: number
    behindCount: number
    onOpenRepoInfo: () => void
    onRefresh: () => void
    refreshDisabled: boolean
    refreshLoading: boolean
}

const tabButtonClass = (active: boolean) => cn(
    'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors border border-transparent whitespace-nowrap',
    active
        ? 'bg-[color-mix(in_srgb,var(--color-text)_10%,transparent)] text-sparkle-text border-[color-mix(in_srgb,var(--color-text)_8%,transparent)]'
        : 'text-sparkle-text-secondary hover:text-sparkle-text hover:bg-[color-mix(in_srgb,var(--color-text)_6%,transparent)]'
)

export function ProjectDetailsGitHeader({
    gitUser,
    repoOwner,
    pushAccessIndicator,
    gitView,
    onGitViewChange,
    changedFilesCount,
    unpushedCommitsCount,
    behindCount,
    onOpenRepoInfo,
    onRefresh,
    refreshDisabled,
    refreshLoading
}: ProjectDetailsGitHeaderProps) {
    return (
        <>
            {gitUser ? (
                <div className="border-b border-[color-mix(in_srgb,var(--color-text)_8%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_3%,transparent)] p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)] p-2">
                                <User size={16} className="text-sparkle-text-secondary" />
                            </div>
                            <div>
                                <p className="text-xs text-sparkle-text-secondary">Repository Owner</p>
                                <p className="text-sm font-medium text-sparkle-text">{repoOwner || 'Unknown'}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="text-right">
                                <p className="text-xs text-sparkle-text-secondary">Current User</p>
                                <div className="flex items-center justify-end gap-2">
                                    <p className="text-sm font-medium text-sparkle-text">{gitUser.name}</p>
                                    {pushAccessIndicator.allowed ? (
                                        <span
                                            className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-emerald-400/35 bg-emerald-400/15 text-emerald-200"
                                            title={pushAccessIndicator.inferred
                                                ? 'Owner match suggests this user can push to the remote.'
                                                : 'This account can push to the remote.'}
                                        >
                                            <Check size={11} strokeWidth={3} />
                                        </span>
                                    ) : (
                                        <span
                                            className="h-2.5 w-2.5 rounded-full bg-[color-mix(in_srgb,var(--color-text)_22%,transparent)]"
                                            title="This account is not matched as a direct pusher for the current remote."
                                        />
                                    )}
                                </div>
                            </div>
                            <div className="p-2 rounded-lg bg-[var(--accent-primary)]/10">
                                <User size={16} className="text-[var(--accent-primary)]" />
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            <div className="flex items-center gap-1 overflow-x-auto border-b border-[color-mix(in_srgb,var(--color-text)_8%,transparent)] px-4 py-3">
                <button onClick={() => onGitViewChange('manage')} className={tabButtonClass(gitView === 'manage')}>
                    <span className="flex items-center gap-1.5">
                        <GitBranch size={12} />
                        Manage
                    </span>
                </button>
                <button onClick={() => onGitViewChange('changes')} className={tabButtonClass(gitView === 'changes')}>
                    Working Changes ({changedFilesCount})
                </button>
                <button onClick={() => onGitViewChange('unpushed')} className={tabButtonClass(gitView === 'unpushed')}>
                    To Push ({unpushedCommitsCount})
                </button>
                <button onClick={() => onGitViewChange('pulls')} className={tabButtonClass(gitView === 'pulls')}>
                    To Pull ({behindCount})
                </button>
                <button onClick={() => onGitViewChange('history')} className={tabButtonClass(gitView === 'history')}>
                    History
                </button>
                <button
                    onClick={onOpenRepoInfo}
                    title="Repo Info"
                    aria-label="Repo Info"
                    className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg text-sparkle-text-secondary transition-colors hover:bg-[color-mix(in_srgb,var(--color-text)_6%,transparent)] hover:text-sparkle-text"
                >
                    <Info size={13} />
                </button>
                <button
                    onClick={onRefresh}
                    disabled={refreshDisabled}
                    className="whitespace-nowrap rounded-lg bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] px-3 py-1.5 text-xs font-medium text-sparkle-text-secondary transition-colors hover:bg-[color-mix(in_srgb,var(--color-text)_8%,transparent)] hover:text-sparkle-text disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <span className="flex items-center gap-1.5">
                        <RefreshCw size={12} className={cn(refreshLoading && 'animate-spin')} />
                        Refresh Git
                    </span>
                </button>
            </div>
        </>
    )
}
