import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, Check, ExternalLink, Eye, EyeOff, X, Zap } from 'lucide-react'
import { Select } from '@/components/ui/FormControls'
import { cn } from '@/lib/utils'
import type { CommitAIProvider } from '@/lib/settings'
import { PROVIDER_COLORS, type ModelOption, type ProviderStatus } from './aiSettingsConfig'

export type StatusPillTone = 'accent' | 'neutral' | 'success' | 'danger'

type StatusPillProps = {
    tone: StatusPillTone
    children: ReactNode
    className?: string
}

type ProviderDetail = {
    label: string
    value: string
}

type ProviderMessage = {
    tone: Exclude<StatusPillTone, 'accent'>
    text: string
}

type ProviderStatusTag = {
    label: string
    tone: StatusPillTone
}

export function StatusPill({ tone, children, className }: StatusPillProps) {
    return (
        <span
            className={cn(
                'inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]',
                tone === 'accent' && 'border-[var(--accent-primary)]/35 bg-[var(--accent-primary)]/12 text-white/90',
                tone === 'neutral' && 'border-white/10 bg-white/[0.04] text-sparkle-text-secondary',
                tone === 'success' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
                tone === 'danger' && 'border-red-500/25 bg-red-500/10 text-red-200',
                className
            )}
        >
            {children}
        </span>
    )
}

export function ProviderOverviewCard({
    provider,
    title,
    description,
    active,
    tags,
    details,
    message,
    onUse,
    onConfigure
}: {
    provider: CommitAIProvider
    title: string
    description: string
    active: boolean
    tags: ProviderStatusTag[]
    details: ProviderDetail[]
    message?: ProviderMessage
    onUse?: () => void
    onConfigure: () => void
}) {
    const colors = PROVIDER_COLORS[provider]

    return (
        <section
            className={cn(
                'cursor-pointer rounded-xl border p-4 transition-colors',
                active ? cn(colors.border, colors.bg) : 'border-white/10 bg-sparkle-card hover:border-white/14 hover:bg-white/[0.03]'
            )}
            role="radio"
            aria-checked={active}
            tabIndex={0}
            onClick={() => {
                if (!active) {
                    onUse?.()
                }
            }}
            onKeyDown={(event) => {
                if (!active && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault()
                    onUse?.()
                }
            }}
            onDoubleClick={() => onConfigure()}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-3">
                        <div className={cn('rounded-xl border border-white/10 p-2.5', colors.bg)}>
                            <Zap size={17} className={colors.icon} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <h2 className="truncate text-base font-semibold text-sparkle-text">{title}</h2>
                            <div className="mt-1 flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap">
                                {tags.map((tag) => (
                                    <StatusPill key={`${title}-${tag.label}`} tone={tag.tone} className="shrink-0">
                                        {tag.label}
                                    </StatusPill>
                                ))}
                            </div>
                            <p className="mt-1 text-xs text-sparkle-text-secondary">{description}</p>
                        </div>
                    </div>
                </div>

                <div
                    className={cn(
                        'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors',
                        active ? colors.border : 'border-white/15 bg-white/[0.04]'
                    )}
                >
                    <span
                        className="h-2.5 w-2.5 rounded-full transition-opacity"
                        style={{ backgroundColor: colors.primary, opacity: active ? 1 : 0 }}
                    />
                </div>
            </div>

            <div className="mt-3 grid gap-1.5">
                {details.map((detail) => (
                    <div key={`${title}-${detail.label}`} className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2.5">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">{detail.label}</div>
                        <div className="min-w-0 truncate text-xs font-medium text-sparkle-text">{detail.value}</div>
                    </div>
                ))}
            </div>

            {message ? <ProviderMessageRow tone={message.tone} text={message.text} className="mt-3" compact /> : null}

            <div className="mt-3 flex items-center gap-2">
                <button
                    type="button"
                    onClick={(event) => {
                        event.stopPropagation()
                        onConfigure()
                    }}
                    onDoubleClick={(event) => {
                        event.stopPropagation()
                    }}
                    className={cn(
                        'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                        active
                            ? 'border-transparent bg-black/20 text-white hover:bg-black/30'
                            : 'border-transparent bg-white/[0.04] text-sparkle-text hover:bg-white/[0.07]'
                    )}
                >
                    Configure
                </button>
            </div>
        </section>
    )
}

