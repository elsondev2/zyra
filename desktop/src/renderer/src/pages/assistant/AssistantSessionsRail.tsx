import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AssistantSession } from '@shared/assistant/contracts'
import { useSettings } from '@/lib/settings'
import type { AssistantToastInput } from './AssistantPageHelpers'
import {
    ExpandedSessionsRailContent,
    RenameSessionModal,
    SessionDeleteModal
} from './AssistantSessionsRailParts'
import {
    buildFlatSessionsGroup,
    filterAssistantSessions,
    getProjectKey,
    getSessionDisplayTitle,
    groupSessionsByProject,
    normalizeProjectPath,
    type SessionProjectGroup,
    type AssistantSessionsRailProps
} from './assistant-sessions-rail-utils'
import {
    getGroupSessionIds,
    getProjectIds,
    loadAssistantSessionsRailOrder,
    normalizeRailOrder,
    orderAssistantSessionsGroups,
    orderAssistantSessionsList,
    saveAssistantSessionsRailOrder,
    type AssistantSessionsRailOrder
} from './assistant-sessions-rail-order'

type AssistantSessionsRailViewProps = AssistantSessionsRailProps & {
    onShowToast: (input: AssistantToastInput) => void
}

const RELATIVE_TIME_REFRESH_MS = 30_000

function hasVisibleProjectPath(session: AssistantSession): boolean {
    return session.threads?.some((thread) => (thread.messageCount || thread.messages?.length || 0) > 1) || false
}

function createPlaygroundLabGroup(lab: AssistantSessionsRailViewProps['playground']['labs'][number]): SessionProjectGroup {
    const rootPath = normalizeProjectPath(lab.rootPath)
    return {
        key: getProjectKey(rootPath),
        label: lab.title || getProjectKey(rootPath),
        path: rootPath,
        createdAt: lab.createdAt,
        updatedAt: lab.updatedAt,
        projectIconPath: null,
        projectType: null,
        framework: null,
        sessions: []
    }
}

function mergePlaygroundLabGroups(groups: SessionProjectGroup[], labs: AssistantSessionsRailViewProps['playground']['labs']): SessionProjectGroup[] {
    if (labs.length === 0) return groups
    const existingGroupKeys = new Set(groups.map((group) => group.key))
    const missingLabGroups = labs
        .map(createPlaygroundLabGroup)
        .filter((group) => group.path && !existingGroupKeys.has(group.key))
    return missingLabGroups.length > 0 ? [...groups, ...missingLabGroups] : groups
}

function moveItemToIndex(values: string[], itemId: string, targetId: string): string[] {
    const currentIndex = values.indexOf(itemId)
    const targetIndex = values.indexOf(targetId)
    if (currentIndex === -1 || targetIndex === -1 || currentIndex === targetIndex) return values

    const next = [...values]
    const [removed] = next.splice(currentIndex, 1)
    next.splice(targetIndex, 0, removed)
    return next
}

