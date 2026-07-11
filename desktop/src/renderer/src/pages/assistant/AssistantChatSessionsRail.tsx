import { memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Archive, Bot, ChevronDown, Folder, FolderOpen, MoreHorizontal, PanelLeftOpen, Pin, PinOff, Plus, Search, Settings, SquarePen, Trash2, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { AssistantMessage, AssistantSession, AssistantThread } from '@shared/assistant/contracts'
import { useCommandPalette } from '@/lib/commandPalette'
import { AnimatedHeight } from '@/components/ui/AnimatedHeight'
import { cn } from '@/lib/utils'
import type { AssistantToastInput } from './AssistantPageHelpers'
import { RenameSessionModal } from './AssistantSessionsRailDialogs'
import { isAssistantDraftSession, resolveAssistantThreadStatusPill, resolveSessionProjectPath } from './assistant-sessions-rail-utils'

const PINNED_SESSION_IDS_KEY = 'assistant:pinned-session-ids:v1'
const BUBBLE_PREVIEW_PINNED_KEY = 'assistant:bubble-preview-pinned:v1'
const EXPANDED_PROJECT_PATH_KEYS_KEY = 'assistant:expanded-project-path-keys:v1'

function readBubblePreviewPinnedPreference(): boolean {
    try {
        return localStorage.getItem(BUBBLE_PREVIEW_PINNED_KEY) === 'true'
    } catch {
        return false
    }
}

function writeBubblePreviewPinnedPreference(pinned: boolean): void {
    try {
        localStorage.setItem(BUBBLE_PREVIEW_PINNED_KEY, String(pinned))
    } catch {
        // Keep the pin usable in-memory even when storage fails.
    }
}

function readPinnedSessionIds(): Set<string> {
    try {
        const parsed = JSON.parse(localStorage.getItem(PINNED_SESSION_IDS_KEY) || '[]') as unknown
        if (!Array.isArray(parsed)) return new Set()
        return new Set(parsed.filter((value): value is string => typeof value === 'string' && value.trim().length > 0))
    } catch {
        return new Set()
    }
}

function writePinnedSessionIds(ids: Set<string>): void {
    try {
        localStorage.setItem(PINNED_SESSION_IDS_KEY, JSON.stringify(Array.from(ids)))
    } catch {
        // Keep pinning useful in-memory even when storage fails.
    }
}

function getProjectExpansionKey(path: string): string {
    return String(path || '').trim().replace(/\\/g, '/').replace(/\/+$/g, '').toLowerCase()
}

function hasStoredExpandedProjectPathKeys(): boolean {
    try {
        return localStorage.getItem(EXPANDED_PROJECT_PATH_KEYS_KEY) !== null
    } catch {
        return false
    }
}

function readExpandedProjectPathKeys(): Set<string> {
    try {
        const parsed = JSON.parse(localStorage.getItem(EXPANDED_PROJECT_PATH_KEYS_KEY) || '[]') as unknown
        if (!Array.isArray(parsed)) return new Set()
        return new Set(parsed.map((value) => getProjectExpansionKey(String(value || ''))).filter(Boolean))
    } catch {
        return new Set()
    }
}

function writeExpandedProjectPathKeys(keys: Set<string>): void {
    try {
        localStorage.setItem(EXPANDED_PROJECT_PATH_KEYS_KEY, JSON.stringify(Array.from(keys)))
    } catch {
        // Keep project expansion usable in-memory even when storage fails.
    }
}

function getSortableTimestamp(value?: string | null): number {
    const timestamp = Date.parse(String(value || ''))
    return Number.isFinite(timestamp) ? timestamp : 0
}

function formatRelativeTime(value?: string | null): string {
    const timestamp = getSortableTimestamp(value)
    if (!timestamp) return ''

    const deltaMs = Math.max(0, Date.now() - timestamp)
    if (deltaMs < 60_000) return 'now'

    const minutes = Math.floor(deltaMs / 60_000)
    if (minutes < 60) return `${minutes}m`

    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h`

    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d`

    const weeks = Math.floor(days / 7)
    if (weeks < 5) return `${weeks}w`

    const months = Math.floor(days / 30)
    if (months < 12) return `${months}mo`

    return `${Math.floor(days / 365)}y`
}

function getThreadLastActivityAt(thread: AssistantThread | null): string {
    if (!thread) return ''

    const latestMessageAt = (thread.messages || []).reduce<string | null>((latest, message: AssistantMessage) => {
        if (message.role === 'system') return latest
        const messageAt = message.createdAt || message.updatedAt
        if (!messageAt) return latest
        if (!latest) return messageAt
        return getSortableTimestamp(messageAt) > getSortableTimestamp(latest) ? messageAt : latest
    }, null)

    return latestMessageAt || thread.createdAt
}

function getSessionLastActivityAt(session: AssistantSession): string {
    const threadMessageAt = session.threads.reduce<string | null>((latest, thread) => {
        const messageAt = getThreadLastActivityAt(thread)
        if (!latest) return messageAt
        return getSortableTimestamp(messageAt) > getSortableTimestamp(latest) ? messageAt : latest
    }, null)
    return threadMessageAt || session.updatedAt || session.createdAt
}

function isDefaultSessionTitle(title?: string | null): boolean {
    const normalized = String(title || '').trim().toLowerCase()
    return !normalized || normalized === 'new session' || normalized === 'new playground chat'
}

function deriveTitleFromMessage(text?: string | null): string {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim()
    return normalized ? normalized.slice(0, 60) : 'New chat'
}

function getSessionDisplayTitle(session: AssistantSession): string {
    if (!isDefaultSessionTitle(session.title)) return String(session.title).trim()

    const firstUserMessage = session.threads
        .flatMap((thread) => thread.messages || [])
        .find((message) => message.role === 'user' && String(message.text || '').trim().length > 0)

    return firstUserMessage ? deriveTitleFromMessage(firstUserMessage.text) : 'New chat'
}

function getThreadDisplayTitle(thread: AssistantThread, index: number): string {
    if (thread.source === 'subagent') return thread.agentNickname || thread.agentRole || `Subagent ${index + 1}`
    return index === 0 ? 'Main thread' : `Thread ${index + 1}`
}

function isThreadBusy(thread: AssistantThread | null): boolean {
    if (!thread) return false
    const state = String(thread.state || '')
    return state === 'running' || state === 'starting' || state === 'waiting' || state === 'waiting-approval' || state === 'waiting-input'
}

function getPrimaryThread(session: AssistantSession): AssistantThread | null {
    return session.threads.find((thread) => thread.source !== 'subagent') || session.threads[0] || null
}

function getSessionStatusThread(session: AssistantSession): AssistantThread | null {
    return session.threads.find((thread) => thread.id === session.activeThreadId) || getPrimaryThread(session)
}

function compareSessionsByCreatedAtDescending(left: AssistantSession, right: AssistantSession): number {
    const createdDelta = getSortableTimestamp(right.createdAt) - getSortableTimestamp(left.createdAt)
    return createdDelta || left.id.localeCompare(right.id)
}

function getSessionProjectPath(session: AssistantSession): string {
    return resolveSessionProjectPath(session)
}

function getProjectLabel(path: string): string {
    const normalized = path.replace(/[\\/]+$/g, '')
    const label = normalized.split(/[\\/]/).filter(Boolean).pop()
    return label || normalized || 'Project'
}

type ProjectGroup = {
    path: string
    label: string
    sessions: AssistantSession[]
    newestCreatedAt: string
}

export const AssistantChatSessionsRail = memo(function AssistantChatSessionsRail(props: {
    collapsed: boolean
    width: number
    sessions: AssistantSession[]
    activeSessionId: string | null
    activeThreadId: string | null
    commandPending: boolean
    onCreateChat: () => Promise<void> | void
    onCreateProjectChat: (projectPath?: string) => Promise<void> | void
    onSelectSession: (sessionId: string) => Promise<void> | void
    onSelectThread: (input: { sessionId: string; threadId: string }) => Promise<void> | void
    onRenameSession: (sessionId: string, title: string) => Promise<void> | void
    onArchiveSession: (sessionId: string, archived?: boolean) => Promise<void> | void
    onDeleteSession: (sessionId: string) => Promise<{ success: true } | { success: false; error: string }>
    onWidthChange?: (width: number) => void
    onShowToast: (input: AssistantToastInput) => void
}) {
    const {
        collapsed,
        width,
        sessions,
        activeSessionId,
        activeThreadId,
        commandPending,
        onCreateChat,
        onCreateProjectChat,
        onSelectSession,
        onSelectThread,
        onRenameSession,
        onArchiveSession,
        onDeleteSession,
        onWidthChange,
        onShowToast
    } = props
    const navigate = useNavigate()
    const { open } = useCommandPalette()
    const resizeStateRef = useRef<{ pointerId: number; startX: number; startWidth: number; width: number } | null>(null)
    const previewCloseTimerRef = useRef<number | null>(null)
    const wasCollapsedRef = useRef(collapsed)
    const shouldBootstrapProjectExpansionRef = useRef<boolean | null>(null)
    const didMountProjectExpansionPersistenceRef = useRef(false)
    if (shouldBootstrapProjectExpansionRef.current === null) {
        shouldBootstrapProjectExpansionRef.current = !hasStoredExpandedProjectPathKeys()
    }
    const [isResizing, setIsResizing] = useState(false)
    const [loadingScreenActive, setLoadingScreenActive] = useState(false)
    const [previewOpen, setPreviewOpen] = useState(() => readBubblePreviewPinnedPreference())
    const [previewPinned, setPreviewPinned] = useState(() => readBubblePreviewPinnedPreference())
    const [pendingDeleteSession, setPendingDeleteSession] = useState<AssistantSession | null>(null)
    const [renameTarget, setRenameTarget] = useState<AssistantSession | null>(null)
    const [renameDraft, setRenameDraft] = useState('')
    const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null)
    const [pinnedSessionIds, setPinnedSessionIds] = useState<Set<string>>(() => readPinnedSessionIds())
    const [expandedProjectPathKeys, setExpandedProjectPathKeys] = useState<Set<string>>(() => readExpandedProjectPathKeys())

    const activeSessions = useMemo(() => (
        sessions
            .filter((session) => !session.archived && !isAssistantDraftSession(session))
            .sort(compareSessionsByCreatedAtDescending)
    ), [sessions])

    const pinnedSessions = useMemo(() => (
        activeSessions.filter((session) => pinnedSessionIds.has(session.id))
    ), [activeSessions, pinnedSessionIds])

    const chatSessions = useMemo(() => (
        activeSessions.filter((session) => !pinnedSessionIds.has(session.id) && !getSessionProjectPath(session))
    ), [activeSessions, pinnedSessionIds])

    const projectGroups = useMemo<ProjectGroup[]>(() => {
        const groupsByPath = new Map<string, ProjectGroup>()
        for (const session of activeSessions) {
            if (pinnedSessionIds.has(session.id)) continue
            const projectPath = getSessionProjectPath(session)
            if (!projectPath) continue
            const existing = groupsByPath.get(projectPath)
            if (existing) {
                existing.sessions.push(session)
                if (getSortableTimestamp(session.createdAt) > getSortableTimestamp(existing.newestCreatedAt)) {
                    existing.newestCreatedAt = session.createdAt
                }
                continue
            }
            groupsByPath.set(projectPath, {
                path: projectPath,
                label: getProjectLabel(projectPath),
                sessions: [session],
                newestCreatedAt: session.createdAt
            })
        }
        return Array.from(groupsByPath.values())
            .sort((left, right) => (
                getSortableTimestamp(right.newestCreatedAt) - getSortableTimestamp(left.newestCreatedAt)
                || left.path.localeCompare(right.path)
            ))
    }, [activeSessions, pinnedSessionIds])

    const resolvedWidth = Math.max(260, Math.min(420, Math.round(width || 322)))
    const layoutShellStyle = {
        width: collapsed ? '0px' : `${resolvedWidth}px`,
        willChange: 'width'
    } as const
    const sidebarStyle = collapsed
        ? {
            width: `${resolvedWidth}px`,
            opacity: previewOpen ? 1 : 0,
            pointerEvents: previewOpen ? 'auto' : 'none',
            transform: previewOpen ? 'translate3d(0, 0, 0)' : 'translate3d(-18px, 0, 0)',
            transformOrigin: 'left center',
            willChange: 'opacity, transform'
        } as const
        : {
            width: `${resolvedWidth}px`,
            opacity: 1,
            pointerEvents: 'auto',
            transform: 'translate3d(0, 0, 0)',
            transformOrigin: 'left center',
            willChange: 'width, opacity'
        } as const

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const isModifier = event.ctrlKey || event.metaKey
            if (!isModifier || event.key.toLowerCase() !== 'n') return
            event.preventDefault()
            if (commandPending) return
            if (event.shiftKey) {
                void onCreateProjectChat()
                return
            }
            void onCreateChat()
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [commandPending, onCreateChat, onCreateProjectChat])

    const stopResize = useCallback((pointerId: number, handle?: HTMLButtonElement | null) => {
        const resizeState = resizeStateRef.current
        if (!resizeState) return
        resizeStateRef.current = null
        setIsResizing(false)
        onWidthChange?.(resizeState.width)
        if (handle?.hasPointerCapture(pointerId)) {
            handle.releasePointerCapture(pointerId)
        }
        document.body.style.removeProperty('cursor')
        document.body.style.removeProperty('user-select')
    }, [onWidthChange])

    const handleResizePointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
        if (collapsed || !onWidthChange || event.button !== 0) return
        event.preventDefault()
        event.stopPropagation()
        resizeStateRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startWidth: resolvedWidth,
            width: resolvedWidth
        }
        setIsResizing(true)
        event.currentTarget.setPointerCapture(event.pointerId)
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
    }, [collapsed, onWidthChange, resolvedWidth])

    const handleResizePointerMove = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
        const resizeState = resizeStateRef.current
        if (!resizeState || resizeState.pointerId !== event.pointerId || !onWidthChange) return
        event.preventDefault()
        const nextWidth = Math.max(260, Math.min(420, Math.round(resizeState.startWidth + (event.clientX - resizeState.startX))))
        resizeState.width = nextWidth
        onWidthChange(nextWidth)
    }, [onWidthChange])

    const handleResizePointerEnd = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
        const resizeState = resizeStateRef.current
        if (!resizeState || resizeState.pointerId !== event.pointerId) return
        event.preventDefault()
        stopResize(event.pointerId, event.currentTarget)
    }, [stopResize])

    useEffect(() => {
        return () => {
            resizeStateRef.current = null
            if (previewCloseTimerRef.current !== null) window.clearTimeout(previewCloseTimerRef.current)
            document.body.style.removeProperty('cursor')
            document.body.style.removeProperty('user-select')
        }
    }, [])

    useEffect(() => {
        const handleLoadingScreenState = (event: Event) => {
            const detail = (event as CustomEvent<{ active?: boolean }>).detail
            setLoadingScreenActive(Boolean(detail?.active))
        }

        window.addEventListener('zyra:loading-screen-state', handleLoadingScreenState)
        return () => window.removeEventListener('zyra:loading-screen-state', handleLoadingScreenState)
    }, [])

    const togglePinnedSession = (session: AssistantSession) => {
        setPinnedSessionIds((current) => {
            const next = new Set(current)
            const pinned = next.has(session.id)
            if (pinned) next.delete(session.id)
            else next.add(session.id)
            writePinnedSessionIds(next)
            onShowToast({ message: pinned ? 'Unpinned chat' : 'Pinned chat' })
            return next
        })
    }

    const renameSession = async (session: AssistantSession) => {
        setRenameTarget(session)
        setRenameDraft(getSessionDisplayTitle(session))
    }

    const closeRename = () => {
        setRenameTarget(null)
        setRenameDraft('')
    }

    const submitRename = async () => {
        if (!renameTarget) return
        const nextTitle = renameDraft.replace(/\s+/g, ' ').trim().slice(0, 60)
        if (!nextTitle) return
        if (nextTitle !== getSessionDisplayTitle(renameTarget)) {
            await onRenameSession(renameTarget.id, nextTitle)
        }
        closeRename()
    }

    const archiveSession = async (session: AssistantSession) => {
        await onArchiveSession(session.id, true)
        onShowToast({ message: `Archived "${getSessionDisplayTitle(session)}"` })
    }

    const deleteSession = async (session: AssistantSession) => {
        setPendingDeleteSession(session)
    }

    const confirmDeleteSession = async () => {
        if (!pendingDeleteSession || deletingSessionId) return
        const session = pendingDeleteSession
        const title = getSessionDisplayTitle(session)
        try {
            setDeletingSessionId(session.id)
            const result = await onDeleteSession(session.id)
            if (!result.success) {
                onShowToast({ message: `Failed to delete "${title}": ${result.error}`, tone: 'error' })
                return
            }
            setPendingDeleteSession(null)
            onShowToast({ message: `Deleted "${title}"` })
        } finally {
            setDeletingSessionId(null)
        }
    }

    const cancelDeleteSession = () => {
        if (deletingSessionId) return
        setPendingDeleteSession(null)
    }

    const openPreview = useCallback(() => {
        if (previewCloseTimerRef.current !== null) {
            window.clearTimeout(previewCloseTimerRef.current)
            previewCloseTimerRef.current = null
        }
        setPreviewOpen(true)
    }, [])

    const schedulePreviewClose = useCallback((delayMs = 180) => {
        if (previewPinned) return
        if (previewCloseTimerRef.current !== null) window.clearTimeout(previewCloseTimerRef.current)
        previewCloseTimerRef.current = window.setTimeout(() => {
            previewCloseTimerRef.current = null
            setPreviewOpen(false)
        }, delayMs)
    }, [previewPinned])

    useEffect(() => {
        writeBubblePreviewPinnedPreference(previewPinned)
    }, [previewPinned])

    useEffect(() => {
        const wasCollapsed = wasCollapsedRef.current
        wasCollapsedRef.current = collapsed

        if (!collapsed) {
            if (previewCloseTimerRef.current !== null) {
                window.clearTimeout(previewCloseTimerRef.current)
                previewCloseTimerRef.current = null
            }
            setPreviewOpen(false)
            setPreviewPinned(false)
            return
        }

        if (!wasCollapsed && collapsed && !loadingScreenActive) {
            setPreviewOpen(true)
            schedulePreviewClose(1100)
        }
    }, [collapsed, loadingScreenActive, schedulePreviewClose])

    const expandCollapsedSidebar = () => {
        setPreviewPinned(false)
        window.dispatchEvent(new CustomEvent('zyra:toggle-assistant-sidebar'))
    }

    const forceSchedulePreviewClose = (delayMs = 180) => {
        if (previewCloseTimerRef.current !== null) window.clearTimeout(previewCloseTimerRef.current)
        previewCloseTimerRef.current = window.setTimeout(() => {
            previewCloseTimerRef.current = null
            setPreviewOpen(false)
        }, delayMs)
    }

    const togglePreviewPinned = () => {
        if (previewPinned) {
            setPreviewPinned(false)
            forceSchedulePreviewClose()
            return
        }
        setPreviewPinned(true)
        openPreview()
    }

    const toggleProject = (path: string, currentlyExpanded: boolean) => {
        const projectKey = getProjectExpansionKey(path)
        if (!projectKey) return
        shouldBootstrapProjectExpansionRef.current = false

        if (currentlyExpanded) {
            setExpandedProjectPathKeys((current) => {
                if (!current.has(projectKey)) return current
                const next = new Set(current)
                next.delete(projectKey)
                return next
            })
            return
        }

        setExpandedProjectPathKeys((current) => {
            if (current.has(projectKey)) return current
            const next = new Set(current)
            next.add(projectKey)
            return next
        })
    }

    useEffect(() => {
        if (!didMountProjectExpansionPersistenceRef.current) {
            didMountProjectExpansionPersistenceRef.current = true
            return
        }
        writeExpandedProjectPathKeys(expandedProjectPathKeys)
    }, [expandedProjectPathKeys])

    useEffect(() => {
        if (!shouldBootstrapProjectExpansionRef.current) return
        const activeProjectPath = projectGroups.find((group) => (
            group.sessions.some((session) => session.id === activeSessionId)
        ))?.path
        if (!activeProjectPath) return

        shouldBootstrapProjectExpansionRef.current = false
        const projectKey = getProjectExpansionKey(activeProjectPath)
        if (!projectKey) return

        setExpandedProjectPathKeys((current) => {
            if (current.has(projectKey)) return current
            const next = new Set(current)
            next.add(projectKey)
            return next
        })
    }, [activeSessionId, projectGroups])

    return (
        <>
            {collapsed && !loadingScreenActive ? (
                <div
                    className="fixed bottom-0 left-0 top-[34px] z-[42] w-6"
                    onMouseEnter={openPreview}
                    onMouseLeave={() => schedulePreviewClose()}
                    aria-hidden="true"
                >
                    <div
                        className={cn(
                            'absolute left-1 top-1/2 h-16 w-1.5 -translate-y-1/2 rounded-full border border-white/[0.06] bg-white/[0.08] shadow-[0_0_18px_rgba(255,255,255,0.04)] transition-[opacity,transform,background-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
                            previewOpen ? '-translate-x-1 opacity-0' : 'translate-x-0 opacity-100 hover:bg-white/[0.12]'
                        )}
                    />
                </div>
            ) : null}
            <div
                className={cn(
                    'relative h-full shrink-0 overflow-visible transition-[width] duration-[520ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
                    isResizing && 'transition-none'
                )}
                style={layoutShellStyle}
                aria-hidden={collapsed && !previewOpen}
            >
                <aside
                    onMouseEnter={() => {
                        if (collapsed) openPreview()
                    }}
                    onMouseLeave={() => {
                        if (collapsed) schedulePreviewClose()
                    }}
                    className={cn(
                        collapsed
                            ? 'absolute bottom-3 left-2 top-2 z-[43] h-auto overflow-hidden rounded-[22px] border border-white/[0.085] bg-[#1b1829]/95 shadow-[0_24px_80px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.035)] backdrop-blur-xl transition-[opacity,transform,border-radius,box-shadow,top,bottom,left] duration-[520ms] ease-[cubic-bezier(0.22,1,0.36,1)]'
                            : 'absolute bottom-0 left-0 top-0 h-full overflow-hidden rounded-none border border-transparent bg-[#1b1829]/95 shadow-none transition-[opacity,transform,border-radius,box-shadow,top,bottom,left] duration-[520ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
                        isResizing && 'transition-none'
                    )}
                    style={sidebarStyle}
                    aria-hidden={collapsed && !previewOpen}
                >
            <div className="flex h-full flex-col px-2 py-2.5">
                <div className="shrink-0 space-y-0.5 px-0.5 pb-3">
                    <div className="flex items-center gap-1">
                        <div className="min-w-0 flex-1">
                            <RailButton
                                icon={<SquarePen size={15} strokeWidth={1.7} />}
                                label="New chat"
                                shortcut="Ctrl N"
                                disabled={commandPending}
                                onClick={() => void onCreateChat()}
                            />
                        </div>
                        {collapsed ? (
                            <div className="flex shrink-0 items-center gap-0.5">
                                <button
                                    type="button"
                                    onClick={togglePreviewPinned}
                                    className={cn(
                                        'inline-flex size-8 items-center justify-center rounded-lg text-sparkle-text-muted transition-colors hover:bg-white/[0.045] hover:text-sparkle-text',
                                        previewPinned && 'text-[#d7d0e3]'
                                    )}
                                    title={previewPinned ? 'Unpin bubble sidebar' : 'Pin bubble sidebar'}
                                    aria-label={previewPinned ? 'Unpin bubble sidebar' : 'Pin bubble sidebar'}
                                    aria-pressed={previewPinned}
                                >
                                    <Pin
                                        size={14}
                                        strokeWidth={1.8}
                                        className={cn(previewPinned && 'rotate-45 fill-current')}
                                    />
                                </button>
                                <button
                                    type="button"
                                    onClick={expandCollapsedSidebar}
                                    className="inline-flex size-8 items-center justify-center rounded-lg text-sparkle-text-muted transition-colors hover:bg-white/[0.045] hover:text-sparkle-text"
                                    title="Expand sidebar"
                                    aria-label="Expand sidebar"
                                >
                                    <PanelLeftOpen size={14} strokeWidth={1.8} />
                                </button>
                            </div>
                        ) : null}
                    </div>
                    <RailButton
                        icon={<NewProjectIcon />}
                        label="New project"
                        shortcut="Ctrl Shift N"
                        disabled={commandPending}
                        onClick={() => void onCreateProjectChat()}
                    />
                    <RailButton
                        icon={<Search size={15} strokeWidth={1.7} />}
                        label="Search"
                        shortcut="Ctrl K"
                        onClick={open}
                    />
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-0.5 [scrollbar-width:thin] [scrollbar-color:#383347_transparent]">
                    {pinnedSessions.length > 0 ? (
                        <SidebarSection label="Pinned" className="mt-1">
                            {pinnedSessions.map((session) => (
                                <ChatRow
                                    key={session.id}
                                    session={session}
                                    activeSessionId={activeSessionId}
                                    activeThreadId={activeThreadId}
                                    commandPending={commandPending}
                                    pinned={pinnedSessionIds.has(session.id)}
                                    onSelectSession={onSelectSession}
                                    onSelectThread={onSelectThread}
                                    onTogglePinned={togglePinnedSession}
                                    onRename={renameSession}
                                    onArchive={archiveSession}
                                    onDelete={deleteSession}
                                />
                            ))}
                        </SidebarSection>
                    ) : null}

                    <SidebarSection label="Chats" className={pinnedSessions.length > 0 ? 'mt-4' : 'mt-1'}>
                        {chatSessions.length > 0 ? (
                            chatSessions.map((session) => (
                                <ChatRow
                                    key={session.id}
                                    session={session}
                                    activeSessionId={activeSessionId}
                                    activeThreadId={activeThreadId}
                                    commandPending={commandPending}
                                    pinned={pinnedSessionIds.has(session.id)}
                                    onSelectSession={onSelectSession}
                                    onSelectThread={onSelectThread}
                                    onTogglePinned={togglePinnedSession}
                                    onRename={renameSession}
                                    onArchive={archiveSession}
                                    onDelete={deleteSession}
                                />
                            ))
                        ) : (
                            <div className="px-2.5 py-1.5 text-[12px] text-sparkle-text-muted/45">No chats yet</div>
                        )}
                    </SidebarSection>

                    {projectGroups.length > 0 ? (
                        <SidebarSection
                            label="Projects"
                            className={chatSessions.length > 0 || pinnedSessions.length > 0 ? 'mt-4' : 'mt-1'}
                            childrenClassName="space-y-0.5 pl-1 pr-0.5"
                        >
                            {projectGroups.map((group) => {
                                const expanded = expandedProjectPathKeys.has(getProjectExpansionKey(group.path))
                                return (
                                    <div key={group.path} className="space-y-0.5">
                                        <div
                                            role="button"
                                            tabIndex={0}
                                            aria-expanded={expanded}
                                            onClick={() => toggleProject(group.path, expanded)}
                                            onKeyDown={(event) => {
                                                if (event.key !== 'Enter' && event.key !== ' ') return
                                                event.preventDefault()
                                                toggleProject(group.path, expanded)
                                            }}
                                            className={cn(
                                                'group/project-header flex h-7 min-w-0 cursor-pointer items-center gap-1 rounded-[10px] pl-1.5 pr-1 transition-colors hover:bg-white/[0.04] focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10'
                                            )}
                                            title={group.path}
                                        >
                                            <div
                                                className="flex min-w-0 flex-1 items-center gap-2 text-left text-[13px] leading-none text-sparkle-text-secondary transition-colors group-hover/project-header:text-sparkle-text focus:outline-none"
                                            >
                                                {expanded ? (
                                                    <FolderOpen size={14} strokeWidth={1.65} className="shrink-0 text-sparkle-text-muted/75" />
                                                ) : (
                                                    <Folder size={14} strokeWidth={1.65} className="shrink-0 text-sparkle-text-muted/75" />
                                                )}
                                                <span className="flex min-w-0 items-center gap-1.5">
                                                    <span className="block min-w-0 truncate font-medium" title={group.label}>{group.label}</span>
                                                    <ChevronDown size={12} className={cn('shrink-0 text-sparkle-text-muted/55 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/project-header:text-sparkle-text-muted/85', !expanded && '-rotate-90')} />
                                                </span>
                                            </div>
                                            <div className="ml-1 flex shrink-0 items-center gap-0.5 text-sparkle-text-muted/65 opacity-70 transition-opacity group-hover/project-header:opacity-100 focus-within:opacity-100">
                                                <button
                                                    type="button"
                                                    onClick={(event) => {
                                                        event.stopPropagation()
                                                        void navigator.clipboard?.writeText(group.path)
                                                        onShowToast({ message: 'Project path copied' })
                                                    }}
                                                    className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-[7px] border border-transparent bg-transparent p-0 transition-colors hover:bg-white/[0.04] hover:text-sparkle-text focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10"
                                                    title={`${group.label} actions`}
                                                >
                                                    <MoreHorizontal size={14} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(event) => {
                                                        event.stopPropagation()
                                                        void onCreateProjectChat(group.path)
                                                    }}
                                                    className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-[7px] border border-transparent bg-transparent p-0 text-sparkle-text-muted/58 transition-colors hover:bg-white/[0.04] hover:text-sparkle-text focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10"
                                                    title="New chat in project"
                                                >
                                                    <SquarePen size={13} />
                                                </button>
                                            </div>
                                        </div>
                                        <AnimatedHeight isOpen={expanded}>
                                            <div className="ml-5 space-y-0.5 py-1">
                                                {group.sessions.map((session) => (
                                                    <ChatRow
                                                        key={session.id}
                                                        session={session}
                                                        activeSessionId={activeSessionId}
                                                        activeThreadId={activeThreadId}
                                                        commandPending={commandPending}
                                                        pinned={pinnedSessionIds.has(session.id)}
                                                        compact
                                                        projectNested
                                                        onSelectSession={onSelectSession}
                                                        onSelectThread={onSelectThread}
                                                        onTogglePinned={togglePinnedSession}
                                                        onRename={renameSession}
                                                        onArchive={archiveSession}
                                                        onDelete={deleteSession}
                                                    />
                                                ))}
                                            </div>
                                        </AnimatedHeight>
                                    </div>
                                )
                            })}
                        </SidebarSection>
                    ) : null}
                </div>

                <div className="mt-auto shrink-0 border-t border-white/[0.055] pt-2">
                    <button
                        type="button"
                        onClick={() => navigate('/settings')}
                        className="group flex h-8 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-[13px] leading-none text-[#b9b2c8] transition-colors hover:bg-white/[0.035] hover:text-[#eeeaf7] focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10"
                    >
                        <Settings size={15} strokeWidth={1.75} className="text-[#918aa0] transition-colors group-hover:text-[#c9c2d6]" />
                        <span className="truncate">Settings</span>
                    </button>
                </div>
            </div>
            <ChatDeleteConfirmModal
                session={pendingDeleteSession}
                deleting={Boolean(deletingSessionId)}
                onConfirm={() => void confirmDeleteSession()}
                onCancel={cancelDeleteSession}
            />
            <RenameSessionModal
                renameTarget={renameTarget}
                renameDraft={renameDraft}
                onChangeDraft={setRenameDraft}
                onClose={closeRename}
                onSubmit={() => void submitRename()}
            />
            {!collapsed && onWidthChange && !loadingScreenActive ? (
                <button
                    type="button"
                    aria-label="Resize sidebar"
                    title="Drag to resize sidebar"
                    onPointerDown={handleResizePointerDown}
                    onPointerMove={handleResizePointerMove}
                    onPointerUp={handleResizePointerEnd}
                    onPointerCancel={handleResizePointerEnd}
                    className={cn(
                        'absolute inset-y-0 right-0 z-20 w-2 cursor-col-resize touch-none bg-transparent transition-colors after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-transparent hover:bg-white/[0.025] hover:after:bg-white/[0.10]',
                        isResizing && 'bg-white/[0.035] after:bg-white/[0.16]'
                    )}
                />
            ) : null}
                </aside>
            </div>
        </>
    )
})

