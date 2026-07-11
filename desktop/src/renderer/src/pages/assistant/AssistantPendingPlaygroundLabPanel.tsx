import { memo, useEffect, useState } from 'react'
import type { AssistantPlaygroundPendingLabRequest } from '@shared/assistant/contracts'
import { cn } from '@/lib/utils'

export const AssistantPendingPlaygroundLabPanel = memo(function AssistantPendingPlaygroundLabPanel(props: {
    request: AssistantPlaygroundPendingLabRequest
    responding: boolean
    onApprove: (input: { title?: string; source: 'empty' | 'git-clone'; repoUrl?: string }) => Promise<void> | void
    onDecline: () => Promise<void> | void
}) {
    const { request, responding, onApprove, onDecline } = props
    const [title, setTitle] = useState(request.suggestedLabName || '')
    const [repoUrl, setRepoUrl] = useState(request.repoUrl || '')

    useEffect(() => {
        setTitle(request.suggestedLabName || '')
        setRepoUrl(request.repoUrl || '')
    }, [request.createdAt, request.id, request.kind, request.repoUrl, request.suggestedLabName])

    const isClone = request.kind === 'clone-repo'
    const canApprove = isClone ? repoUrl.trim().length > 0 : true

    return (
        <div className="mx-auto w-full max-w-3xl rounded-2xl border border-white/10 bg-white/[0.03] p-4 shadow-[0_16px_50px_rgba(0,0,0,0.18)]">
            <div className="mb-3">
                <div className="text-xs uppercase tracking-[0.2em] text-violet-200/55">Project Approval</div>
                <h3 className="mt-1 text-sm font-semibold text-sparkle-text">
                    {isClone ? 'Assistant wants to clone a repo' : 'Assistant wants to create a project'}
                </h3>
                <p className="mt-1 text-xs text-sparkle-text-muted/70">
                    Approve this only if you want this chat to start filesystem work in a project folder.
                </p>
            </div>
            <div className="space-y-3">
                <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-sparkle-bg px-4 py-3 text-sm text-sparkle-text outline-none transition-all focus:border-[var(--accent-primary)]/40 focus:ring-4 focus:ring-[var(--accent-primary)]/10"
                    placeholder="Project name"
                    maxLength={120}
                />
                {isClone ? (
                    <input
                        value={repoUrl}
                        onChange={(event) => setRepoUrl(event.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-sparkle-bg px-4 py-3 text-sm text-sparkle-text outline-none transition-all focus:border-[var(--accent-primary)]/40 focus:ring-4 focus:ring-[var(--accent-primary)]/10"
                        placeholder="Repository URL"
                    />
                ) : null}
                <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-3 text-xs text-sparkle-text-muted/70">
                    {request.prompt}
                </div>
            </div>
            <div className="mt-4 flex items-center gap-3">
                <button
                    type="button"
                    onClick={() => onDecline()}
                    disabled={responding}
                    className="flex-1 rounded-xl border border-white/10 bg-sparkle-bg px-4 py-2.5 text-sm font-semibold text-sparkle-text-secondary transition-all hover:border-white/20 hover:bg-sparkle-card-hover hover:text-white disabled:opacity-50"
                >
                    Decline
                </button>
                <button
                    type="button"
                    onClick={() => onApprove({
                        title: title.trim() || undefined,
                        source: isClone ? 'git-clone' : 'empty',
                        repoUrl: isClone ? repoUrl.trim() : undefined
                    })}
                    disabled={responding || !canApprove}
                    className={cn(
                        'flex-1 rounded-xl px-4 py-2.5 text-sm font-bold transition-all shadow-lg',
                        responding || !canApprove
                            ? 'bg-sparkle-border/40 text-sparkle-text-muted cursor-not-allowed opacity-50'
                            : 'bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-primary)]/90 shadow-[var(--accent-primary)]/20 active:scale-[0.98]'
                    )}
                >
                    {responding ? 'Working...' : (isClone ? 'Approve clone' : 'Create Project')}
                </button>
            </div>
        </div>
    )
})
