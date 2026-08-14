import { memo, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { Check, CheckCircle2, ChevronDown, CircleDashed, Folder, FolderPlus, MessageSquare, Undo2 } from 'lucide-react'
import type { AssistantSession, AssistantThread } from '@shared/assistant/contracts'
import ProjectIcon from '@/components/ui/ProjectIcon'
import { cn } from '@/lib/utils'
import {
    formatAssistantSidebarRelativeTime,
    getPrimarySessionThread,
    getSessionDisplayTitle,
    getSessionLastActivityAt,
    getSortableTimestamp,
    groupSessionsByProject,
    isAssistantDraftSession,
    resolveAssistantThreadStatusPill,
    resolveSessionProjectPath,
    type SessionProjectGroup
} from './assistant-sessions-rail-utils'

const ALL_PROJECTS = '__assistant-agent-inbox-all-projects__'
const SETTLED_OVERRIDES_KEY = 'assistant:agent-inbox-settled-overrides:v1'
const AUTO_SETTLE_AFTER_MS = 3 * 24 * 60 * 60 * 1000
const SETTLED_INITIAL_COUNT = 10
const SETTLED_PAGE_COUNT = 25

type RowStatus = 'approval' | 'input' | 'working' | 'failed' | 'done' | 'ready'
type SettlementOverride = { state: 'active' | 'settled'; activityAt: string }
type SettlementOverrides = Record<string, SettlementOverride>
type SidebarItem = {
    session: AssistantSession
    thread: AssistantThread | null
    projectPath: string
    project: SessionProjectGroup
    activityAt: string
    status: RowStatus
    active: boolean
    settled: boolean
}

type Props = {
    sessions: AssistantSession[]
    activeSessionId: string | null
    activeThreadId: string | null
    commandPending: boolean
    projectIconOverrides: Record<string, string>
    headerActions: ReactNode
    onCreateProjectChat: (projectPath?: string) => Promise<void> | void
    onSelectSession: (sessionId: string) => Promise<void> | void
    onRename: (session: AssistantSession) => Promise<void> | void
    onOpenContextMenu: (event: ReactMouseEvent<HTMLElement>, session: AssistantSession) => void
}

function readSettlementOverrides(): SettlementOverrides {
    try {
        const value = JSON.parse(localStorage.getItem(SETTLED_OVERRIDES_KEY) || '{}') as unknown
        if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
        return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, SettlementOverride] => {
            const override = entry[1] as Partial<SettlementOverride> | null
            return Boolean(override && (override.state === 'active' || override.state === 'settled') && typeof override.activityAt === 'string')
        }))
    } catch {
        return {}
    }
}

function writeSettlementOverrides(value: SettlementOverrides): void {
    try { localStorage.setItem(SETTLED_OVERRIDES_KEY, JSON.stringify(value)) } catch { /* keep in memory */ }
}

function getStatusThread(session: AssistantSession): AssistantThread | null {
    return session.threads.find((thread) => thread.id === session.activeThreadId) || getPrimarySessionThread(session)
}

function resolveRowStatus(thread: AssistantThread | null, isSelectedThread: boolean): RowStatus {
    const pill = resolveAssistantThreadStatusPill(thread, isSelectedThread)
    switch (pill?.label) {
        case 'Pending': return 'approval'
        case 'Input needed': return 'input'
        case 'Working':
        case 'Background':
        case 'Connecting': return 'working'
        case 'Failed':
        case 'Stale': return 'failed'
        case 'Done': return 'done'
        default: return 'ready'
    }
}

function isEffectivelySettled(item: Omit<SidebarItem, 'settled'>, overrides: SettlementOverrides): boolean {
    const override = overrides[item.session.id]
    if (override?.activityAt === item.activityAt) return override.state === 'settled'
    if (item.status !== 'ready') return false
    const activity = getSortableTimestamp(item.activityAt)
    return activity > 0 && Date.now() - activity >= AUTO_SETTLE_AFTER_MS
}