function ChatDeleteConfirmModal(props: {
    session: AssistantSession | null
    deleting: boolean
    onConfirm: () => void
    onCancel: () => void
}) {
    const { session, deleting, onConfirm, onCancel } = props
    if (!session || typeof document === 'undefined') return null

    const title = getSessionDisplayTitle(session)

    return createPortal(
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/55 px-4 backdrop-blur-md animate-fadeIn" onClick={onCancel}>
            <div
                className="w-full max-w-[380px] rounded-2xl border border-white/[0.085] bg-[#1b1829] p-4 shadow-[0_22px_70px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.035)]"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-red-300/15 bg-red-500/[0.09] text-red-200">
                        <Trash2 size={17} strokeWidth={1.8} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2">
                            <div className="min-w-0 flex-1">
                                <h2 className="text-[15px] font-semibold leading-5 text-sparkle-text">Delete this chat?</h2>
                                <p className="mt-1 truncate text-[13px] text-sparkle-text-muted/75" title={title}>{title}</p>
                            </div>
                            <button
                                type="button"
                                onClick={onCancel}
                                disabled={deleting}
                                className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-sparkle-text-muted transition-colors hover:bg-white/[0.045] hover:text-sparkle-text disabled:pointer-events-none disabled:opacity-50"
                                aria-label="Cancel delete"
                            >
                                <X size={15} />
                            </button>
                        </div>
                        <p className="mt-3 text-[13px] leading-5 text-sparkle-text-secondary">
                            This removes the chat and its thread history from Zyra. This cannot be undone.
                        </p>
                    </div>
                </div>
                <div className="mt-5 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={deleting}
                        className="rounded-lg border border-white/[0.08] px-3 py-1.5 text-[13px] font-medium text-sparkle-text-secondary transition-colors hover:bg-white/[0.035] hover:text-sparkle-text disabled:pointer-events-none disabled:opacity-50"
                    >
                        Keep chat
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={deleting}
                        className="rounded-lg border border-red-300/15 bg-red-500/[0.13] px-3 py-1.5 text-[13px] font-semibold text-red-100 transition-colors hover:bg-red-500/[0.22] disabled:pointer-events-none disabled:opacity-70"
                    >
                        {deleting ? 'Deleting...' : 'Delete chat'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    )
}

function SidebarSection(props: { label: string; className?: string; childrenClassName?: string; children: ReactNode }) {
    return (
        <section className={props.className}>
            <div className="px-2.5 pb-1.5 pt-1 text-[12px] font-medium leading-none text-[#8d849b]/70">
                {props.label}
            </div>
            <div className={props.childrenClassName || 'space-y-0.5 pl-2 pr-1'}>{props.children}</div>
        </section>
    )
}

function ChatRow(props: {
    session: AssistantSession
    activeSessionId: string | null
    activeThreadId: string | null
    commandPending: boolean
    pinned: boolean
    compact?: boolean
    projectNested?: boolean
    onSelectSession: (sessionId: string) => Promise<void> | void
    onSelectThread: (input: { sessionId: string; threadId: string }) => Promise<void> | void
    onTogglePinned: (session: AssistantSession) => void
    onRename: (session: AssistantSession) => Promise<void> | void
    onArchive: (session: AssistantSession) => Promise<void> | void
    onDelete: (session: AssistantSession) => Promise<void> | void
}) {
    const {
        session,
        activeSessionId,
        activeThreadId,
        commandPending,
        pinned,
        compact = false,
        projectNested = false,
        onSelectSession,
        onSelectThread,
        onTogglePinned,
        onRename,
        onArchive,
        onDelete
    } = props
    const statusThread = getSessionStatusThread(session)
    const isActiveSession = session.id === activeSessionId
    const sessionThreads = session.threads.filter((thread) => thread.source === 'subagent')
    const showThreads = isActiveSession && sessionThreads.length > 0
    const statusPill = resolveAssistantThreadStatusPill(
        statusThread,
        isActiveSession && statusThread?.id === activeThreadId,
        undefined,
        { connecting: Boolean(isActiveSession && commandPending && !isThreadBusy(statusThread)) }
    )
    const showStatusPill = Boolean(statusPill && statusPill.showLabel !== false)
    const timeLabel = formatRelativeTime(getSessionLastActivityAt(session))

    return (
        <div>
            <div
                role="button"
                tabIndex={0}
                onClick={() => void onSelectSession(session.id)}
                onDoubleClick={() => void onRename(session)}
                onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    void onSelectSession(session.id)
                }}
                className={cn(
                    'group relative flex h-[30px] min-w-0 cursor-pointer items-center gap-2 rounded-[10px] px-2.5 text-left transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10',
                    isActiveSession
                        ? 'bg-[#403a51] text-[#f1eef8]'
                        : 'text-[#c8c1d3] hover:bg-white/[0.04] hover:text-[#f1eef8]',
                    compact && 'h-7 rounded-[9px]',
                    projectNested && 'h-7 rounded-[10px] px-2',
                    projectNested && isActiveSession && 'bg-white/[0.06]'
                )}
                title={getSessionDisplayTitle(session)}
            >
                <span className="min-w-0 flex-1 truncate text-[13px] leading-none">
                    {getSessionDisplayTitle(session)}
                </span>
                <span className="inline-flex shrink-0 items-center gap-1.5">
                    {showStatusPill && statusPill ? (
                        <span
                            className={cn(
                                'inline-flex h-4 shrink-0 items-center gap-1 rounded-full px-1.5 text-[9px] font-medium leading-none ring-1 ring-inset ring-white/[0.04]',
                                statusPill.badgeClass || statusPill.colorClass
                            )}
                            title={statusPill.label}
                        >
                            <span className={cn('h-1 w-1 rounded-full', statusPill.dotClass, statusPill.pulse && 'animate-pulse')} aria-hidden="true" />
                            <span>{statusPill.label}</span>
                        </span>
                    ) : null}
                    <span className="mr-0.5 shrink-0 text-right text-[11px] leading-none tabular-nums text-[#9b93aa]/72 group-hover:hidden">
                        {timeLabel}
                    </span>
                </span>
                <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                    <IconAction title={pinned ? 'Unpin chat' : 'Pin chat'} onClick={() => onTogglePinned(session)}>
                        {pinned ? <PinOff size={12} /> : <Pin size={12} />}
                    </IconAction>
                    <IconAction title="Archive chat" onClick={() => void onArchive(session)}>
                        <Archive size={12} />
                    </IconAction>
                    <IconAction danger title="Delete chat" onClick={() => void onDelete(session)}>
                        <Trash2 size={12} />
                    </IconAction>
                </div>
            </div>
            <AnimatedHeight isOpen={showThreads}>
                <div className="ml-5 mt-0.5 space-y-0.5">
                    {sessionThreads.map((thread, index) => {
                        const isActiveThread = thread.id === activeThreadId
                        return (
                            <button
                                key={thread.id}
                                type="button"
                                onClick={() => void onSelectThread({ sessionId: session.id, threadId: thread.id })}
                                className={cn(
                                    'flex h-7 w-full min-w-0 cursor-pointer items-center gap-2 rounded-[9px] px-2 text-left text-[12px] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10',
                                    isActiveThread
                                        ? 'bg-violet-500/[0.14] text-violet-100'
                                        : 'text-sparkle-text-muted/70 hover:bg-white/[0.035] hover:text-sparkle-text-secondary'
                                )}
                            >
                                <Bot size={12} className="shrink-0" />
                                <span className="truncate">{getThreadDisplayTitle(thread, index)}</span>
                            </button>
                        )
                    })}
                </div>
            </AnimatedHeight>
        </div>
    )
}

