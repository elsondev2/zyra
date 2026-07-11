import { memo, type RefObject } from 'react'
import { Bot, MoreHorizontal, SquarePen } from 'lucide-react'
import { cn } from '@/lib/utils'

export const AssistantConversationHeader = memo(function AssistantConversationHeader(props: {
    rightPanelOpen: boolean
    rightPanelMode: 'none' | 'details' | 'plan' | 'diff'
    planPanelAvailable: boolean
    planProgressLabel: string | null
    planIsComplete: boolean
    activeHeaderMenu: 'none' | 'open-with' | 'more'
    setActiveHeaderMenu: (value: 'none' | 'open-with' | 'more') => void
    headerMenuRef: RefObject<HTMLDivElement | null>
    leftSidebarCollapsed: boolean
    latestProjectLabel: string
    selectedSessionTitle: string
    selectedSessionMode: 'work' | 'playground'
    zyraProfile: 'default' | 'builder'
    activeThreadIsSubagent: boolean
    activeThreadLabel: string | null
    selectedProjectTooltip: string
    selectedProjectPath: string | null
    preferredShell: 'powershell' | 'cmd'
    gitRefreshToken: string
    showPlaygroundTerminalAccessControl: boolean
    playgroundTerminalAccess: boolean
    onToggleLeftSidebar: () => void
    onPlaygroundTerminalAccessChange: (enabled: boolean) => void
    onTogglePlanPanel: () => void
    onCreateThread: () => void
    onToggleRightSidebar: () => void
}) {
    const {
        activeHeaderMenu,
        setActiveHeaderMenu,
        headerMenuRef,
        selectedSessionTitle,
        activeThreadIsSubagent,
        activeThreadLabel,
        onCreateThread
    } = props
    const showHeaderMenu = activeHeaderMenu === 'more'

    return (
        <div className="flex h-10 shrink-0 items-center border-b border-white/[0.06] bg-sparkle-card/95 px-4">
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                <div className="flex min-w-0 max-w-full items-center gap-1.5 overflow-hidden">
                    <h2 className="min-w-0 truncate text-[13px] font-semibold leading-none text-sparkle-text/90">
                        {selectedSessionTitle}
                    </h2>
                    <div ref={headerMenuRef} className={cn('relative flex shrink-0 items-center', activeHeaderMenu !== 'none' ? 'z-[110]' : 'z-0')}>
                        <button
                            type="button"
                            onClick={() => setActiveHeaderMenu(showHeaderMenu ? 'none' : 'more')}
                            className="inline-flex size-6 items-center justify-center rounded-md border border-transparent text-sparkle-text-muted transition-colors hover:bg-white/[0.045] hover:text-sparkle-text"
                            title="Chat actions"
                            aria-label="Chat actions"
                        >
                            <MoreHorizontal size={15} className="rotate-90" />
                        </button>
                        {showHeaderMenu ? (
                            <div className="absolute left-0 top-full z-[180] mt-2 w-44 rounded-lg border border-white/10 bg-sparkle-card p-1 shadow-[0_18px_40px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.03)]">
                                <button
                                    type="button"
                                    onClick={onCreateThread}
                                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-sparkle-text-secondary transition-colors hover:bg-sparkle-card-hover hover:text-sparkle-text"
                                >
                                    <SquarePen size={13} />
                                    New thread
                                </button>
                            </div>
                        ) : null}
                    </div>
                </div>
                {activeThreadIsSubagent && activeThreadLabel ? (
                    <span
                        className="inline-flex max-w-[220px] shrink-0 items-center gap-1 rounded-full border border-violet-400/20 bg-violet-500/[0.08] px-2 py-0.5 text-[10px] font-medium leading-none text-violet-100"
                        title={`Viewing subagent thread: ${activeThreadLabel}`}
                    >
                        <Bot size={10} />
                        <span className="truncate">{activeThreadLabel}</span>
                    </span>
                ) : null}
            </div>
        </div>
    )
})