function formatWorkingDuration(startedAt: string | null): string {
    if (!startedAt) return ''
    const started = Date.parse(startedAt)
    if (!Number.isFinite(started)) return ''
    const seconds = Math.max(0, Math.floor((Date.now() - started) / 1000))
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m`
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

function WorkingDuration({ thread }: { thread: AssistantThread | null }) {
    const startedAt = thread?.latestTurn?.startedAt || thread?.latestTurn?.requestedAt || thread?.updatedAt || null
    const [, setTick] = useState(0)
    useEffect(() => {
        if (!startedAt) return
        const timer = window.setInterval(() => setTick((tick) => tick + 1), 1_000)
        return () => window.clearInterval(timer)
    }, [startedAt])
    const label = formatWorkingDuration(startedAt)
    return label ? <span className="tabular-nums">{label}</span> : null
}

function ProjectMark({ group, dimmed = false }: { group: SessionProjectGroup; dimmed?: boolean }) {
    const meaningfulType = Boolean(group.projectType && !['unknown', 'default', 'folder'].includes(group.projectType))
    const hasIcon = Boolean(group.projectIconPath || group.framework || meaningfulType)
    return (
        <span className={cn('inline-flex size-4 shrink-0 items-center justify-center transition-[filter,opacity]', dimmed && 'opacity-40 grayscale group-hover/agent-inbox-row:opacity-100 group-hover/agent-inbox-row:grayscale-0')}>
            {hasIcon ? (
                <ProjectIcon projectType={meaningfulType ? group.projectType || undefined : undefined} framework={group.framework || undefined} customIconPath={group.projectIconPath} size={16} className="overflow-hidden rounded-sm" />
            ) : group.path ? (
                <Folder size={16} strokeWidth={1.7} className="text-sparkle-text-muted/75" />
            ) : (
                <MessageSquare size={16} strokeWidth={1.7} className="text-sparkle-text-muted/75" />
            )}
        </span>
    )
}

function topStatus(item: SidebarItem): ReactNode {
    if (item.status === 'working') return <span className="assistant-agent-inbox-working-text inline-flex items-center gap-1 font-medium text-sky-400"><CircleDashed size={16} /><span>Working</span><WorkingDuration thread={item.thread} /></span>
    if (item.status === 'approval') return <span className="font-medium text-amber-300">Approval</span>
    if (item.status === 'input') return <span className="font-medium text-indigo-300">Input</span>
    if (item.status === 'failed') return <span className="font-medium text-red-300">Failed</span>
    if (item.status === 'done') return <span className="inline-flex items-center gap-1 font-medium text-emerald-300"><CheckCircle2 size={16} /><span>Done</span></span>
    return formatAssistantSidebarRelativeTime(item.activityAt)
}

function AgentInboxCard({ item, onSettle, props }: { item: SidebarItem; onSettle: (item: SidebarItem) => void; props: Props }) {
    const title = getSessionDisplayTitle(item.session)
    const receded = (item.status === 'ready' || item.status === 'working' || item.status === 'approval' || item.status === 'input') && !item.active
    const activate = () => void props.onSelectSession(item.session.id)
    return (
        <li className="list-none py-0.5 [content-visibility:auto] [contain-intrinsic-size:auto_96px]">
            <div role="button" tabIndex={0} onClick={activate} onDoubleClick={() => void props.onRename(item.session)} onContextMenu={(event) => props.onOpenContextMenu(event, item.session)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate() } }} className={cn('group/agent-inbox-row relative w-full cursor-pointer overflow-hidden rounded-md text-left outline-none select-none', item.active ? 'bg-[var(--surface-active)] text-sparkle-text' : receded ? 'text-sparkle-text-muted/75 hover:bg-[var(--surface-hover)] hover:text-sparkle-text' : 'bg-transparent text-sparkle-text hover:bg-[var(--surface-hover)]', (item.status === 'working' || item.status === 'approval' || item.status === 'input') && !item.active && 'opacity-70 transition-opacity hover:opacity-100')} title={[title, item.projectPath, item.thread?.model, item.thread?.lastError].filter(Boolean).join('\n')}>
                <div className="relative z-10 h-[4.875rem] px-2.5 py-2">
                    <div className="flex h-5 min-w-0 items-center gap-1.5">
                        <ProjectMark group={item.project} />
                        <span className={cn('min-w-0 flex-1 truncate text-xs text-sparkle-text-secondary/85', receded ? 'font-normal' : 'font-medium')}>{item.project.label}</span>
                        <span className="relative ml-auto flex h-5 min-w-8 shrink-0 items-center justify-end pl-1 text-xs">
                            <span className="tabular-nums text-sparkle-text-muted/65 transition-opacity group-hover/agent-inbox-row:opacity-0">{topStatus(item)}</span>
                            <button type="button" aria-label="Settle chat" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onSettle(item) }} className="absolute inset-y-0 right-0 inline-flex cursor-pointer items-center gap-1 rounded-md bg-transparent px-2 text-xs text-sparkle-text-muted opacity-0 transition-opacity hover:text-sparkle-text focus-visible:opacity-100 group-hover/agent-inbox-row:opacity-100"><Check size={12} />Settle</button>
                        </span>
                    </div>
                    <div className="mt-1 flex min-w-0"><span className={cn('min-w-0 flex-1 truncate text-sm', receded ? 'font-normal text-sparkle-text-secondary/80' : 'font-medium text-sparkle-text')}>{title}</span></div>
                    <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-sparkle-text-muted/75">
                        <span className="min-w-0 flex-1 truncate whitespace-nowrap">{item.thread?.model || 'Assistant'}</span>
                    </div>
                </div>
            </div>
        </li>
    )
}

function AgentInboxSlimRow({ item, action, onAction, props }: { item: SidebarItem; action: 'settle' | 'unsettle'; onAction: (item: SidebarItem) => void; props: Props }) {
    const title = getSessionDisplayTitle(item.session)
    const activate = () => void props.onSelectSession(item.session.id)
    return (
        <li className="list-none [content-visibility:auto] [contain-intrinsic-size:auto_34px]">
            <div role="button" tabIndex={0} onClick={activate} onDoubleClick={() => void props.onRename(item.session)} onContextMenu={(event) => props.onOpenContextMenu(event, item.session)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate() } }} className={cn('group/agent-inbox-row relative flex h-9 w-full cursor-pointer items-center gap-2.5 overflow-hidden rounded-md px-2.5 text-left outline-none select-none', item.active ? 'bg-[var(--surface-active)] text-sparkle-text' : 'text-sparkle-text-muted/70 hover:bg-[var(--surface-hover)] hover:text-sparkle-text')} title={title}>
                <ProjectMark group={item.project} dimmed={!item.active} />
                <span className={cn('min-w-0 flex-1 truncate text-sm group-hover/agent-inbox-row:text-sparkle-text', item.active ? 'text-sparkle-text' : 'text-sparkle-text-muted/70')}>{title}</span>
                <span className="relative ml-auto flex h-6 min-w-8 shrink-0 items-center justify-end">
                    <span className="text-xs tabular-nums text-sparkle-text-muted/55 transition-opacity group-hover/agent-inbox-row:opacity-0">{formatAssistantSidebarRelativeTime(item.activityAt)}</span>
                    <button type="button" aria-label={action === 'settle' ? 'Settle chat' : 'Un-settle chat'} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onAction(item) }} className="absolute inset-y-0 right-0 inline-flex cursor-pointer items-center gap-1 rounded-md bg-transparent px-2 text-xs text-sparkle-text-muted opacity-0 transition-opacity hover:text-sparkle-text focus-visible:opacity-100 group-hover/agent-inbox-row:opacity-100">{action === 'settle' ? <Check size={12} /> : <Undo2 size={12} />}</button>
                </span>
            </div>
        </li>
    )
}

export const AssistantAgentInboxSidebar = memo(function AssistantAgentInboxSidebar(props: Props) {
    const [scope, setScope] = useState(ALL_PROJECTS)
    const [projectMenuOpen, setProjectMenuOpen] = useState(false)
    const [settledExpanded, setSettledExpanded] = useState(true)
    const [settledVisibleCount, setSettledVisibleCount] = useState(SETTLED_INITIAL_COUNT)
    const [settlementOverrides, setSettlementOverrides] = useState<SettlementOverrides>(readSettlementOverrides)
    const menuRef = useRef<HTMLDivElement | null>(null)

    const visibleSessions = useMemo(() => props.sessions.filter((session) => !session.archived && !isAssistantDraftSession(session)), [props.sessions])
    const projectGroups = useMemo(() => groupSessionsByProject(visibleSessions, props.projectIconOverrides), [props.projectIconOverrides, visibleSessions])
    const projectByPath = useMemo(() => new Map(projectGroups.map((group) => [group.path, group])), [projectGroups])
    useEffect(() => { if (scope !== ALL_PROJECTS && !projectByPath.has(scope)) setScope(ALL_PROJECTS) }, [projectByPath, scope])
    useEffect(() => setSettledVisibleCount(SETTLED_INITIAL_COUNT), [scope])
    useEffect(() => {
        if (!projectMenuOpen) return
        const close = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setProjectMenuOpen(false) }
        const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setProjectMenuOpen(false) }
        document.addEventListener('pointerdown', close)
        window.addEventListener('keydown', escape)
        return () => { document.removeEventListener('pointerdown', close); window.removeEventListener('keydown', escape) }
    }, [projectMenuOpen])

    const items = useMemo(() => visibleSessions
        .filter((session) => scope === ALL_PROJECTS || resolveSessionProjectPath(session) === scope)
        .map((session): SidebarItem => {
            const thread = getStatusThread(session)
            const active = session.id === props.activeSessionId
            const activityAt = getSessionLastActivityAt(session)
            const base = { session, thread, active, activityAt, projectPath: resolveSessionProjectPath(session), project: projectByPath.get(resolveSessionProjectPath(session))! }
            const status = resolveRowStatus(thread, active && thread?.id === props.activeThreadId)
            const unsettled = { ...base, status }
            return { ...unsettled, settled: isEffectivelySettled(unsettled, settlementOverrides) }
        }), [props.activeSessionId, props.activeThreadId, projectByPath, scope, settlementOverrides, visibleSessions])

    const activeWorkItems = useMemo(() => items
        .filter((item) => !item.settled && item.status !== 'ready')
        .sort((left, right) => getSortableTimestamp(right.session.createdAt) - getSortableTimestamp(left.session.createdAt) || left.session.id.localeCompare(right.session.id)), [items])
    const recentItems = useMemo(() => items
        .filter((item) => !item.settled && item.status === 'ready')
        .sort((left, right) => getSortableTimestamp(right.activityAt) - getSortableTimestamp(left.activityAt) || left.session.id.localeCompare(right.session.id)), [items])
    const settledItems = useMemo(() => items.filter((item) => item.settled).sort((left, right) => getSortableTimestamp(right.activityAt) - getSortableTimestamp(left.activityAt) || left.session.id.localeCompare(right.session.id)), [items])
    const visibleSettled = settledItems.slice(0, settledVisibleCount)
    const renderedSettled = settledExpanded ? visibleSettled : visibleSettled.filter((item) => item.active)
    const hiddenSettledCount = settledItems.length - visibleSettled.length
    const scopedProject = scope === ALL_PROJECTS ? null : projectByPath.get(scope) || null

    const setSettlement = (item: SidebarItem, state: SettlementOverride['state']) => setSettlementOverrides((current) => {
        const next = { ...current, [item.session.id]: { state, activityAt: item.activityAt } }
        writeSettlementOverrides(next)
        return next
    })

    return (
        <>
            {props.headerActions}
            {projectGroups.length > 0 ? (
                <div ref={menuRef} className="relative shrink-0 pb-2">
                    <button type="button" aria-label="Filter chats by project" aria-expanded={projectMenuOpen} onClick={() => setProjectMenuOpen((open) => !open)} className="flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-sm font-medium text-sparkle-text-muted outline-none hover:bg-[var(--surface-hover)] hover:text-sparkle-text focus-visible:ring-1 focus-visible:ring-[var(--accent-primary)]/45">{scopedProject ? <ProjectMark group={scopedProject} /> : <Folder size={16} className="shrink-0 text-sparkle-text-muted/80" />}<span className="min-w-0 flex-1 truncate">{scopedProject?.label || 'All projects'}</span><ChevronDown size={16} className="shrink-0 text-sparkle-text-muted/70" /></button>
                    {projectMenuOpen ? (
                        <div className="absolute left-0 right-0 top-[34px] z-50 max-h-72 overflow-y-auto rounded-lg border border-[var(--surface-divider)] bg-[var(--surface-floating)] p-1 shadow-[0_16px_48px_rgba(0,0,0,0.34)]">
                            <button type="button" onClick={() => { setScope(ALL_PROJECTS); setProjectMenuOpen(false) }} className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm font-medium text-sparkle-text-secondary hover:bg-[var(--surface-hover)] hover:text-sparkle-text"><Folder size={16} /><span className="min-w-0 flex-1 truncate">All projects</span>{scope === ALL_PROJECTS ? <Check size={13} /> : null}</button>
                            {projectGroups.map((group) => <button key={group.key} type="button" onClick={() => { setScope(group.path); setProjectMenuOpen(false) }} className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm font-medium text-sparkle-text-secondary hover:bg-[var(--surface-hover)] hover:text-sparkle-text"><ProjectMark group={group} /><span className="min-w-0 flex-1 truncate">{group.label}</span>{scope === group.path ? <Check size={13} /> : null}</button>)}
                        </div>
                    ) : null}
                </div>
            ) : null}
            <div className="assistant-chat-scrollbar assistant-sidebar-scrollbar min-h-0 flex-1 overflow-y-scroll overflow-x-hidden pr-0.5">
                <ul role="list" className="flex flex-col gap-px">
                    {activeWorkItems.length > 0 ? (
                        <li className="list-none">
                            <div className="mb-1 flex w-full items-center gap-2 px-2.5 text-left">
                                <span className="text-xs font-medium text-sparkle-text-muted/50">Active work</span>
                                <span className="h-px flex-1 bg-[var(--surface-divider)]/60" />
                            </div>
                        </li>
                    ) : null}
                    {activeWorkItems.map((item) => <AgentInboxCard key={`${item.session.id}:card`} item={item} onSettle={(target) => setSettlement(target, 'settled')} props={props} />)}
                    {recentItems.length > 0 ? (
                        <li className="list-none">
                            <div className="mb-1 mt-3 flex w-full items-center gap-2 px-2.5 text-left">
                                <span className="text-xs font-medium text-sparkle-text-muted/50">Recent</span>
                                <span className="h-px flex-1 bg-[var(--surface-divider)]/60" />
                            </div>
                        </li>
                    ) : null}
                    {recentItems.map((item) => <AgentInboxSlimRow key={`${item.session.id}:recent`} item={item} action="settle" onAction={(target) => setSettlement(target, 'settled')} props={props} />)}
                    {settledItems.length > 0 ? <li className="list-none"><button type="button" onClick={() => setSettledExpanded((expanded) => !expanded)} aria-expanded={settledExpanded} className="mb-1 mt-3 flex w-full items-center gap-2 px-2.5 text-left"><span className="text-xs font-medium text-sparkle-text-muted/50">{settledExpanded ? 'Settled' : `Settled (${settledItems.length})`}</span><span className="h-px flex-1 bg-[var(--surface-divider)]/60" /><ChevronDown size={12} className={cn('text-sparkle-text-muted/50 transition-transform', settledExpanded && 'rotate-180')} /></button></li> : null}
                    {renderedSettled.map((item) => <AgentInboxSlimRow key={`${item.session.id}:settled`} item={item} action="unsettle" onAction={(target) => setSettlement(target, 'active')} props={props} />)}
                    {settledExpanded && hiddenSettledCount > 0 ? <li className="list-none"><button type="button" onClick={() => setSettledVisibleCount((count) => count + SETTLED_PAGE_COUNT)} className="mt-1 flex h-[30px] w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-[var(--surface-divider)] font-mono text-[11px] text-sparkle-text-muted transition-colors hover:border-solid hover:bg-[var(--surface-hover)] hover:text-sparkle-text">Show {Math.min(hiddenSettledCount, SETTLED_PAGE_COUNT)} more <span className="text-sparkle-text-muted/50">({hiddenSettledCount} settled hidden)</span></button></li> : null}
                </ul>
                {items.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 px-2 py-6 text-center text-xs text-sparkle-text-muted/60">
                        <span>{scopedProject ? `No chats in ${scopedProject.label} yet` : projectGroups.length === 0 ? 'No projects yet' : 'No chats yet'}</span>
                        {projectGroups.length === 0 ? <button type="button" onClick={() => void props.onCreateProjectChat()} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--surface-divider)] px-2.5 py-1 text-[11px] font-medium text-sparkle-text-muted transition-colors hover:bg-[var(--surface-hover)] hover:text-sparkle-text"><FolderPlus size={12} />Add project</button> : null}
                    </div>
                ) : null}
            </div>
        </>
    )
})
