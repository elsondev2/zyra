import { memo, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, FileSearch, LoaderCircle, Search, TriangleAlert } from 'lucide-react'
import { VscodeEntryIcon } from '@/components/ui/VscodeEntryIcon'
import { formatAssistantRelativeTime } from '@/lib/assistant/selectors'
import { useSettings } from '@/lib/settings'
import { cn } from '@/lib/utils'
import type { AssistantDiffTarget, AssistantDiffTurn } from './assistant-diff-types'

type ReviewTurnFilter = 'all' | 'latest' | 'with-changes' | 'without-changes'

const INITIAL_VISIBLE_TURNS = 40
const LATEST_TURN_LIMIT = 10
const VISIBLE_FILE_LINK_LIMIT = 3

const FILTERS: Array<{ id: ReviewTurnFilter; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'latest', label: 'Latest' },
    { id: 'with-changes', label: 'Changes' },
    { id: 'without-changes', label: 'No changes' }
]

export const AssistantReviewLanding = memo(function AssistantReviewLanding({
    threadId,
    turns,
    activeTurnId,
    ready,
    loading,
    error,
    onOpenTurn,
    onOpenFile,
    onOpenTurnInTab
}: {
    threadId: string | null
    turns: AssistantDiffTurn[]
    activeTurnId: string | null
    ready: boolean
    loading: boolean
    error: string | null
    onOpenTurn: (turnId: string) => void
    onOpenFile: (turnId: string, target: AssistantDiffTarget) => void
    onOpenTurnInTab: (turnId: string) => void
}) {
    const { settings } = useSettings()
    const iconTheme = settings.theme === 'light' ? 'light' : 'dark'
    const [query, setQuery] = useState('')
    const deferredQuery = useDeferredValue(query)
    const [filter, setFilter] = useState<ReviewTurnFilter>('all')
    const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_TURNS)
    const [persistedSearchTurnIds, setPersistedSearchTurnIds] = useState<ReadonlySet<string> | null>(null)
    const filteredTurns = useMemo(() => {
        const normalizedQuery = deferredQuery.trim().toLowerCase()
        let next = filter === 'latest'
            ? turns.slice(0, LATEST_TURN_LIMIT)
            : filter === 'with-changes'
                ? turns.filter((turn) => turn.changes.length > 0)
                : filter === 'without-changes'
                    ? turns.filter((turn) => turn.changes.length === 0)
                    : turns
        if (normalizedQuery) {
            next = next.filter((turn) => turn.searchText.includes(normalizedQuery) || persistedSearchTurnIds?.has(turn.id))
        }
        return next
    }, [deferredQuery, filter, persistedSearchTurnIds, turns])
    const visibleTurns = filteredTurns.slice(0, visibleCount)
    const hiddenTurnCount = Math.max(0, filteredTurns.length - visibleTurns.length)

    useEffect(() => {
        setVisibleCount(INITIAL_VISIBLE_TURNS)
    }, [filter, query])

    useEffect(() => {
        const normalizedQuery = deferredQuery.trim()
        if (!threadId || !normalizedQuery) {
            setPersistedSearchTurnIds(null)
            return
        }
        setPersistedSearchTurnIds(null)
        let cancelled = false
        const timeoutId = window.setTimeout(() => {
            void window.devscope.assistant.searchTurns({ threadId, query: normalizedQuery }).then((result) => {
                if (cancelled || !result.success) return
                setPersistedSearchTurnIds(new Set(result.result.turnIds))
            })
        }, 160)
        return () => {
            cancelled = true
            window.clearTimeout(timeoutId)
        }
    }, [deferredQuery, threadId])

    return (
        <section className="flex min-h-0 flex-1 flex-col bg-[color-mix(in_srgb,var(--color-bg)_94%,black)] text-sparkle-text-secondary" aria-label="Review this chat">
            <div className="shrink-0 bg-[var(--color-bg)] px-3 pt-3 shadow-[inset_0_-1px_0_color-mix(in_srgb,var(--color-text)_8%,transparent)]">
                <label className="mb-3 flex h-9 items-center gap-2.5 rounded-[10px] border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-card)_94%,var(--color-bg))] px-3 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--color-text)_4%,transparent),0_6px_18px_rgba(0,0,0,0.1)] transition-colors focus-within:border-[var(--accent-primary)]/45">
                    <Search size={14} className="shrink-0 text-sparkle-text-muted/65" />
                    <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search prompts, final responses, and files"
                        className="min-w-0 flex-1 bg-transparent text-[12px] text-sparkle-text outline-none placeholder:text-sparkle-text-muted/55"
                    />
                    {loading ? <LoaderCircle size={11} className="shrink-0 animate-spin text-[var(--accent-primary)]/65" /> : null}
                    <span className="shrink-0 font-mono text-[10px] text-sparkle-text-muted/55">{ready ? turns.length : '—'} turns</span>
                </label>

                {ready && error ? (
                    <div className="mb-2 flex items-start gap-2 rounded-lg border border-amber-400/15 bg-amber-500/[0.06] px-2.5 py-2 text-[10px] leading-4 text-amber-100/75">
                        <TriangleAlert size={12} className="mt-0.5 shrink-0" />
                        <span>{error}</span>
                    </div>
                ) : null}

                <div className="flex gap-1" aria-label="Turn filters">
                    {FILTERS.map((entry) => (
                        <button
                            key={entry.id}
                            type="button"
                            onClick={() => setFilter(entry.id)}
                            className={cn(
                                'rounded-t-md border-b-2 px-2.5 pb-2.5 pt-1 text-[11px] font-semibold transition-colors duration-75',
                                filter === entry.id
                                    ? 'border-[var(--accent-primary)] bg-[color-mix(in_srgb,var(--accent-primary)_5%,transparent)] text-sparkle-text'
                                    : 'border-transparent text-sparkle-text-muted/60 hover:bg-[color-mix(in_srgb,var(--color-text)_4%,transparent)] hover:text-sparkle-text-secondary'
                            )}
                            aria-pressed={filter === entry.id}
                        >
                            {entry.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto bg-[color-mix(in_srgb,var(--color-bg)_92%,black)] pb-10" role="table" aria-label="Complete chat turn index">
                <div className="sticky top-0 z-10 grid grid-cols-[2.6rem_minmax(7rem,1fr)_minmax(6.5rem,0.72fr)] gap-2 border-b border-[color-mix(in_srgb,var(--color-text)_9%,transparent)] bg-[color-mix(in_srgb,var(--color-bg)_97%,black)] px-3 py-2 text-[8px] font-bold uppercase tracking-[0.08em] text-sparkle-text-muted/50" role="row">
                    <span role="columnheader">Turn</span>
                    <span role="columnheader">Conversation</span>
                    <span role="columnheader">Files</span>
                </div>

                {!ready ? (
                    <div className="flex min-h-52 items-center justify-center px-7 text-center">
                        {error ? (
                            <div>
                                <TriangleAlert size={18} className="mx-auto text-amber-300/75" />
                                <p className="mt-3 text-[12px] font-medium text-sparkle-text-secondary">Could not build the Review index</p>
                                <p className="mt-1 text-[10px] leading-4 text-sparkle-text-muted/70">{error}</p>
                            </div>
                        ) : (
                            <div>
                                <LoaderCircle size={18} className="mx-auto animate-spin text-[var(--accent-primary)]/70" />
                                <p className="mt-3 text-[11px] text-sparkle-text-muted/70">Building the complete turn index…</p>
                            </div>
                        )}
                    </div>
                ) : visibleTurns.length > 0 ? visibleTurns.map((turn) => {
                    const active = turn.id === activeTurnId
                    const visibleFiles = turn.files.slice(0, VISIBLE_FILE_LINK_LIMIT)
                    return (
                        <div
                            key={turn.id}
                            role="row"
                            tabIndex={0}
                            onClick={() => onOpenTurn(turn.id)}
                            onKeyDown={(event) => {
                                if (event.key !== 'Enter' && event.key !== ' ') return
                                event.preventDefault()
                                onOpenTurn(turn.id)
                            }}
                            className={cn(
                                'group grid cursor-pointer grid-cols-[2.6rem_minmax(7rem,1fr)_minmax(6.5rem,0.72fr)] gap-2 border-b border-[color-mix(in_srgb,var(--color-text)_8%,transparent)] px-3 py-3 outline-none transition-[background-color,box-shadow] duration-75',
                                active
                                    ? 'bg-[color-mix(in_srgb,var(--accent-primary)_5%,var(--color-bg))] shadow-[inset_2px_0_0_color-mix(in_srgb,var(--accent-primary)_58%,transparent)]'
                                    : 'hover:bg-[color-mix(in_srgb,var(--color-card)_64%,var(--color-bg))] focus-visible:bg-[color-mix(in_srgb,var(--color-card)_72%,var(--color-bg))]'
                            )}
                        >
                            <div className="min-w-0" role="cell">
                                <span className={cn('block font-mono text-[10px]', active ? 'text-[var(--accent-primary)]' : 'text-sparkle-text-muted/65')}>#{turn.number}</span>
                                <span className="mt-1 block font-mono text-[8px] text-sparkle-text-muted/40">{formatAssistantRelativeTime(turn.updatedAt)}</span>
                                <button
                                    type="button"
                                    onClick={(event) => {
                                        event.stopPropagation()
                                        onOpenTurnInTab(turn.id)
                                    }}
                                    className="mt-2 inline-flex size-5 items-center justify-center rounded text-sparkle-text-muted/45 opacity-0 transition-opacity hover:bg-white/[0.05] hover:text-sparkle-text group-hover:opacity-100 focus-visible:opacity-100"
                                    aria-label={`Open turn ${turn.number} in a new workspace tab`}
                                >
                                    <ArrowUpRight size={11} />
                                </button>
                            </div>

                            <div className="min-w-0" role="cell">
                                <div className="flex min-w-0 items-baseline gap-1.5">
                                    <span className="shrink-0 text-[8px] font-bold uppercase tracking-[0.06em] text-[var(--accent-primary)]/75">You</span>
                                    <span className="truncate text-[11px] font-medium text-sparkle-text" title={turn.prompt}>{turn.prompt}</span>
                                </div>
                                <div className="mt-1.5 flex min-w-0 items-baseline gap-1.5">
                                    <span className="max-w-16 shrink-0 truncate text-[8px] font-semibold uppercase tracking-[0.05em] text-sparkle-text-muted/45" title={turn.agentLabel || 'Agent'}>{turn.agentLabel || 'Agent'}</span>
                                    <span className="truncate text-[10px] text-sparkle-text-muted/75" title={turn.response}>{turn.response}</span>
                                </div>
                                {turn.historyUnavailable ? (
                                    <span className="mt-2 inline-flex items-center gap-1 text-[8px] text-amber-200/65">
                                        <TriangleAlert size={9} /> Message history unavailable
                                    </span>
                                ) : null}
                            </div>

                            <div className="min-w-0" role="cell">
                                {visibleFiles.length > 0 ? (
                                    <div className="space-y-1">
                                        {visibleFiles.map((file) => (
                                            <button
                                                key={`${file.target.activityId}:${file.target.filePath}`}
                                                type="button"
                                                onClick={(event) => {
                                                    event.stopPropagation()
                                                    onOpenFile(turn.id, file.target)
                                                }}
                                                className="flex h-5 w-full min-w-0 items-center gap-1.5 rounded border border-[color-mix(in_srgb,var(--color-text)_7%,transparent)] bg-[color-mix(in_srgb,var(--color-card)_55%,transparent)] px-1.5 text-left font-mono text-[8px] text-sparkle-text-muted/80 transition-colors hover:border-[var(--accent-primary)]/25 hover:bg-[color-mix(in_srgb,var(--accent-primary)_5%,var(--color-card))] hover:text-sparkle-text"
                                                title={`Open ${file.target.displayPath}`}
                                            >
                                                <VscodeEntryIcon pathValue={file.target.filePath} kind="file" theme={iconTheme} className="size-3 shrink-0 opacity-80" />
                                                <span className="min-w-0 flex-1 truncate">{file.target.displayPath.split('/').pop()}</span>
                                            </button>
                                        ))}
                                        {turn.files.length > visibleFiles.length ? (
                                            <span className="block text-[8px] text-sparkle-text-muted/50">+{turn.files.length - visibleFiles.length} more files</span>
                                        ) : null}
                                        <span className="block font-mono text-[8px] text-sparkle-text-muted/50">
                                            <span className="text-emerald-300/80">+{turn.additions}</span>{' '}
                                            <span className="text-red-300/70">−{turn.deletions}</span>
                                            {turn.changes.length > turn.files.length ? ` · ${turn.changes.length} edits` : ''}
                                        </span>
                                    </div>
                                ) : (
                                    <span className="text-[9px] italic text-sparkle-text-muted/40">No file changes</span>
                                )}
                            </div>
                        </div>
                    )
                }) : (
                    <div className="flex min-h-52 items-center justify-center px-7 text-center">
                        <div>
                            <FileSearch size={18} className="mx-auto text-sparkle-text-muted/55" />
                            <p className="mt-3 text-[12px] font-medium text-sparkle-text-secondary">No matching turns</p>
                            <p className="mt-1 text-[10px] leading-4 text-sparkle-text-muted/70">Try another search or filter.</p>
                        </div>
                    </div>
                )}

                {hiddenTurnCount > 0 ? (
                    <button
                        type="button"
                        onClick={() => setVisibleCount((current) => current + INITIAL_VISIBLE_TURNS)}
                        className="flex h-10 w-full items-center justify-center border-b border-[color-mix(in_srgb,var(--color-text)_8%,transparent)] text-[10px] font-medium text-sparkle-text-muted/65 hover:bg-sparkle-card/40 hover:text-sparkle-text-secondary"
                    >
                        Show earlier turns · {hiddenTurnCount} remaining
                    </button>
                ) : null}
            </div>
        </section>
    )
})
