import { memo, useState } from 'react'
import { Archive, Bot, Check, Copy, Folder, MoreHorizontal, PanelRightClose, PanelRightOpen, Pencil, Radio, SquarePen, Trash2 } from 'lucide-react'
import { FileActionsMenu, type FileActionsMenuItem } from '@/components/ui/FileActionsMenu'

export const AssistantConversationHeader = memo(function AssistantConversationHeader(props: {
    rightPanelOpen: boolean
    rightPanelMode: 'none' | 'details' | 'plan' | 'review'
    showRightSidebarToggle?: boolean
    selectedSessionTitle: string
    canonicalThreadId: string | null
    canonicalPresence?: {
        state: 'detached' | 'ready' | 'running' | 'background'
        clients: Array<{ clientId: string; surface: string }>
        latestSequence?: number
    } | null
    showPresenceBadge?: boolean
    showDiagnostics?: boolean
    activeThreadIsSubagent: boolean
    activeThreadLabel: string | null
    selectedProjectTooltip: string
    selectedProjectPath: string | null
    latestProjectLabel: string
    projectDirectoryLocked: boolean
    actionsDisabled?: boolean
    onCreateThread: () => void
    onRenameChat: () => void
    onCreateProjectChat: () => void
    onChooseProject: () => void
    onArchiveChat: () => void
    onDeleteChat: () => void
    onToggleRightSidebar: () => void
}) {
    const {
        selectedSessionTitle,
        canonicalThreadId,
        canonicalPresence,
        showPresenceBadge = true,
        showDiagnostics = false,
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
        onCreateProjectChat,
        onChooseProject,
        onArchiveChat,
        onDeleteChat,
        onToggleRightSidebar
    } = props
    const [threadIdCopied, setThreadIdCopied] = useState(false)
    const RightSidebarIcon = rightPanelOpen && rightPanelMode === 'review' ? PanelRightClose : PanelRightOpen
    const remoteSurfaces = [...new Set((canonicalPresence?.clients || [])
        .map((client) => client.surface.trim().toLowerCase())
        .filter((surface) => surface && surface !== 'desktop'))]
    const remotePresenceLabel = showPresenceBadge && remoteSurfaces.length > 0
        ? `${canonicalPresence?.state === 'running' ? 'Running' : canonicalPresence?.state === 'background' ? 'Background work' : 'Open'} in ${remoteSurfaces.map((surface) => surface === 'tui' ? 'TUI' : surface).join(' + ')}`
        : null
    const diagnosticsLabel = showDiagnostics
        ? canonicalPresence
            ? `${canonicalPresence.state}${typeof canonicalPresence.latestSequence === 'number' ? ` · seq ${canonicalPresence.latestSequence}` : ''}`
            : 'presence unavailable'
        : null
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
            id: 'copy-thread-id',
            label: threadIdCopied ? 'Thread ID copied' : 'Copy thread ID',
            icon: threadIdCopied ? <Check size={13} /> : <Copy size={13} />,
            disabled: actionsDisabled || !canonicalThreadId,
            onSelect: async () => {
                if (!canonicalThreadId) return
                try {
                    await navigator.clipboard.writeText(canonicalThreadId)
                    setThreadIdCopied(true)
                    window.setTimeout(() => setThreadIdCopied(false), 1600)
                } catch {}
            }
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
        <div className="drag-region flex h-full min-w-0 items-center px-3">
            <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                {selectedProjectPath ? (
                    <button
                        type="button"
                        onClick={onCreateProjectChat}
                        disabled={actionsDisabled}
                        className="inline-flex min-w-0 max-w-[184px] shrink items-center gap-1.5 text-[12px] font-medium leading-none text-sparkle-text-muted/65 transition-colors hover:text-sparkle-text-secondary focus:outline-none focus-visible:text-sparkle-text active:text-sparkle-text disabled:cursor-not-allowed disabled:opacity-50"
                        title={`Start a new chat in ${latestProjectLabel}\n${selectedProjectTooltip}`}
                        aria-label={`Start a new chat in ${latestProjectLabel}`}
                    >
                        <Folder size={12} strokeWidth={1.7} className="shrink-0" />
                        <span className="truncate">{latestProjectLabel}</span>
                    </button>
                ) : null}
                {selectedProjectPath ? <span className="shrink-0 px-0.5 text-[12px] text-sparkle-text-muted/35" aria-hidden="true">/</span> : null}
                <div className="flex min-w-0 items-center gap-0.5 overflow-hidden">
                    <h2 className="min-w-0 max-w-[min(360px,35vw)] truncate text-[12px] font-semibold leading-none text-sparkle-text/90">
                        {selectedSessionTitle}
                    </h2>
                    <FileActionsMenu
                        items={headerMenuItems}
                        title="Chat actions"
                        triggerIcon={<MoreHorizontal size={14} className="rotate-90" />}
                        presentation="portal"
                        buttonClassName="size-5 rounded-md border-transparent bg-transparent p-0 text-sparkle-text-muted hover:border-transparent hover:bg-[var(--surface-hover)] hover:text-sparkle-text"
                        openButtonClassName="rounded-md border-transparent bg-[var(--surface-hover)] p-0 text-sparkle-text"
                    />
                </div>
                {activeThreadIsSubagent && activeThreadLabel ? (
                    <span
                        className="inline-flex max-w-[180px] shrink-0 items-center gap-1 rounded-full border border-violet-400/20 bg-violet-500/[0.08] px-2 py-0.5 text-[9px] font-medium leading-none text-violet-100"
                        title={`Viewing subagent thread: ${activeThreadLabel}`}
                    >
                        <Bot size={9} />
                        <span className="truncate">{activeThreadLabel}</span>
                    </span>
                ) : null}
                {remotePresenceLabel ? (
                    <span
                        className="inline-flex max-w-[160px] shrink-0 items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-500/[0.07] px-2 py-0.5 text-[9px] font-medium leading-none text-emerald-100"
                        title={`${remotePresenceLabel}. This surface shares the same canonical worker and transcript.`}
                    >
                        <Radio size={9} />
                        <span className="truncate">{remotePresenceLabel}</span>
                    </span>
                ) : null}
                {diagnosticsLabel ? (
                    <span
                        className="inline-flex max-w-[150px] shrink-0 items-center gap-1 rounded-full border border-[var(--surface-divider)] bg-[var(--surface-hover)] px-2 py-0.5 font-mono text-[8px] leading-none text-sparkle-text-muted"
                        title="Canonical worker presence and replay sequence"
                    >
                        <Radio size={8} />
                        <span className="truncate">{diagnosticsLabel}</span>
                    </span>
                ) : null}
            </div>
            {showRightSidebarToggle ? (
                <button
                    type="button"
                    onClick={onToggleRightSidebar}
                    className="ml-2 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-sparkle-text-muted transition-colors hover:bg-[var(--surface-hover)] hover:text-sparkle-text"
                    title={rightPanelOpen ? 'Close review workspace' : 'Open review workspace'}
                    aria-label={rightPanelOpen ? 'Close review workspace' : 'Open review workspace'}
                    aria-pressed={rightPanelOpen && rightPanelMode === 'review'}
                >
                    <RightSidebarIcon size={14} strokeWidth={1.7} />
                </button>
            ) : null}
        </div>
    )
})
