import { memo } from 'react'
import { Archive, Bot, Folder, MoreHorizontal, PanelRightClose, PanelRightOpen, Pencil, SquarePen, Trash2 } from 'lucide-react'
import { FileActionsMenu, type FileActionsMenuItem } from '@/components/ui/FileActionsMenu'

export const AssistantConversationHeader = memo(function AssistantConversationHeader(props: {
    rightPanelOpen: boolean
    rightPanelMode: 'none' | 'details' | 'plan' | 'review'
    showRightSidebarToggle?: boolean
    planPanelAvailable: boolean
    planProgressLabel: string | null
    planIsComplete: boolean
    leftSidebarCollapsed: boolean
    pinnedBubbleHeaderInset?: number
    latestProjectLabel: string
    selectedSessionTitle: string
    selectedSessionMode: 'work' | 'playground'
    zyraProfile: 'default' | 'builder'
    activeThreadIsSubagent: boolean
    activeThreadLabel: string | null
    selectedProjectTooltip: string
    selectedProjectPath: string | null
    projectDirectoryLocked: boolean
    preferredShell: 'powershell' | 'cmd'
    gitRefreshToken: string
    showPlaygroundTerminalAccessControl: boolean
    playgroundTerminalAccess: boolean
    actionsDisabled?: boolean
    onToggleLeftSidebar: () => void
    onPlaygroundTerminalAccessChange: (enabled: boolean) => void
    onTogglePlanPanel: () => void
    onCreateThread: () => void
    onRenameChat: () => void
    onChooseProject: () => void
    onArchiveChat: () => void
    onDeleteChat: () => void
    onToggleRightSidebar: () => void
}) {
    const {
        pinnedBubbleHeaderInset = 0,
        selectedSessionTitle,
        latestProjectLabel,
        selectedProjectPath,
        selectedProjectTooltip,
        projectDirectoryLocked,
        activeThreadIsSubagent,
        activeThreadLabel,
        rightPanelOpen,
        rightPanelMode,
        showRightSidebarToggle = false,
        actionsDisabled = false,
        onCreateThread,
        onRenameChat,
        onChooseProject,
        onArchiveChat,
        onDeleteChat,
        onToggleRightSidebar
    } = props
    const resolvedPinnedBubbleHeaderInset = Math.max(0, Math.round(pinnedBubbleHeaderInset))
    const RightSidebarIcon = rightPanelOpen && rightPanelMode === 'review' ? PanelRightClose : PanelRightOpen
    const headerMenuItems: FileActionsMenuItem[] = [
        {
            id: 'new-thread',
            label: 'New thread',
            icon: <SquarePen size={13} />,
            disabled: actionsDisabled,
            onSelect: onCreateThread
        },
        {
            id: 'rename',
            label: 'Rename chat',
            icon: <Pencil size={13} />,
            disabled: actionsDisabled,
            onSelect: onRenameChat
        },
        {
            id: 'project',
            label: projectDirectoryLocked ? 'Project locked' : selectedProjectPath ? 'Change project' : 'Attach project',
            icon: <Folder size={13} />,
            disabled: actionsDisabled || projectDirectoryLocked,
            onSelect: onChooseProject
        },
        {
            id: 'archive',
            label: 'Archive chat',
            icon: <Archive size={13} />,
            disabled: actionsDisabled,
            onSelect: onArchiveChat
        },
        {
            id: 'delete',
            label: 'Delete chat',
            icon: <Trash2 size={13} />,
            disabled: actionsDisabled,
            danger: true,
            onSelect: onDeleteChat
        }
    ]

    return (
        <div className="flex h-10 shrink-0 items-center border-b border-white/[0.06] bg-sparkle-card/95 px-4">
            <div
                aria-hidden="true"
                className="shrink-0 transition-[width] duration-[520ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
                style={{ width: `${resolvedPinnedBubbleHeaderInset}px` }}
            />
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                {selectedProjectPath ? (
                    projectDirectoryLocked ? (
                        <span
                            className="inline-flex min-w-0 max-w-[220px] shrink items-center gap-1.5 rounded-md border border-white/[0.07] bg-white/[0.025] px-2 py-1 text-[10px] font-medium leading-none text-sparkle-text-muted"
                            title={`${selectedProjectTooltip}\nProject directory locked after the chat started.`}
                        >
                            <Folder size={10} className="shrink-0" />
                            <span className="truncate">{latestProjectLabel}</span>
                        </span>
                    ) : (
                        <button
                            type="button"
                            onClick={onChooseProject}
                            disabled={actionsDisabled}
                            className="inline-flex min-w-0 max-w-[220px] shrink items-center gap-1.5 rounded-md border border-white/[0.07] bg-white/[0.025] px-2 py-1 text-[10px] font-medium leading-none text-sparkle-text-muted transition-colors hover:border-white/[0.12] hover:bg-white/[0.045] hover:text-sparkle-text-secondary disabled:cursor-not-allowed disabled:opacity-50"
                            title={selectedProjectTooltip}
                        >
                            <Folder size={10} className="shrink-0" />
                            <span className="truncate">{latestProjectLabel}</span>
                        </button>
                    )
                ) : null}
                {selectedProjectPath ? <span className="shrink-0 text-xs text-sparkle-text-muted/45" aria-hidden="true">/</span> : null}
                <div className="flex min-w-0 max-w-full items-center gap-1.5 overflow-hidden">
                    <h2 className="min-w-0 truncate text-[13px] font-semibold leading-none text-sparkle-text/90">
                        {selectedSessionTitle}
                    </h2>
                    <FileActionsMenu
                        items={headerMenuItems}
                        title="Chat actions"
                        triggerIcon={<MoreHorizontal size={15} className="rotate-90" />}
                        presentation="portal"
                        buttonClassName="size-6 rounded-md border-transparent bg-transparent p-0 text-sparkle-text-muted hover:border-transparent hover:bg-white/[0.045] hover:text-sparkle-text"
                        openButtonClassName="rounded-md border-transparent bg-white/[0.045] p-0 text-sparkle-text"
                    />
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
            {showRightSidebarToggle ? (
                <button
                    type="button"
                    onClick={onToggleRightSidebar}
                    className="ml-2 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-sparkle-text-muted transition-colors hover:bg-white/[0.045] hover:text-sparkle-text"
                    title={rightPanelOpen ? 'Close review workspace' : 'Open review workspace'}
                    aria-label={rightPanelOpen ? 'Close review workspace' : 'Open review workspace'}
                    aria-pressed={rightPanelOpen && rightPanelMode === 'review'}
                >
                    <RightSidebarIcon size={15} strokeWidth={1.7} />
                </button>
            ) : null}
        </div>
    )
})
