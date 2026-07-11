import { ArrowDownCircle, Copy, ExternalLink, Link, RefreshCw, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const panelClass = 'rounded-xl bg-[color-mix(in_srgb,var(--color-text)_4%,transparent)] p-4'
const actionButtonClass = 'inline-flex items-center gap-1.5 rounded-lg bg-[color-mix(in_srgb,var(--color-text)_6%,transparent)] px-3 py-1.5 text-xs text-sparkle-text-secondary transition-colors hover:bg-[color-mix(in_srgb,var(--color-text)_10%,transparent)] hover:text-sparkle-text disabled:cursor-not-allowed disabled:opacity-40'

export function ProjectDetailsRepoInfoModal(props: any) {
    const {
        open,
        onClose,
        originRepoDisplay,
        originRemoteUrl,
        upstreamRepoDisplay,
        upstreamRemoteUrl,
        githubPublishContext,
        repoUsesForkOrigin,
        ensureUpstreamRemote,
        repoFlowSummary,
        handleSyncFromUpstream,
        isPulling,
        refreshGitHubPublishContext,
        handleCopyRepoValue
    } = props

    if (!open) return null

    return (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="w-full max-w-3xl rounded-2xl bg-sparkle-card shadow-2xl" onClick={(event) => event.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-[color-mix(in_srgb,var(--color-text)_8%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_3%,transparent)] px-5 py-4">
                    <div>
                        <h3 className="text-sm font-semibold text-sparkle-text">Repo Info</h3>
                        <p className="mt-1 text-xs text-sparkle-text-secondary">Current remote links and sync actions.</p>
                    </div>
                    <button onClick={onClose} className="rounded-lg p-1 text-sparkle-text-secondary transition-colors hover:bg-[color-mix(in_srgb,var(--color-text)_8%,transparent)] hover:text-sparkle-text">
                        <X size={18} />
                    </button>
                </div>
                <div className="space-y-4 p-5">
                    <div className="grid gap-3 md:grid-cols-2">
                        <div className={panelClass}>
                            <p className="text-[11px] uppercase tracking-wide text-sparkle-text-secondary">Origin Repo</p>
                            <p className="mt-1 truncate text-sm font-medium text-sparkle-text" title={originRepoDisplay}>{originRepoDisplay}</p>
                            <p className="mt-1 truncate text-xs text-sparkle-text-secondary" title={originRemoteUrl}>{originRemoteUrl || 'Not configured'}</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {originRemoteUrl ? (
                                    <>
                                        <button onClick={() => window.open(originRemoteUrl.replace(/\.git$/i, ''), '_blank', 'noopener,noreferrer')} className={actionButtonClass}>
                                            <ExternalLink size={12} />
                                            Open
                                        </button>
                                        <button onClick={() => { void handleCopyRepoValue(originRemoteUrl, 'Origin URL') }} className={actionButtonClass}>
                                            <Copy size={12} />
                                            Copy URL
                                        </button>
                                    </>
                                ) : null}
                            </div>
                        </div>
                        <div className={panelClass}>
                            <p className="text-[11px] uppercase tracking-wide text-sparkle-text-secondary">Upstream Repo</p>
                            <p className="mt-1 truncate text-sm font-medium text-sparkle-text" title={upstreamRepoDisplay}>{upstreamRepoDisplay}</p>
                            <p className="mt-1 truncate text-xs text-sparkle-text-secondary" title={upstreamRemoteUrl || githubPublishContext?.upstream?.htmlUrl || ''}>
                                {upstreamRemoteUrl || githubPublishContext?.upstream?.htmlUrl || 'Not configured'}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {githubPublishContext?.upstream?.htmlUrl ? (
                                    <button onClick={() => window.open(githubPublishContext.upstream.htmlUrl, '_blank', 'noopener,noreferrer')} className={actionButtonClass}>
                                        <ExternalLink size={12} />
                                        Open
                                    </button>
                                ) : null}
                                {repoUsesForkOrigin ? (
                                    <button onClick={() => { void ensureUpstreamRemote() }} className={actionButtonClass}>
                                        <Link size={12} />
                                        Link Upstream
                                    </button>
                                ) : null}
                            </div>
                        </div>
                    </div>

                    <div className={panelClass}>
                        <p className="text-[11px] uppercase tracking-wide text-sparkle-text-secondary">Flow</p>
                        <p className="mt-1 text-sm font-medium text-sparkle-text">{repoFlowSummary}</p>
                        <p className="mt-1 text-xs text-sparkle-text-secondary">
                            {repoUsesForkOrigin
                                ? 'Origin is your fork, and upstream is the original repository used for sync and PR targeting.'
                                : 'This repo is tracking its configured remote branch directly.'}
                        </p>
                    </div>

                    <div className={panelClass}>
                        <p className="text-[11px] uppercase tracking-wide text-sparkle-text-secondary">Quick Actions</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                            {repoUsesForkOrigin ? (
                                <button onClick={() => { void handleSyncFromUpstream() }} disabled={isPulling} className={cn(actionButtonClass, 'py-2 font-medium')}>
                                    <ArrowDownCircle size={12} />
                                    Sync Fork
                                </button>
                            ) : null}
                            <button onClick={() => void refreshGitHubPublishContext()} className={cn(actionButtonClass, 'py-2 font-medium')}>
                                <RefreshCw size={12} />
                                Refresh Repo Info
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