export function AssistantSessionsRail({
    collapsed,
    width,
    compact = false,
    railMode,
    railGroupMode,
    railSortMode,
    railFilterMode,
    onRailModeChange,
    onRailGroupModeChange,
    onRailSortModeChange,
    onRailFilterModeChange,
    sessions,
    playground,
    backgroundActivitySessions,
    activeSessionId,
    activeThreadId,
    assistantConnected,
    commandPending,
    onWidthChange,
    onCreateSession,
    onCreatePlaygroundSession,
    onSelectSession,
    onSelectThread,
    onRenameSession,
    onArchiveSession,
    onDeleteSession,
    onChooseProjectPath,
    onSetPlaygroundRoot,
    onCreatePlaygroundLab,
    onDeletePlaygroundLab,
    onShowToast
}: AssistantSessionsRailViewProps) {
    const { settings } = useSettings()
    const [renameTarget, setRenameTarget] = useState<AssistantSession | null>(null)
    const [renameDraft, setRenameDraft] = useState('')
    const [sessionToDelete, setSessionToDelete] = useState<AssistantSession | null>(null)
    const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null)
    const [expandedGroupKeys, setExpandedGroupKeys] = useState<Set<string>>(new Set())
    const [railOrder, setRailOrder] = useState<AssistantSessionsRailOrder>(() => loadAssistantSessionsRailOrder())
    const [isResizing, setIsResizing] = useState(false)
    const [, setRelativeTimeVersion] = useState(0)
    const railRef = useRef<HTMLButtonElement | null>(null)
    const rootRef = useRef<HTMLDivElement | null>(null)
    const widthHolderRef = useRef<HTMLDivElement | null>(null)
    const resizeStateRef = useRef<{
        pointerId: number
        rail: HTMLButtonElement
        rafId: number | null
        pendingWidth: number
        side: 'left' | 'right'
        width: number
        startWidth: number
        startX: number
        transitionTargets: HTMLElement[]
        wrapper: HTMLElement
    } | null>(null)
    const orderedGroupedSessionsRef = useRef<SessionProjectGroup[]>([])

    const activeSessions = useMemo(
        () => sessions.filter((session) => !session.archived && (
            hasVisibleProjectPath(session) || Boolean(normalizeProjectPath(session.projectPath))
        )),
        [sessions]
    )
    const filteredActiveSessions = useMemo(
        () => filterAssistantSessions(activeSessions, railFilterMode, activeSessionId),
        [activeSessionId, activeSessions, railFilterMode]
    )
    const groupedSessions = useMemo(() => {
        const groups = groupSessionsByProject(filteredActiveSessions, settings.projectIconOverrides)
        return mergePlaygroundLabGroups(groups, playground.labs)
    }, [filteredActiveSessions, playground.labs, settings.projectIconOverrides])
    const orderedProjectGroups = useMemo(
        () => orderAssistantSessionsGroups(groupedSessions, railOrder, railSortMode),
        [groupedSessions, railOrder, railSortMode]
    )
    const orderedFlatSessions = useMemo(
        () => orderAssistantSessionsList(
            filteredActiveSessions.filter(hasVisibleProjectPath),
            railOrder.sessionOrderByProject.__assistant_flat_list__ || [],
            railSortMode
        ),
        [filteredActiveSessions, railOrder.sessionOrderByProject, railSortMode]
    )
    const flatSessionsGroup = useMemo(() => buildFlatSessionsGroup(orderedFlatSessions), [orderedFlatSessions])
    const orderedGroupedSessions = useMemo(
        () => railGroupMode === 'flat'
            ? (flatSessionsGroup ? [flatSessionsGroup] : [])
            : orderedProjectGroups,
        [flatSessionsGroup, orderedProjectGroups, railGroupMode]
    )
    useEffect(() => {
        orderedGroupedSessionsRef.current = orderedGroupedSessions
    }, [orderedGroupedSessions])

    useEffect(() => {
        const intervalId = window.setInterval(() => {
            setRelativeTimeVersion((current) => (current + 1) % 1_000_000)
        }, RELATIVE_TIME_REFRESH_MS)

        return () => window.clearInterval(intervalId)
    }, [])

    useEffect(() => {
        saveAssistantSessionsRailOrder(normalizeRailOrder(railOrder))
    }, [railOrder])

    useEffect(() => {
        setExpandedGroupKeys((prev) => {
            const validKeys = new Set(orderedGroupedSessions.map((group) => group.key))
            const next = new Set(Array.from(prev).filter((key) => validKeys.has(key)))
            for (const group of orderedGroupedSessions.slice(0, 2)) {
                if (!prev.has(group.key)) next.add(group.key)
            }
            if (activeSessionId) {
                const activeGroup = orderedGroupedSessions.find((group) => group.sessions.some((session) => session.id === activeSessionId))
                if (activeGroup) next.add(activeGroup.key)
            }
            return next
        })
    }, [activeSessionId, orderedGroupedSessions])

    const openRenameModal = (session: AssistantSession) => {
        setRenameTarget(session)
        setRenameDraft(getSessionDisplayTitle(session))
    }

    const closeRenameModal = () => {
        setRenameTarget(null)
        setRenameDraft('')
    }

    const submitRename = async () => {
        if (!renameTarget) return
        const normalized = renameDraft.trim()
        if (!normalized) return
        await onRenameSession(renameTarget.id, normalized)
        closeRenameModal()
    }

    const handleConfirmDeleteSession = useCallback(async () => {
        if (!sessionToDelete || deletingSessionId) return

        const targetTitle = getSessionDisplayTitle(sessionToDelete)
        try {
            setDeletingSessionId(sessionToDelete.id)
            const result = await onDeleteSession(sessionToDelete.id)
            if (!result.success) {
                onShowToast({ message: `Failed to delete "${targetTitle}": ${result.error}`, tone: 'error' })
                return
            }
            setSessionToDelete(null)
            onShowToast({ message: `Deleted "${targetTitle}"` })
        } finally {
            setDeletingSessionId(null)
        }
    }, [deletingSessionId, onDeleteSession, onShowToast, sessionToDelete])

    const minSidebarWidth = 232
    const maxSidebarWidth = compact ? 420 : 520
    const resolvedWidth = Math.max(minSidebarWidth, Math.min(maxSidebarWidth, Math.round(width)))
    const railTitle = collapsed ? 'Expand assistant sidebar' : onWidthChange ? 'Drag to resize assistant sidebar' : 'Assistant sidebar'

    const stopResize = useCallback((pointerId: number) => {
        const resizeState = resizeStateRef.current
        if (!resizeState) return
        if (resizeState.rafId !== null) {
            window.cancelAnimationFrame(resizeState.rafId)
        }
        resizeState.transitionTargets.forEach((element) => {
            element.style.removeProperty('transition-duration')
        })
        resizeStateRef.current = null
        setIsResizing(false)
        onWidthChange?.(resizeState.width)
        if (resizeState.rail.hasPointerCapture(pointerId)) {
            resizeState.rail.releasePointerCapture(pointerId)
        }
        document.body.style.removeProperty('cursor')
        document.body.style.removeProperty('user-select')
    }, [onWidthChange])

    const handleResizePointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
        if (collapsed || !onWidthChange || event.button !== 0) return
        const wrapper = rootRef.current
        const widthHolder = widthHolderRef.current
        const rail = railRef.current
        if (!wrapper || !widthHolder || !rail) return

        const transitionTargets = [wrapper, widthHolder]
        transitionTargets.forEach((element) => {
            element.style.setProperty('transition-duration', '0ms')
        })

        event.preventDefault()
        event.stopPropagation()
        resizeStateRef.current = {
            pointerId: event.pointerId,
            rail,
            rafId: null,
            pendingWidth: resolvedWidth,
            side: 'left',
            width: resolvedWidth,
            startWidth: resolvedWidth,
            startX: event.clientX,
            transitionTargets,
            wrapper
        }
        wrapper.style.setProperty('--assistant-sidebar-width', `${resolvedWidth}px`)
        setIsResizing(true)
        rail.setPointerCapture(event.pointerId)
        document.body.style.cursor = 'grabbing'
        document.body.style.userSelect = 'none'
    }, [collapsed, onWidthChange, resolvedWidth])

    const handleResizePointerMove = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
        const resizeState = resizeStateRef.current
        if (!resizeState || resizeState.pointerId !== event.pointerId || !onWidthChange) return

        event.preventDefault()
        resizeState.pendingWidth = Math.max(
            minSidebarWidth,
            Math.min(maxSidebarWidth, Math.round(resizeState.startWidth + (event.clientX - resizeState.startX)))
        )
        if (resizeState.rafId !== null) return

        resizeState.rafId = window.requestAnimationFrame(() => {
            const activeResizeState = resizeStateRef.current
            if (!activeResizeState || !onWidthChange) return

            activeResizeState.rafId = null
            const nextWidth = activeResizeState.pendingWidth
            activeResizeState.wrapper.style.setProperty('--assistant-sidebar-width', `${nextWidth}px`)
            activeResizeState.width = nextWidth
        })
    }, [maxSidebarWidth, minSidebarWidth, onWidthChange])

    const handleResizePointerEnd = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
        const resizeState = resizeStateRef.current
        if (!resizeState || resizeState.pointerId !== event.pointerId) return
        event.preventDefault()
        stopResize(event.pointerId)
    }, [stopResize])

    useEffect(() => {
        return () => {
            const resizeState = resizeStateRef.current
            if (resizeState && resizeState.rafId !== null) {
                window.cancelAnimationFrame(resizeState.rafId)
            }
            resizeState?.transitionTargets.forEach((element) => {
                element.style.removeProperty('transition-duration')
            })
            document.body.style.removeProperty('cursor')
            document.body.style.removeProperty('user-select')
        }
    }, [])

    const clearBodyDragState = useCallback(() => {
        document.body.style.removeProperty('cursor')
        document.body.style.removeProperty('user-select')
    }, [])

    const handleProjectDragStart = useCallback(() => {
        document.body.style.cursor = 'grabbing'
        document.body.style.userSelect = 'none'
    }, [])

    const handleProjectDragEnd = useCallback((activeProjectKey: string, overProjectKey: string | null) => {
        clearBodyDragState()
        if (!overProjectKey || activeProjectKey === overProjectKey) return
        setRailOrder((current) => {
            const currentProjectOrder = getProjectIds(orderedGroupedSessionsRef.current)
            const nextProjectOrder = moveItemToIndex(currentProjectOrder, activeProjectKey, overProjectKey)
            if (nextProjectOrder.join('|') === currentProjectOrder.join('|')) return current
            return {
                ...current,
                projectOrder: nextProjectOrder
            }
        })
    }, [clearBodyDragState])

    const handleSessionDragStart = useCallback(() => {
        document.body.style.cursor = 'grabbing'
        document.body.style.userSelect = 'none'
    }, [])

    const handleSessionDragEnd = useCallback((projectKey: string, activeSessionId: string, overSessionId: string | null) => {
        clearBodyDragState()
        if (!overSessionId || activeSessionId === overSessionId) return
        setRailOrder((current) => {
            const sourceGroup = orderedGroupedSessionsRef.current.find((group) => group.key === projectKey)
            if (!sourceGroup) return current
            const sourceIds = getGroupSessionIds(sourceGroup)
            const nextSourceIds = moveItemToIndex(sourceIds, activeSessionId, overSessionId)
            if (nextSourceIds.join('|') === sourceIds.join('|')) return current
            return {
                ...current,
                sessionOrderByProject: {
                    ...current.sessionOrderByProject,
                    [projectKey]: nextSourceIds
                }
            }
        })
    }, [clearBodyDragState])

    useEffect(() => {
        return () => {
            clearBodyDragState()
        }
    }, [clearBodyDragState])

    return (
        <>
            <div
                ref={rootRef}
                className="group relative h-full shrink-0 overflow-hidden transition-all duration-300"
                data-collapsible={collapsed ? 'icon' : ''}
                data-side="left"
                data-state={collapsed ? 'collapsed' : 'expanded'}
                style={{
                    ['--assistant-sidebar-width' as string]: `${resolvedWidth}px`,
                    width: collapsed ? '0px' : `var(--assistant-sidebar-width)`,
                    opacity: collapsed ? 0 : 1,
                    willChange: 'width, opacity',
                    pointerEvents: collapsed ? 'none' : 'auto'
                }}
                aria-hidden={collapsed}
            >
                <div
                    ref={widthHolderRef}
                    className="relative h-full w-full"
                >
                    <aside className="relative h-full w-full overflow-x-hidden border-r border-white/10 bg-sparkle-card/95">
                        <ExpandedSessionsRailContent
                            compact={compact}
                            railMode={railMode}
                            railGroupMode={railGroupMode}
                            railSortMode={railSortMode}
                            railFilterMode={railFilterMode}
                            playground={playground}
                            backgroundActivitySessions={backgroundActivitySessions}
                            assistantConnected={assistantConnected}
                            commandPending={commandPending}
                            groupedSessions={orderedGroupedSessions}
                            activeSessionId={activeSessionId}
                            activeThreadId={activeThreadId}
                            expandedGroupKeys={expandedGroupKeys}
                            onRailModeChange={onRailModeChange}
                            onRailGroupModeChange={onRailGroupModeChange}
                            onRailSortModeChange={onRailSortModeChange}
                            onRailFilterModeChange={onRailFilterModeChange}
                            onToggleGroup={(key) => setExpandedGroupKeys((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next })}
                            onChooseProjectPath={() => void onChooseProjectPath()}
                            onCreateSession={(projectPath) => void onCreateSession(projectPath)}
                            onCreatePlaygroundSession={(labId) => void onCreatePlaygroundSession(labId)}
                            onSelectSession={(sessionId) => void onSelectSession(sessionId)}
                            onSelectThread={(input) => void onSelectThread(input)}
                            onOpenRename={openRenameModal}
                            onArchiveSession={(sessionId, archived) => void onArchiveSession(sessionId, archived)}
                            onDeleteRequest={setSessionToDelete}
                            onDeleteSession={(sessionId) => onDeleteSession(sessionId)}
                            onSetPlaygroundRoot={(rootPath) => void onSetPlaygroundRoot(rootPath)}
                            onCreatePlaygroundLab={(input) => onCreatePlaygroundLab(input)}
                            onDeletePlaygroundLab={onDeletePlaygroundLab}
                            onProjectDragStart={handleProjectDragStart}
                            onProjectDragEnd={handleProjectDragEnd}
                            onProjectDragCancel={clearBodyDragState}
                            onSessionDragStart={handleSessionDragStart}
                            onSessionDragEnd={handleSessionDragEnd}
                            onSessionDragCancel={clearBodyDragState}
                            onShowToast={onShowToast}
                        />
                        <button
                            ref={railRef}
                            type="button"
                            aria-label={railTitle}
                            data-resizing={isResizing ? 'true' : 'false'}
                            onPointerDown={handleResizePointerDown}
                            onPointerMove={handleResizePointerMove}
                            onPointerUp={handleResizePointerEnd}
                            onPointerCancel={handleResizePointerEnd}
                            className={`absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] sm:flex touch-none group-data-[side=left]:-right-4 group-data-[side=right]:left-0 ${isResizing ? 'cursor-grabbing bg-white/[0.04] after:bg-white/25' : 'cursor-default after:bg-transparent hover:bg-white/[0.03] hover:after:bg-white/10'}`}
                            title={railTitle}
                        />
                    </aside>
                </div>
            </div>
            <RenameSessionModal renameTarget={renameTarget} renameDraft={renameDraft} onChangeDraft={setRenameDraft} onClose={closeRenameModal} onSubmit={() => void submitRename()} />
            <SessionDeleteModal
                sessionToDelete={sessionToDelete}
                deleting={Boolean(deletingSessionId)}
                onConfirm={() => void handleConfirmDeleteSession()}
                onCancel={() => {
                    if (deletingSessionId) return
                    setSessionToDelete(null)
                }}
            />
        </>
    )
}