function NewProjectIcon() {
    return (
        <span className="relative inline-flex h-4 w-4 items-center justify-center">
            <Folder size={15} strokeWidth={1.7} />
            <Plus
                size={8}
                strokeWidth={2}
                className="absolute -bottom-0.5 -right-0.5 rounded-[3px] bg-[#1b1829]"
            />
        </span>
    )
}

function RailButton(props: {
    icon: ReactNode
    label: string
    shortcut?: string
    disabled?: boolean
    onClick: () => void
}) {
    const { icon, label, shortcut, disabled = false, onClick } = props

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={cn(
                'group flex h-7 w-full cursor-pointer items-center gap-2 rounded-[9px] px-2.5 text-left text-[13px] leading-none transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10',
                disabled
                    ? 'cursor-not-allowed text-[#7e768d]/45'
                    : 'text-[#b9b2c8] hover:bg-white/[0.03] hover:text-[#eeeaf7]'
            )}
        >
            <span className={cn('inline-flex h-4 w-4 shrink-0 items-center justify-center text-[#918aa0] transition-colors group-hover:text-[#c9c2d6]', disabled && 'text-[#7e768d]/40')}>
                {icon}
            </span>
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {shortcut ? (
                <span className="pointer-events-none hidden shrink-0 rounded-md bg-white/[0.07] px-1.5 py-0.5 text-[10px] leading-none text-[#bdb6ca]/80 group-hover:inline-flex">
                    {shortcut}
                </span>
            ) : null}
        </button>
    )
}

function IconAction(props: { children: ReactNode; title: string; danger?: boolean; onClick: () => void }) {
    const { children, title, danger = false, onClick } = props
    return (
        <button
            type="button"
            title={title}
            onClick={(event) => {
                event.stopPropagation()
                onClick()
            }}
            className={cn(
                'inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-md transition-colors',
                danger
                    ? 'text-red-200/65 hover:bg-red-500/10 hover:text-red-100'
                    : 'text-sparkle-text-muted/60 hover:bg-white/[0.04] hover:text-sparkle-text'
            )}
        >
            {children}
        </button>
    )
}
