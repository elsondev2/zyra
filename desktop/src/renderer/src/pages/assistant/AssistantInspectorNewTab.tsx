import { memo, useEffect, useState } from 'react'
import { ArrowUpRight, Bot, FolderTree, GitCompareArrows, Globe2, Library, SquareTerminal, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type WorkspaceChoice = {
    id: 'review' | 'browser' | 'terminal' | 'subagents' | 'resources' | 'explorer'
    label: string
    icon: LucideIcon
    available: boolean
}

const WORKSPACE_CHOICES: WorkspaceChoice[] = [
    { id: 'review', label: 'Review', icon: GitCompareArrows, available: true },
    { id: 'browser', label: 'Browser', icon: Globe2, available: true },
    { id: 'terminal', label: 'Terminal', icon: SquareTerminal, available: true },
    { id: 'subagents', label: 'Agents', icon: Bot, available: true },
    { id: 'resources', label: 'Resources', icon: Library, available: true },
    { id: 'explorer', label: 'Explorer', icon: FolderTree, available: true }
]

export const AssistantInspectorNewTab = memo(function AssistantInspectorNewTab({
    reviewOpen,
    browserOpen,
    explorerOpen,
    terminalOpen,
    resourcesOpen,
    subagentsOpen,
    onSelectReview,
    onSelectBrowser,
    onSelectExplorer,
    onSelectTerminal,
    onSelectResources,
    onSelectSubagents
}: {
    reviewOpen: boolean
    browserOpen: boolean
    explorerOpen: boolean
    terminalOpen: boolean
    resourcesOpen: boolean
    subagentsOpen: boolean
    onSelectReview: () => void
    onSelectBrowser: () => void
    onSelectExplorer: () => void
    onSelectTerminal: () => void
    onSelectResources: () => void
    onSelectSubagents: () => void
}) {
    const [noticeChoiceId, setNoticeChoiceId] = useState<WorkspaceChoice['id'] | null>(null)
    const noticeChoice = WORKSPACE_CHOICES.find((choice) => choice.id === noticeChoiceId) || null
    const NoticeIcon = noticeChoice?.icon || null

    useEffect(() => {
        if (!noticeChoiceId) return
        const timeoutId = window.setTimeout(() => setNoticeChoiceId(null), 1800)
        return () => window.clearTimeout(timeoutId)
    }, [noticeChoiceId])

    return (
        <section className="relative flex min-h-0 flex-1 items-center justify-center bg-[color-mix(in_srgb,var(--color-bg)_94%,black)] px-3 py-4" aria-label="Choose an Inspector workspace">
            <div className="grid w-full max-w-[306px] grid-cols-3 items-stretch gap-2">
                {WORKSPACE_CHOICES.map((choice) => {
                    const available = choice.available
                    const choiceOpen = choice.id === 'review'
                        ? reviewOpen
                        : choice.id === 'browser'
                            ? browserOpen
                            : choice.id === 'explorer'
                                ? explorerOpen
                                : choice.id === 'terminal'
                                    ? terminalOpen
                                    : choice.id === 'subagents'
                                        ? subagentsOpen
                                        : choice.id === 'resources' && resourcesOpen
                    const ChoiceIcon = choice.icon
                    return (
                        <button
                            key={choice.id}
                            type="button"
                            onClick={() => {
                                if (choice.id === 'review') {
                                    onSelectReview()
                                    return
                                }
                                if (choice.id === 'browser') {
                                    onSelectBrowser()
                                    return
                                }
                                if (choice.id === 'explorer') {
                                    onSelectExplorer()
                                    return
                                }
                                if (choice.id === 'terminal') {
                                    onSelectTerminal()
                                    return
                                }
                                if (choice.id === 'resources') {
                                    onSelectResources()
                                    return
                                }
                                if (choice.id === 'subagents') {
                                    onSelectSubagents()
                                    return
                                }
                                setNoticeChoiceId(choice.id)
                            }}
                            className={cn(
                                'group relative flex min-h-[72px] min-w-0 flex-col items-center justify-center gap-2 rounded-lg border p-2 text-center outline-none transition-[background-color,border-color,color,transform] duration-150 focus-visible:ring-1 focus-visible:ring-[var(--accent-primary)]/50 active:translate-y-0',
                                available
                                    ? 'border-[color-mix(in_srgb,var(--accent-primary)_24%,transparent)] bg-[color-mix(in_srgb,var(--accent-primary)_7%,var(--color-card))] text-sparkle-text hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--accent-primary)_38%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent-primary)_11%,var(--color-card))] active:bg-[color-mix(in_srgb,var(--accent-primary)_15%,var(--color-card))]'
                                    : 'border-[color-mix(in_srgb,var(--color-text)_6%,transparent)] bg-[color-mix(in_srgb,var(--color-card)_38%,transparent)] text-sparkle-text-muted/45 hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--color-text)_11%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-card)_58%,transparent)] hover:text-sparkle-text-muted/75 active:bg-[color-mix(in_srgb,var(--color-card)_68%,transparent)]'
                            )}
                            aria-label={available
                                ? (choiceOpen ? `Go to open ${choice.label} tab` : `Open ${choice.label} workspace`)
                                : `${choice.label} is coming later`}
                        >
                            {choiceOpen ? <ArrowUpRight size={12} className="absolute right-2 top-2 text-[var(--accent-primary)]/80" /> : null}
                            <ChoiceIcon size={17} className={cn('transition-colors duration-150', available ? 'text-[var(--accent-primary)]' : 'text-sparkle-text-muted/40 group-hover:text-sparkle-text-muted/70')} />
                            <span className="block max-w-full truncate text-[10px] font-semibold">{choice.label}</span>
                        </button>
                    )
                })}
            </div>

            {noticeChoice && NoticeIcon ? (
                <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-card)_94%,var(--color-bg))] px-3 py-1.5 text-[9px] text-sparkle-text-secondary shadow-lg animate-[inspector-toast-in_180ms_ease-out_both]" role="status">
                    <NoticeIcon size={11} className="text-[var(--accent-primary)]" />
                    {noticeChoice.label} is still in the workshop.
                </div>
            ) : null}
        </section>
    )
})
