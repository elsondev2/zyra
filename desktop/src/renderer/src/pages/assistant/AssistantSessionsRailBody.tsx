import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { DndContext, type DragCancelEvent, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { restrictToFirstScrollableAncestor, restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { ChevronDown, ChevronRight, MoreHorizontal, Plus, SquarePen } from 'lucide-react'
import { AnimatedHeight } from '@/components/ui/AnimatedHeight'
import { TRANSIENT_MENU_DISMISS_EVENT } from '@/lib/transient-menu'
import { cn } from '@/lib/utils'
import {
    ProjectGroupIcon,
    SortableProjectItem,
    SortableSessionList,
    hasSessionChats
} from './AssistantSessionsRailRows'
import type { SessionProjectGroup } from './assistant-sessions-rail-utils'
import { getGroupPrimaryThreadOrNull } from './assistant-sessions-rail-body-utils'

function RailSectionHeader(props: {
    title: string
    open: boolean
    onToggle: () => void
    onAdd?: () => void
    addTitle?: string
    menuItems?: Array<{ label: string; onSelect: () => void }>
}) {
    const { title, open, onToggle, onAdd, addTitle, menuItems = [] } = props
    const [menuOpen, setMenuOpen] = useState(false)
    const rootRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        if (!menuOpen) return
        const handlePointerDown = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setMenuOpen(false)
        }
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setMenuOpen(false)
        }
        const dismissMenu = () => setMenuOpen(false)
        document.addEventListener('pointerdown', handlePointerDown, true)
        window.addEventListener('keydown', handleEscape)
        window.addEventListener('blur', dismissMenu)
        window.addEventListener(TRANSIENT_MENU_DISMISS_EVENT, dismissMenu)
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown, true)
            window.removeEventListener('keydown', handleEscape)
            window.removeEventListener('blur', dismissMenu)
            window.removeEventListener(TRANSIENT_MENU_DISMISS_EVENT, dismissMenu)
        }
    }, [menuOpen])

    return (
        <div ref={rootRef} className="group/section relative mt-5 mb-2 flex h-5 items-center justify-between px-2.5">
            <button
                type="button"
                onClick={onToggle}
                className="group flex min-w-0 flex-1 items-center gap-2 text-left"
                title={open ? `Collapse ${title}` : `Expand ${title}`}
            >
                <ChevronRight size={11} className={cn('shrink-0 text-sparkle-text-muted/45 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:text-sparkle-text-muted/70', open && 'rotate-90')} />
                <span className="truncate text-[12px] font-medium leading-none text-sparkle-text-muted/65 group-hover:text-sparkle-text-muted/85">{title}</span>
            </button>
            <div className="flex shrink-0 items-center gap-0.5 text-sparkle-text-muted/65 opacity-0 transition-opacity group-hover/section:opacity-100 focus-within:opacity-100">
                {onAdd ? (
                    <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation()
                            onAdd()
                        }}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-white/[0.04] hover:text-sparkle-text"
                        title={addTitle || `New ${title.toLowerCase()}`}
                    >
                        <Plus size={14} strokeWidth={1.7} />
                    </button>
                ) : null}
                {menuItems.length > 0 ? (
                    <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation()
                            setMenuOpen((current) => !current)
                        }}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-white/[0.04] hover:text-sparkle-text"
                        title={`${title} actions`}
                    >
                        <MoreHorizontal size={15} strokeWidth={1.7} />
                    </button>
                ) : null}
            </div>
            {menuOpen && menuItems.length > 0 ? (
                <div className="absolute right-1 top-full z-40 mt-1 w-36 rounded-lg border border-white/10 bg-sparkle-card p-1 shadow-2xl">
                    {menuItems.map((item) => (
                        <button
                            key={item.label}
                            type="button"
                            onClick={() => {
                                setMenuOpen(false)
                                item.onSelect()
                            }}
                            className="flex h-8 w-full items-center rounded-md px-2 text-left text-[12px] text-sparkle-text-secondary transition-colors hover:bg-white/[0.04] hover:text-sparkle-text"
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            ) : null}
        </div>
    )
}

function RailEmptyText(props: { children: string }) {
    return <div className="px-5 py-1.5 text-[12px] text-sparkle-text-muted/45">{props.children}</div>
}

export function AssistantSessionsRailBody(props: {
    compact: boolean
    railMode: 'work' | 'playground'
    railGroupMode: 'project' | 'flat'
    railSortMode: 'updated' | 'created'
    playgroundRootMissing: boolean
    sectionLabel: string
    pinnedGroup: SessionProjectGroup | null
    unassignedGroup: SessionProjectGroup | null
    labGroups: SessionProjectGroup[]
    activeSessionId: string | null
    activeThreadId: string | null
    activeConnectionPending: boolean
    expandedGroupKeys: Set<string>
    expandedThreadKeys: Set<string>
    visibleSessionCountByGroup: Record<string, number>
    recencyTierByThreadId: ReadonlyMap<string, number>
    projectSensors: ReturnType<typeof import('./AssistantSessionsRailRows').useAssistantRailSensors>
    collisionDetection: ReturnType<typeof import('./AssistantSessionsRailRows').useAssistantRailCollisionDetection>
    getSessionMenuItems: Parameters<typeof SortableSessionList>[0]['getSessionMenuItems']
    onSessionContextMenu: (event: ReactMouseEvent<HTMLElement>, session: SessionProjectGroup['sessions'][number], archived?: boolean) => void
    onSessionDragStart: (sessionId: string, projectKey: string) => void
    onSessionDragEnd: (projectKey: string, activeSessionId: string, overSessionId: string | null) => void
    onSessionDragCancel: () => void
    onToggleThread: (threadId: string) => void
    onSelectThread: (input: { sessionId: string; threadId: string }) => void
    onToggleGroup: (key: string) => void
    onProjectContextMenu: (event: ReactMouseEvent<HTMLElement>, group: SessionProjectGroup, isExpanded: boolean) => void
    onProjectTitlePointerDownCapture: () => void
    onProjectTitleClick: (event: ReactMouseEvent<HTMLButtonElement>, projectKey: string) => void
    onProjectDragStart: (event: DragStartEvent) => void
    onProjectDragEnd: (event: DragEndEvent) => void
    onProjectDragCancel: (event: DragCancelEvent) => void
    onCreateProjectChat: (group: SessionProjectGroup) => void
    onCreateChat: () => void
    onCreateProject: () => void
    onCloneProject: () => void
    onDeleteProjectGroup: (group: SessionProjectGroup) => void
    onChoosePlaygroundRoot: () => Promise<void> | void
    onRailGroupModeChange: (mode: 'project' | 'flat') => void
    onRailSortModeChange: (mode: 'updated' | 'created') => void
    onShowMoreSessions: (groupKey: string, nextVisibleCount: number) => void
    onShowLessSessions: (groupKey: string, minimumVisibleCount: number) => void
    getGroupPlaygroundLabId: (group: SessionProjectGroup) => string | null
}) {
    const {
        compact,
        railMode,
        railGroupMode,
        sectionLabel,
        pinnedGroup,
        unassignedGroup,
        labGroups,
        activeSessionId,
        activeThreadId,
        activeConnectionPending,
        expandedGroupKeys,
        expandedThreadKeys,
        visibleSessionCountByGroup,
        recencyTierByThreadId,
        projectSensors,
        collisionDetection,
        getSessionMenuItems,
        onSessionContextMenu,
        onSessionDragStart,
        onSessionDragEnd,
        onSessionDragCancel,
        onToggleThread,
        onSelectThread,
        onProjectContextMenu,
        onProjectTitlePointerDownCapture,
        onProjectTitleClick,
        onProjectDragStart,
        onProjectDragEnd,
        onProjectDragCancel,
        onCreateProjectChat,
        onCreateChat,
        onCreateProject,
        onCloneProject,
        onDeleteProjectGroup,
        onShowMoreSessions,
        onShowLessSessions,
        getGroupPlaygroundLabId
    } = props
    const [sectionsOpen, setSectionsOpen] = useState({
        pinned: true,
        chats: true,
        projects: true
    })
    const toggleSection = (key: keyof typeof sectionsOpen) => {
        setSectionsOpen((current) => ({ ...current, [key]: !current[key] }))
    }

    return (
        <div className="min-h-0 flex-1 custom-scrollbar overflow-y-auto overflow-x-hidden pr-1 [scrollbar-width:thin]">
            <div>
                {pinnedGroup ? (
                    <>
                        <RailSectionHeader
                            title="Pinned"
                            open={sectionsOpen.pinned}
                            onToggle={() => toggleSection('pinned')}
                            menuItems={[{ label: 'New chat', onSelect: onCreateChat }]}
                        />
                        <AnimatedHeight isOpen={sectionsOpen.pinned}>
                            <UnassignedSessionsSection
                                compact={compact}
                                group={pinnedGroup}
                                activeSessionId={activeSessionId}
                                activeThreadId={activeThreadId}
                                activeConnectionPending={activeConnectionPending}
                                expandedThreadKeys={expandedThreadKeys}
                                visibleSessionCountByGroup={visibleSessionCountByGroup}
                                recencyTierByThreadId={recencyTierByThreadId}
                                getSessionMenuItems={getSessionMenuItems}
                                onToggleThread={onToggleThread}
                                onSelectThread={onSelectThread}
                                onSessionContextMenu={onSessionContextMenu}
                                onSessionDragStart={onSessionDragStart}
                                onSessionDragEnd={onSessionDragEnd}
                                onSessionDragCancel={onSessionDragCancel}
                                onShowMoreSessions={onShowMoreSessions}
                                onShowLessSessions={onShowLessSessions}
                            />
                        </AnimatedHeight>
                    </>
                ) : null}

                {railGroupMode === 'flat' ? (
                    <>
                        <RailSectionHeader
                            title="Chats"
                            open={sectionsOpen.chats}
                            onToggle={() => toggleSection('chats')}
                            onAdd={onCreateChat}
                            addTitle="New chat"
                            menuItems={[{ label: 'New chat', onSelect: onCreateChat }]}
                        />
                        <AnimatedHeight isOpen={sectionsOpen.chats}>
                            {labGroups[0] ? (
                                <UnassignedSessionsSection
                                    compact={compact}
                                    group={labGroups[0]}
                                    activeSessionId={activeSessionId}
                                    activeThreadId={activeThreadId}
                                    activeConnectionPending={activeConnectionPending}
                                    expandedThreadKeys={expandedThreadKeys}
                                    visibleSessionCountByGroup={visibleSessionCountByGroup}
                                    recencyTierByThreadId={recencyTierByThreadId}
                                    getSessionMenuItems={getSessionMenuItems}
                                    onToggleThread={onToggleThread}
                                    onSelectThread={onSelectThread}
                                    onSessionContextMenu={onSessionContextMenu}
                                    onSessionDragStart={onSessionDragStart}
                                    onSessionDragEnd={onSessionDragEnd}
                                    onSessionDragCancel={onSessionDragCancel}
                                    onShowMoreSessions={onShowMoreSessions}
                                    onShowLessSessions={onShowLessSessions}
                                />
                            ) : (
                                <RailEmptyText>No chats</RailEmptyText>
                            )}
                        </AnimatedHeight>
                    </>
                ) : unassignedGroup ? (
                    <>
                        <RailSectionHeader
                            title="Chats"
                            open={sectionsOpen.chats}
                            onToggle={() => toggleSection('chats')}
                            onAdd={onCreateChat}
                            addTitle="New chat"
                            menuItems={[{ label: 'New chat', onSelect: onCreateChat }]}
                        />
                        <AnimatedHeight isOpen={sectionsOpen.chats}>
                            <UnassignedSessionsSection
                                compact={compact}
                                group={unassignedGroup}
                                activeSessionId={activeSessionId}
                                activeThreadId={activeThreadId}
                                activeConnectionPending={activeConnectionPending}
                                expandedThreadKeys={expandedThreadKeys}
                                visibleSessionCountByGroup={visibleSessionCountByGroup}
                                recencyTierByThreadId={recencyTierByThreadId}
                                getSessionMenuItems={getSessionMenuItems}
                                onToggleThread={onToggleThread}
                                onSelectThread={onSelectThread}
                                onSessionContextMenu={onSessionContextMenu}
                                onSessionDragStart={onSessionDragStart}
                                onSessionDragEnd={onSessionDragEnd}
                                onSessionDragCancel={onSessionDragCancel}
                                onShowMoreSessions={onShowMoreSessions}
                                onShowLessSessions={onShowLessSessions}
                            />
                        </AnimatedHeight>
                    </>
                ) : null}

                {railGroupMode === 'project' ? (
                    <>
                        {labGroups.length === 0 ? (
                            <RailSectionHeader
                                title={sectionLabel}
                                open={sectionsOpen.projects}
                                onToggle={() => toggleSection('projects')}
                                onAdd={onCreateProject}
                                addTitle="New project"
                                menuItems={[
                                    { label: 'New project', onSelect: onCreateProject },
                                    { label: 'Clone repo', onSelect: onCloneProject }
                                ]}
                            />
                        ) : null}

                        <AnimatedHeight isOpen={sectionsOpen.projects}>
                            {labGroups.length > 0 ? (
                        <DndContext
                            sensors={projectSensors}
                            collisionDetection={collisionDetection}
                            modifiers={[restrictToVerticalAxis, restrictToFirstScrollableAncestor]}
                            onDragStart={onProjectDragStart}
                            onDragEnd={onProjectDragEnd}
                            onDragCancel={onProjectDragCancel}
                        >
                            <SortableContext items={labGroups.map((group) => group.key)} strategy={verticalListSortingStrategy}>
                                <div className="space-y-1">
                                    {labGroups.map((group) => (
                                        <ProjectSessionsSection
                                            key={group.key}
                                            compact={compact}
                                            railMode={railMode}
                                            group={group}
                                            activeSessionId={activeSessionId}
                                            activeThreadId={activeThreadId}
                                            activeConnectionPending={activeConnectionPending}
                                            expanded={expandedGroupKeys.has(group.key)}
                                            expandedThreadKeys={expandedThreadKeys}
                                            visibleSessionCountByGroup={visibleSessionCountByGroup}
                                            recencyTierByThreadId={recencyTierByThreadId}
                                            getGroupPlaygroundLabId={getGroupPlaygroundLabId}
                                            getSessionMenuItems={getSessionMenuItems}
                                            onToggleThread={onToggleThread}
                                            onSelectThread={onSelectThread}
                                            onSessionContextMenu={onSessionContextMenu}
                                            onSessionDragStart={onSessionDragStart}
                                            onSessionDragEnd={onSessionDragEnd}
                                            onSessionDragCancel={onSessionDragCancel}
                                            onProjectContextMenu={onProjectContextMenu}
                                            onProjectTitlePointerDownCapture={onProjectTitlePointerDownCapture}
                                            onProjectTitleClick={onProjectTitleClick}
                                            onCreateProjectChat={onCreateProjectChat}
                                            onDeleteProjectGroup={onDeleteProjectGroup}
                                            onShowMoreSessions={onShowMoreSessions}
                                            onShowLessSessions={onShowLessSessions}
                                        />
                                    ))}
                                </div>
                            </SortableContext>
                        </DndContext>
                            ) : (
                                <RailEmptyText>No projects yet</RailEmptyText>
                            )}
                        </AnimatedHeight>
                    </>
                ) : null}
            </div>
        </div>
    )
}

function UnassignedSessionsSection(props: {
    compact: boolean
    group: SessionProjectGroup
    activeSessionId: string | null
    activeThreadId: string | null
    activeConnectionPending: boolean
    expandedThreadKeys: Set<string>
    visibleSessionCountByGroup: Record<string, number>
    recencyTierByThreadId: ReadonlyMap<string, number>
    getSessionMenuItems: Parameters<typeof SortableSessionList>[0]['getSessionMenuItems']
    onToggleThread: (threadId: string) => void
    onSelectThread: (input: { sessionId: string; threadId: string }) => void
    onSessionContextMenu: (event: ReactMouseEvent<HTMLElement>, session: SessionProjectGroup['sessions'][number], archived?: boolean) => void
    onSessionDragStart: (sessionId: string, projectKey: string) => void
    onSessionDragEnd: (projectKey: string, activeSessionId: string, overSessionId: string | null) => void
    onSessionDragCancel: () => void
    onShowMoreSessions: (groupKey: string, nextVisibleCount: number) => void
    onShowLessSessions: (groupKey: string, minimumVisibleCount: number) => void
}) {
    const {
        compact,
        group,
        activeSessionId,
        activeThreadId,
        activeConnectionPending,
        expandedThreadKeys,
        visibleSessionCountByGroup,
        recencyTierByThreadId,
        getSessionMenuItems,
        onToggleThread,
        onSelectThread,
        onSessionContextMenu,
        onSessionDragStart,
        onSessionDragEnd,
        onSessionDragCancel,
        onShowMoreSessions,
        onShowLessSessions
    } = props
    const chatSessions = group.sessions
    if (chatSessions.length === 0) return null

    const configuredVisibleCount = Math.max(5, visibleSessionCountByGroup[group.key] ?? 5)
    const activeSessionIndex = chatSessions.findIndex((session) => session.id === activeSessionId)
    const minimumVisibleCount = activeSessionIndex >= 0
        ? Math.max(5, Math.ceil((activeSessionIndex + 1) / 5) * 5)
        : 5
    const resolvedVisibleCount = Math.max(configuredVisibleCount, minimumVisibleCount)
    const visibleSessions = chatSessions.slice(0, resolvedVisibleCount)
    const hiddenChatsCount = Math.max(0, chatSessions.length - resolvedVisibleCount)
    const nextShowMoreCount = Math.min(5, hiddenChatsCount)
    const hasMoreChats = hiddenChatsCount > 0
    const canShowLessChats = resolvedVisibleCount > minimumVisibleCount

    return (
        <div className="space-y-[1px]">
            <SortableSessionList
                projectKey={group.key}
                sessions={visibleSessions}
                activeSessionId={activeSessionId}
                activeThreadId={activeThreadId}
                activeConnectionPending={activeConnectionPending}
                recencyTierByThreadId={recencyTierByThreadId}
                compact={compact}
                expandedThreadKeys={expandedThreadKeys}
                onToggleThread={onToggleThread}
                onSelectThread={onSelectThread}
                getSessionMenuItems={getSessionMenuItems}
                onSessionContextMenu={onSessionContextMenu}
                onSessionDragStart={onSessionDragStart}
                onSessionDragEnd={onSessionDragEnd}
                onSessionDragCancel={onSessionDragCancel}
            />
            {hasMoreChats || canShowLessChats ? (
                <div className="flex items-center gap-1.5">
                    {hasMoreChats ? (
                        <button
                            type="button"
                            onClick={() => onShowMoreSessions(group.key, resolvedVisibleCount)}
                            className="h-8 flex-1 rounded-lg px-2.5 text-left text-[12px] text-sparkle-text-muted/55 transition-colors hover:bg-white/[0.035] hover:text-sparkle-text"
                        >
                            Show {nextShowMoreCount} more
                        </button>
                    ) : null}
                    {canShowLessChats ? (
                        <button
                            type="button"
                            onClick={() => onShowLessSessions(group.key, minimumVisibleCount)}
                            className="h-8 rounded-lg px-2.5 text-[12px] text-sparkle-text-muted/55 transition-colors hover:bg-white/[0.035] hover:text-sparkle-text"
                        >
                            Show less
                        </button>
                    ) : null}
                </div>
            ) : null}
        </div>
    )
}

function ProjectSessionsSection(props: {
    compact: boolean
    railMode: 'work' | 'playground'
    group: SessionProjectGroup
    activeSessionId: string | null
    activeThreadId: string | null
    activeConnectionPending: boolean
    expanded: boolean
    expandedThreadKeys: Set<string>
    visibleSessionCountByGroup: Record<string, number>
    recencyTierByThreadId: ReadonlyMap<string, number>
    getGroupPlaygroundLabId: (group: SessionProjectGroup) => string | null
    getSessionMenuItems: Parameters<typeof SortableSessionList>[0]['getSessionMenuItems']
    onToggleThread: (threadId: string) => void
    onSelectThread: (input: { sessionId: string; threadId: string }) => void
    onSessionContextMenu: (event: ReactMouseEvent<HTMLElement>, session: SessionProjectGroup['sessions'][number], archived?: boolean) => void
    onSessionDragStart: (sessionId: string, projectKey: string) => void
    onSessionDragEnd: (projectKey: string, activeSessionId: string, overSessionId: string | null) => void
    onSessionDragCancel: () => void
    onProjectContextMenu: (event: ReactMouseEvent<HTMLElement>, group: SessionProjectGroup, isExpanded: boolean) => void
    onProjectTitlePointerDownCapture: () => void
    onProjectTitleClick: (event: ReactMouseEvent<HTMLButtonElement>, projectKey: string) => void
    onCreateProjectChat: (group: SessionProjectGroup) => void
    onDeleteProjectGroup: (group: SessionProjectGroup) => void
    onShowMoreSessions: (groupKey: string, nextVisibleCount: number) => void
    onShowLessSessions: (groupKey: string, minimumVisibleCount: number) => void
}) {
    const {
        compact,
        railMode,
        group,
        activeSessionId,
        activeThreadId,
        activeConnectionPending,
        expanded,
        expandedThreadKeys,
        visibleSessionCountByGroup,
        recencyTierByThreadId,
        getSessionMenuItems,
        onToggleThread,
        onSelectThread,
        onSessionContextMenu,
        onSessionDragStart,
        onSessionDragEnd,
        onSessionDragCancel,
        onProjectContextMenu,
        onProjectTitlePointerDownCapture,
        onProjectTitleClick,
        onCreateProjectChat,
        onShowMoreSessions,
        onShowLessSessions
    } = props
    const chatSessions = group.sessions.filter(hasSessionChats)
    const hasChats = chatSessions.length > 0
    const configuredVisibleCount = Math.max(5, visibleSessionCountByGroup[group.key] ?? 5)
    const activeSessionIndex = chatSessions.findIndex((session) => session.id === activeSessionId)
    const minimumVisibleCount = activeSessionIndex >= 0
        ? Math.max(5, Math.ceil((activeSessionIndex + 1) / 5) * 5)
        : 5
    const resolvedVisibleCount = Math.max(configuredVisibleCount, minimumVisibleCount)
    const visibleChatSessions = chatSessions.slice(0, resolvedVisibleCount)
    const hiddenChatsCount = Math.max(0, chatSessions.length - resolvedVisibleCount)
    const hasMoreChats = hiddenChatsCount > 0
    const canShowLessChats = resolvedVisibleCount > minimumVisibleCount
    return (
        <SortableProjectItem projectKey={group.key}>
            {(handleProps) => (
                <>
                    <div
                        className={cn(
                            'group/project-header flex h-8 min-w-0 items-center gap-1.5 rounded-lg border px-2 transition-[background-color,color] duration-150',
                            expanded
                                ? 'border-white/[0.055] bg-white/[0.075]'
                                : 'border-transparent',
                            handleProps.isOver && !handleProps.isDragging && 'bg-white/[0.085]',
                            handleProps.isDragging
                                ? 'text-sparkle-text'
                                : 'hover:border-white/[0.055] hover:bg-white/[0.06]'
                        )}
                        onContextMenu={(event) => onProjectContextMenu(event, group, expanded)}
                    >
                        <button
                            type="button"
                            {...handleProps.attributes}
                            {...handleProps.listeners}
                            onPointerDownCapture={onProjectTitlePointerDownCapture}
                            onClick={(event) => onProjectTitleClick(event, group.key)}
                            className={cn(
                                'flex min-w-0 flex-1 items-center gap-2 text-left transition-[color,opacity] duration-150',
                                handleProps.isDragging
                                    ? 'cursor-grabbing text-sparkle-text'
                                    : 'cursor-grab active:cursor-grabbing'
                            )}
                        >
                            <ProjectGroupIcon group={group} size={15} expanded={expanded} />
                            <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                                <span className="truncate text-[13px] leading-none text-sparkle-text-secondary group-hover/project-header:text-sparkle-text">{group.label}</span>
                                <ChevronDown size={12} className={cn('shrink-0 text-sparkle-text-muted/55 transition-transform duration-150 group-hover/project-header:text-sparkle-text-muted/85', !expanded && '-rotate-90')} />
                            </div>
                        </button>
                        <div className="flex shrink-0 items-center gap-0.5 text-sparkle-text-muted/65 opacity-80 transition-opacity group-hover/project-header:opacity-100 focus-within:opacity-100">
                            <button
                                type="button"
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={(event) => {
                                    event.stopPropagation()
                                    onProjectContextMenu(event, group, expanded)
                                }}
                                className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-transparent bg-transparent p-0 transition-colors hover:bg-white/[0.04] hover:text-sparkle-text"
                                title={`${group.label} actions`}
                            >
                                <MoreHorizontal size={14} />
                            </button>
                            <button
                                type="button"
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={(event) => {
                                    event.stopPropagation()
                                    onCreateProjectChat(group)
                                }}
                                className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-transparent bg-transparent p-0 text-sparkle-text-muted/58 transition-colors hover:bg-white/[0.04] hover:text-sparkle-text"
                                title="New chat in project"
                            >
                                <SquarePen size={13} />
                            </button>
                        </div>
                    </div>
                    <AnimatedHeight isOpen={expanded}>
                        <div className="ml-7 flex min-w-0 flex-col gap-0.5 py-1">
                            {hasChats ? (
                                <>
                                    <SortableSessionList
                                        projectKey={group.key}
                                        sessions={visibleChatSessions}
                                        activeSessionId={activeSessionId}
                                        activeThreadId={activeThreadId}
                                        activeConnectionPending={activeConnectionPending}
                                        recencyTierByThreadId={recencyTierByThreadId}
                                        compact={compact}
                                        expandedThreadKeys={expandedThreadKeys}
                                        onToggleThread={onToggleThread}
                                        onSelectThread={onSelectThread}
                                        getSessionMenuItems={getSessionMenuItems}
                                        onSessionContextMenu={onSessionContextMenu}
                                        onSessionDragStart={onSessionDragStart}
                                        onSessionDragEnd={onSessionDragEnd}
                                        onSessionDragCancel={onSessionDragCancel}
                                    />
                                    {hasMoreChats || canShowLessChats ? (
                                        <div className="mt-1 flex items-center gap-1.5">
                                            {hasMoreChats ? (
                                                <button
                                                    type="button"
                                                    onClick={() => onShowMoreSessions(group.key, chatSessions.length)}
                                                    className="h-8 flex-1 rounded-lg px-2.5 text-left text-[12px] text-sparkle-text-muted/55 transition-colors hover:bg-white/[0.035] hover:text-sparkle-text"
                                                >
                                                    Show {hiddenChatsCount} more
                                                </button>
                                            ) : null}
                                            {canShowLessChats ? (
                                                <button
                                                    type="button"
                                                    onClick={() => onShowLessSessions(group.key, minimumVisibleCount)}
                                                    className="h-8 rounded-lg px-2.5 text-[12px] text-sparkle-text-muted/55 transition-colors hover:bg-white/[0.035] hover:text-sparkle-text"
                                                >
                                                    Show less
                                                </button>
                                            ) : null}
                                        </div>
                                    ) : null}
                                </>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => {
                                        const firstTarget = getGroupPrimaryThreadOrNull(group)
                                        if (firstTarget) {
                                            onSelectThread(firstTarget)
                                            return
                                        }
                                        onCreateProjectChat(group)
                                    }}
                                    className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left transition-colors hover:bg-white/[0.035]"
                                    title="Start a new chat"
                                >
                                    <span className="min-w-0 flex-1 truncate text-[12px] text-sparkle-text-muted/55">No chats yet</span>
                                    <span className="shrink-0 text-[10px] text-sparkle-text-muted/35">Start chatting</span>
                                </button>
                            )}
                        </div>
                    </AnimatedHeight>
                </>
            )}
        </SortableProjectItem>
    )
}