export function KeyProviderModal({
    open,
    provider,
    title,
    description,
    value,
    placeholder,
    keyHint,
    docsUrl,
    status,
    error,
    onClose,
    onSave,
    onTest
}: {
    open: boolean
    provider: Exclude<CommitAIProvider, 'codex'>
    title: string
    description: string
    value: string
    placeholder: string
    keyHint: string
    docsUrl: string
    status: ProviderStatus
    error: string
    onClose: () => void
    onSave: (value: string) => void
    onTest: (value: string) => void
}) {
    const [draft, setDraft] = useState(value)
    const [showKey, setShowKey] = useState(false)

    useEffect(() => {
        if (!open) return
        setDraft(value)
        setShowKey(false)
    }, [open, value])

    const trimmedDraft = draft.trim()
    const hasChanges = draft !== value
    const hasKey = trimmedDraft.length > 0
    const connectionTag = status === 'success'
        ? { label: 'Connected', tone: 'success' as const }
        : status === 'testing'
            ? { label: 'Testing', tone: 'accent' as const }
            : status === 'error'
                ? { label: 'Failed test', tone: 'danger' as const }
                : hasKey
                    ? { label: 'Key saved', tone: 'neutral' as const }
                    : { label: 'No key', tone: 'danger' as const }

    return (
        <ProviderModalShell
            open={open}
            provider={provider}
            title={title}
            description={description}
            tags={[
                connectionTag,
                { label: 'Hosted API', tone: 'neutral' }
            ]}
            onClose={onClose}
            footer={(
                <>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl border border-transparent bg-white/[0.04] px-3.5 py-2 text-sm text-sparkle-text-secondary transition-colors hover:bg-white/[0.07] hover:text-sparkle-text"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={() => onTest(trimmedDraft)}
                        disabled={!hasKey || status === 'testing'}
                        className={cn(
                            'rounded-xl border border-white/10 px-3.5 py-2 text-sm text-sparkle-text transition-colors',
                            !hasKey || status === 'testing'
                                ? 'cursor-not-allowed bg-white/[0.03] text-white/35'
                                : 'bg-white/[0.05] hover:bg-white/[0.08]'
                        )}
                    >
                        {status === 'testing' ? 'Testing...' : 'Test'}
                    </button>
                    <button
                        type="button"
                        onClick={() => onSave(trimmedDraft)}
                        disabled={!hasChanges}
                        className={cn(
                            'rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors',
                            hasChanges
                                ? 'border-emerald-500/35 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/22'
                                : 'cursor-not-allowed border-white/10 bg-white/[0.03] text-white/35'
                        )}
                    >
                        Save
                    </button>
                </>
            )}
        >
            <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">API key</p>
                    <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 font-mono text-[10px] text-white/45">
                        {keyHint}
                    </span>
                </div>
                <div className="relative">
                    <input
                        type={showKey ? 'text' : 'password'}
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        placeholder={placeholder}
                        className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 pr-12 text-sm font-mono text-sparkle-text placeholder:text-white/28 outline-none transition-colors hover:bg-white/[0.05] focus:border-white/20 focus:bg-white/[0.05]"
                    />
                    <button
                        type="button"
                        onClick={() => setShowKey((current) => !current)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-sparkle-text-muted transition-colors hover:text-sparkle-text"
                        title={showKey ? 'Hide key' : 'Show key'}
                    >
                        {showKey ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-sparkle-text-secondary">
                    <span>{hasKey ? 'Saved locally.' : 'No key.'}</span>
                    <a
                        href={docsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sparkle-text transition-colors hover:text-white"
                    >
                        <ExternalLink size={13} />
                        Get API key
                    </a>
                </div>
            </div>

            {status === 'success' ? (
                <ProviderMessageRow
                    tone="success"
                    text="Connection ok."
                />
            ) : null}

            {status === 'error' ? <ProviderMessageRow tone="danger" text={error} /> : null}
        </ProviderModalShell>
    )
}

export function CodexProviderModal({
    open,
    commitModel,
    pullRequestModel,
    modelOptions,
    modelsError,
    status,
    error,
    onClose,
    onSave,
    onTest
}: {
    open: boolean
    commitModel: string
    pullRequestModel: string
    modelOptions: ModelOption[]
    modelsError: string
    status: ProviderStatus
    error: string
    onClose: () => void
    onSave: (commitModel: string, pullRequestModel: string) => void
    onTest: (commitModel: string, pullRequestModel: string) => void
}) {
    const [draftCommitModel, setDraftCommitModel] = useState(commitModel)
    const [draftPullRequestModel, setDraftPullRequestModel] = useState(pullRequestModel)

    useEffect(() => {
        if (!open) return
        setDraftCommitModel(commitModel)
        setDraftPullRequestModel(pullRequestModel)
    }, [open, commitModel, pullRequestModel])

    const hasChanges = draftCommitModel !== commitModel || draftPullRequestModel !== pullRequestModel
    const connectionTag = status === 'success'
        ? { label: 'Connected', tone: 'success' as const }
        : status === 'testing'
            ? { label: 'Testing', tone: 'accent' as const }
            : status === 'error'
                ? { label: 'Unavailable', tone: 'danger' as const }
                : { label: 'Local CLI', tone: 'neutral' as const }

    return (
        <ProviderModalShell
            open={open}
            provider="codex"
            title="Configure Codex"
            description="Choose commit and PR models."
            tags={[
                connectionTag,
                { label: 'No API key', tone: 'neutral' }
            ]}
            onClose={onClose}
            footer={(
                <>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl border border-transparent bg-white/[0.04] px-3.5 py-2 text-sm text-sparkle-text-secondary transition-colors hover:bg-white/[0.07] hover:text-sparkle-text"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={() => onTest(draftCommitModel, draftPullRequestModel)}
                        disabled={status === 'testing'}
                        className={cn(
                            'rounded-xl border border-white/10 px-3.5 py-2 text-sm text-sparkle-text transition-colors',
                            status === 'testing'
                                ? 'cursor-not-allowed bg-white/[0.03] text-white/35'
                                : 'bg-white/[0.05] hover:bg-white/[0.08]'
                        )}
                    >
                        {status === 'testing' ? 'Testing...' : 'Test Codex'}
                    </button>
                    <button
                        type="button"
                        onClick={() => onSave(draftCommitModel, draftPullRequestModel)}
                        disabled={!hasChanges}
                        className={cn(
                            'rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors',
                            hasChanges
                                ? 'border-emerald-500/35 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/22'
                                : 'cursor-not-allowed border-white/10 bg-white/[0.03] text-white/35'
                        )}
                    >
                        Save
                    </button>
                </>
            )}
        >
            <div className="grid gap-4 md:grid-cols-2">
                <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">Commit message model</p>
                    <Select
                        value={draftCommitModel}
                        onChange={setDraftCommitModel}
                        options={modelOptions.map((option) => ({
                            value: option.id,
                            label: option.label
                        }))}
                        placeholder="Select a Codex model"
                    />
                </div>
                <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">Pull request model</p>
                    <Select
                        value={draftPullRequestModel}
                        onChange={setDraftPullRequestModel}
                        options={modelOptions.map((option) => ({
                            value: option.id,
                            label: option.label
                        }))}
                        placeholder="Select a Codex model"
                    />
                </div>
            </div>

            {modelsError ? <ProviderMessageRow tone="danger" text={modelsError} /> : null}
            {status === 'success' ? (
                <ProviderMessageRow
                    tone="success"
                    text="Codex CLI responded."
                />
            ) : null}
            {status === 'error' ? <ProviderMessageRow tone="danger" text={error} /> : null}
        </ProviderModalShell>
    )
}

function ProviderModalShell({
    open,
    provider,
    title,
    description,
    tags,
    children,
    footer,
    onClose
}: {
    open: boolean
    provider: CommitAIProvider
    title: string
    description: string
    tags: ProviderStatusTag[]
    children: ReactNode
    footer: ReactNode
    onClose: () => void
}) {
    const colors = PROVIDER_COLORS[provider]

    useEffect(() => {
        if (!open) return
        const originalOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            document.body.style.overflow = originalOverflow
        }
    }, [open])

    if (!open || typeof document === 'undefined') return null

    return createPortal(
        <div
            className="fixed inset-0 z-[140] flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-md"
            onClick={onClose}
        >
            <div
                className="w-full max-w-xl rounded-2xl border border-white/10 bg-sparkle-card p-5 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-3">
                            <div className={cn('rounded-xl border border-white/10 p-2.5', colors.bg)}>
                                <Zap size={19} className={colors.icon} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="text-lg font-semibold text-sparkle-text">{title}</h3>
                                    {tags.map((tag) => (
                                        <StatusPill key={`${title}-${tag.label}`} tone={tag.tone}>
                                            {tag.label}
                                        </StatusPill>
                                    ))}
                                </div>
                                <p className="mt-1 text-sm text-sparkle-text-secondary">{description}</p>
                            </div>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg border border-transparent bg-white/[0.04] p-2 text-sparkle-text-secondary transition-colors hover:bg-white/[0.07] hover:text-sparkle-text"
                        aria-label="Close modal"
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="mt-6 space-y-4">{children}</div>

                <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>
            </div>
        </div>,
        document.body
    )
}

function ProviderMessageRow({
    tone,
    text,
    className,
    compact = false
}: {
    tone: ProviderMessage['tone']
    text: string
    className?: string
    compact?: boolean
}) {
    return (
        <div
            className={cn(
                compact ? 'flex items-start gap-2 rounded-lg border px-3 py-2 text-xs' : 'flex items-start gap-2 rounded-xl border px-4 py-3 text-sm',
                tone === 'success' && 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200',
                tone === 'danger' && 'border-red-500/25 bg-red-500/10 text-red-200',
                tone === 'neutral' && 'border-white/10 bg-white/[0.04] text-sparkle-text-secondary',
                className
            )}
        >
            {tone === 'success' ? <Check size={16} className="mt-0.5 shrink-0" /> : <AlertCircle size={16} className="mt-0.5 shrink-0" />}
            <span>{text}</span>
        </div>
    )
}
