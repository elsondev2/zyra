import { useShortcutLabel } from '@/lib/keybindings'
import type { CommandId } from '@shared/keybindings'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    Eraser,
    RotateCcw,
    SquareSplitHorizontal,
    SquareSplitVertical,
    X
} from 'lucide-react'
import type {
    DevScopePreviewTerminalSessionSummary,
    DevScopePreviewTerminalWorkspaceOwner
} from '@shared/contracts/devscope-api'
import type { ITheme } from 'xterm'
import type { Shell } from '@/lib/settings'
import { getAppearanceCodeFontStack, useSettings } from '@/lib/settings'
import { createPreviewTerminalSessionId, readCssVariable } from '@/components/ui/file-preview/modalShared'
import { cn } from '@/lib/utils'
import { useThemeRevision } from '@/lib/use-theme-revision'
import { AssistantTerminalViewport } from './AssistantTerminalViewport'
import { TerminalNewSessionMenu } from './TerminalNewSessionMenu'
import { TerminalSessionConnector } from './TerminalSessionConnector'
import {
    activateAssistantTerminalSession,
    addAssistantTerminalSession,
    ASSISTANT_TERMINALS_PER_GROUP_LIMIT,
    loadAssistantTerminalWorkspaceState,
    persistAssistantTerminalWorkspaceState,
    reconcileAssistantTerminalWorkspaceState,
    removeAssistantTerminalSession,
    type AssistantTerminalSplitDirection,
    type AssistantTerminalWorkspaceState
} from './assistant-terminal-workspace-state'

type TerminalSessionItem = DevScopePreviewTerminalSessionSummary & {
    hasUnreadOutput?: boolean
}

const MAX_TERMINAL_BUFFER_CHARS = 60_000

function shellPreferenceFromSession(session: DevScopePreviewTerminalSessionSummary | null, fallback: Shell): Shell {
    if (/cmd(?:\.exe)?$/i.test(String(session?.shell || ''))) return 'cmd'
    return fallback
}

export const AssistantTerminalWorkspace = memo(function AssistantTerminalWorkspace({
    workspaceKey,
    projectPath,
    active,
    terminalOwner,
    onSidebarWidthChange,
    onReady
}: {
    workspaceKey: string
    projectPath: string | null
    active: boolean
    terminalOwner?: DevScopePreviewTerminalWorkspaceOwner
    onSidebarWidthChange?: (width: number) => void
    onReady?: () => void
}) {
    const { settings } = useSettings()
    const shortcut = useShortcutLabel()
    const shortcutTitle = (label: string, id: CommandId) => `${label}${shortcut(id) ? ` (${shortcut(id)})` : ''}`
    const themeRevision = useThemeRevision()
    const normalizedProjectPath = String(projectPath || '').trim()
    const [sidebarWidth, setSidebarWidth] = useState(() => {
        try {
            return Math.max(190, Math.min(320, Number(localStorage.getItem('terminal:sidebar-width')) || 196))
        } catch {
            return 196
        }
    })
    useEffect(() => onSidebarWidthChange?.(sidebarWidth), [onSidebarWidthChange, sidebarWidth])
    const resizeRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null)
    const [sessions, setSessions] = useState<TerminalSessionItem[]>([])
    const [uiState, setUiState] = useState<AssistantTerminalWorkspaceState>(() => (
        loadAssistantTerminalWorkspaceState(workspaceKey)
    ))
    const [loading, setLoading] = useState(true)
    const [creating, setCreating] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [focusRequestId, setFocusRequestId] = useState(0)
    const [workspaceCapability, setWorkspaceCapability] = useState<string | null | undefined>(
        terminalOwner ? undefined : null
    )
    const sessionsRef = useRef(sessions)
    const uiStateRef = useRef(uiState)
    const outputBuffersRef = useRef(new Map<string, string>())
    const creatingRef = useRef(false)
    const mountedRef = useRef(true)
    const onReadyRef = useRef(onReady)
    const terminalOwnerKind = terminalOwner?.kind || null

    const terminalOwnerIdentity = terminalOwner?.kind === 'utility-tab'
        ? terminalOwner.tabId
        : terminalOwner?.kind === 'accessory-window'
            ? terminalOwner.workspaceId
            : terminalOwner?.runtimeId || null

    sessionsRef.current = sessions
    onReadyRef.current = onReady

    useEffect(() => {
        if (!loading && !creating && !error) onReadyRef.current?.()
    }, [creating, error, loading])
    uiStateRef.current = uiState

    useEffect(() => {
        if (!terminalOwnerKind || !terminalOwnerIdentity) {
            setWorkspaceCapability(null)
            return
        }
        let cancelled = false
        let registeredCapability: string | null = null
        setWorkspaceCapability(undefined)
        setError(null)
        const owner: DevScopePreviewTerminalWorkspaceOwner = terminalOwnerKind === 'utility-tab'
            ? { kind: 'utility-tab', tabId: terminalOwnerIdentity }
            : terminalOwnerKind === 'accessory-window'
                ? { kind: 'accessory-window', workspaceId: terminalOwnerIdentity }
                : { kind: 'main-workspace', runtimeId: terminalOwnerIdentity }
        void window.devscope.registerPreviewTerminalWorkspace(owner).then((result) => {
            if (!result.success) {
                if (!cancelled) setError(result.error || 'Failed to authorize terminal workspace.')
                return
            }
            registeredCapability = result.workspaceCapability
            if (cancelled) {
                void window.devscope.releasePreviewTerminalWorkspace(result.workspaceCapability)
                return
            }
            setWorkspaceCapability(result.workspaceCapability)
        }).catch((registrationError: unknown) => {
            if (!cancelled) setError(registrationError instanceof Error ? registrationError.message : 'Failed to authorize terminal workspace.')
        })
        return () => {
            cancelled = true
            if (registeredCapability) void window.devscope.releasePreviewTerminalWorkspace(registeredCapability)
        }
    }, [terminalOwnerIdentity, terminalOwnerKind])

    const terminalTheme = useMemo<ITheme>(() => {
        const accent = readCssVariable('--accent-primary', settings.accentColor.primary || '#38bdf8')
        const card = readCssVariable('--color-card', '#0b1220')
        const bg = readCssVariable('--color-bg', '#020617')
        const text = readCssVariable('--color-text', '#e5e7eb')
        const muted = readCssVariable('--color-text-secondary', '#94a3b8')
        const danger = readCssVariable('--status-danger', '#f87171')
        const warning = readCssVariable('--status-warning', '#facc15')
        const success = readCssVariable('--status-success', '#4ade80')
        const info = readCssVariable('--status-info', '#60a5fa')
        const secondary = readCssVariable('--color-secondary', '#c084fc')
        const accentSecondary = readCssVariable('--accent-secondary', '#22d3ee')
        return {
            background: bg,
            foreground: text,
            cursor: accent,
            cursorAccent: card,
            selectionBackground: `${accent}33`,
            black: bg,
            brightBlack: muted,
            red: danger,
            brightRed: danger,
            green: success,
            brightGreen: success,
            yellow: warning,
            brightYellow: warning,
            blue: info,
            brightBlue: info,
            magenta: secondary,
            brightMagenta: secondary,
            cyan: accentSecondary,
            brightCyan: accentSecondary,
            white: muted,
            brightWhite: text
        }
    }, [settings.accentColor.primary, settings.theme, themeRevision])

    const commitUiState = useCallback((nextState: AssistantTerminalWorkspaceState) => {
        uiStateRef.current = nextState
        setUiState(nextState)
        persistAssistantTerminalWorkspaceState(workspaceKey, nextState)
    }, [workspaceKey])

    const refreshSessions = useCallback(async (preferredSessionId?: string) => {
        const result = await window.devscope.listPreviewTerminalSessions({
            workspaceCapability: workspaceCapability || undefined
        })
        if (!result.success) {
            if (mountedRef.current) setError(result.error || 'Failed to load terminal sessions.')
            return []
        }
        const nextSessions = (result.sessions || []) as TerminalSessionItem[]
        for (const session of nextSessions) {
            outputBuffersRef.current.set(session.sessionId, String(session.recentOutput || ''))
        }
        if (!mountedRef.current) return nextSessions
        setSessions((current) => {
            const unreadIds = new Set(current.filter((session) => session.hasUnreadOutput).map((session) => session.sessionId))
            return nextSessions.map((session) => ({
                ...session,
                hasUnreadOutput: unreadIds.has(session.sessionId)
                    && session.sessionId !== preferredSessionId
                    && session.sessionId !== uiStateRef.current.activeTerminalId
            }))
        })
        let reconciled = reconcileAssistantTerminalWorkspaceState(
            uiStateRef.current,
            nextSessions.map((session) => session.sessionId)
        )
        if (preferredSessionId) reconciled = activateAssistantTerminalSession(reconciled, preferredSessionId)
        commitUiState(reconciled)
        setError(null)
        return nextSessions
    }, [commitUiState, workspaceCapability])

    const createTerminal = useCallback(async (
        mode: 'new' | 'split' = 'new',
        splitDirection: AssistantTerminalSplitDirection = 'horizontal',
        preferredShell: Shell = settings.defaultShell,
        targetDirectory: string = normalizedProjectPath
    ) => {
        if (creatingRef.current) return null
        const activeGroup = uiStateRef.current.groups.find((group) => group.id === uiStateRef.current.activeGroupId)
        if (mode === 'split' && activeGroup && activeGroup.terminalIds.length >= ASSISTANT_TERMINALS_PER_GROUP_LIMIT) return null

        creatingRef.current = true
        setCreating(true)
        setError(null)
        const terminalId = createPreviewTerminalSessionId()
        const previousState = uiStateRef.current
        const optimisticState = addAssistantTerminalSession(
            previousState,
            sessionsRef.current.map((session) => session.sessionId),
            terminalId,
            mode,
            splitDirection
        )
        commitUiState(optimisticState)

        try {
            const result = await window.devscope.createPreviewTerminal({
                sessionId: terminalId,
                targetPath: targetDirectory || undefined,
                preferredShell,
                cols: 80,
                rows: 24,
                workspaceCapability: workspaceCapability || undefined
            })
            if (!result.success) {
                commitUiState(previousState)
                setError(result.error || 'Failed to create terminal.')
                return null
            }
            outputBuffersRef.current.set(terminalId, String(result.session.recentOutput || ''))
            await refreshSessions(terminalId)
            setFocusRequestId((requestId) => requestId + 1)
            return terminalId
        } catch (createError: unknown) {
            commitUiState(previousState)
            setError(createError instanceof Error ? createError.message : 'Failed to create terminal.')
            return null
        } finally {
            creatingRef.current = false
            if (mountedRef.current) setCreating(false)
        }
    }, [commitUiState, normalizedProjectPath, refreshSessions, settings.defaultShell, workspaceCapability])

    useEffect(() => {
        mountedRef.current = true
        if (workspaceCapability === undefined) return
        let cancelled = false
        setLoading(true)
        void refreshSessions().then((knownSessions) => {
            if (cancelled) return
            if (knownSessions.length === 0) return createTerminal('new', 'horizontal', settings.defaultShell)
        }).catch((reason: unknown) => {
            if (!cancelled) setError(reason instanceof Error ? reason.message : 'Failed to start terminal workspace.')
        }).finally(() => {
            if (!cancelled) setLoading(false)
        })
        return () => {
            cancelled = true
            mountedRef.current = false
        }
    }, [createTerminal, refreshSessions, settings.defaultShell, workspaceCapability])

    useEffect(() => {
        if (workspaceCapability === undefined) return
        const unsubscribe = window.devscope.onPreviewTerminalEvent((event) => {
            if (!event.sessionId) return
            if (event.type === 'output') {
                const outputChunk = String(event.data || '')
                outputBuffersRef.current.set(
                    event.sessionId,
                    `${outputBuffersRef.current.get(event.sessionId) || ''}${outputChunk}`.slice(-MAX_TERMINAL_BUFFER_CHARS)
                )
                setSessions((current) => {
                    const index = current.findIndex((session) => session.sessionId === event.sessionId)
                    if (index < 0) return current
                    const currentSession = current[index]
                    const hasUnreadOutput = !(active && uiStateRef.current.activeTerminalId === event.sessionId)
                    const nextTitle = event.title || currentSession.title
                    const nextStatus = event.status || currentSession.status
                    if (
                        currentSession.hasUnreadOutput === hasUnreadOutput
                        && currentSession.title === nextTitle
                        && currentSession.status === nextStatus
                    ) return current
                    const next = current.slice()
                    next[index] = {
                        ...currentSession,
                        title: nextTitle,
                        status: nextStatus,
                        cwd: event.cwd || currentSession.cwd,
                        shell: event.shell || currentSession.shell,
                        lastActivityAt: Date.now(),
                        hasUnreadOutput
                    }
                    return next
                })
                return
            }
            if (event.type === 'clear') {
                outputBuffersRef.current.set(event.sessionId, '')
                setSessions((current) => current.map((session) => session.sessionId === event.sessionId
                    ? { ...session, recentOutput: '', lastActivityAt: Date.now() }
                    : session))
                return
            }
            if (event.type === 'title') {
                setSessions((current) => current.map((session) => session.sessionId === event.sessionId
                    ? {
                        ...session,
                        title: event.title || session.title,
                        cwd: event.cwd || session.cwd,
                        shell: event.shell || session.shell,
                        status: event.status || session.status,
                        lastActivityAt: Date.now()
                    }
                    : session))
                return
            }
            if (event.type === 'error') {
                setError(event.message || 'Terminal session error.')
            }
            if (event.type === 'started' || event.type === 'exit' || event.type === 'error') {
                void refreshSessions()
            }
        }, workspaceCapability || undefined)
        return () => unsubscribe()
    }, [active, refreshSessions, workspaceCapability])

    useEffect(() => {
        if (active) setFocusRequestId((requestId) => requestId + 1)
    }, [active])

    const activateTerminal = useCallback((terminalId: string) => {
        commitUiState(activateAssistantTerminalSession(uiStateRef.current, terminalId))
        setSessions((current) => current.map((session) => session.sessionId === terminalId
            ? { ...session, hasUnreadOutput: false }
            : session))
        setFocusRequestId((requestId) => requestId + 1)
    }, [commitUiState])

    const closeTerminal = useCallback(async (terminalId: string) => {
        await window.devscope.closePreviewTerminal({
            sessionId: terminalId,
            workspaceCapability: workspaceCapability || undefined
        }).catch(() => undefined)
        outputBuffersRef.current.delete(terminalId)
        commitUiState(removeAssistantTerminalSession(uiStateRef.current, terminalId))
        await refreshSessions()
    }, [commitUiState, refreshSessions, workspaceCapability])

    const clearTerminal = useCallback(async (terminalId: string) => {
        outputBuffersRef.current.set(terminalId, '')
        const result = await window.devscope.clearPreviewTerminal({
            sessionId: terminalId,
            workspaceCapability: workspaceCapability || undefined
        })
        if (!result.success) setError(result.error || 'Failed to clear terminal output.')
    }, [workspaceCapability])

    const restartTerminal = useCallback(async (session: TerminalSessionItem) => {
        setError(null)
        outputBuffersRef.current.set(session.sessionId, '')
        const result = await window.devscope.createPreviewTerminal({
            sessionId: session.sessionId,
            targetPath: session.cwd,
            preferredShell: shellPreferenceFromSession(session, settings.defaultShell),
            cols: 80,
            rows: 24,
            title: session.title,
            workspaceCapability: workspaceCapability || undefined
        })
        if (!result.success) {
            setError(result.error || 'Failed to restart terminal.')
            return
        }
        await refreshSessions(session.sessionId)
        setFocusRequestId((requestId) => requestId + 1)
    }, [refreshSessions, settings.defaultShell, workspaceCapability])

    const activeSession = sessions.find((session) => session.sessionId === uiState.activeTerminalId) || sessions[0] || null
    useEffect(() => {
        if (!active) return
        const run = (event: Event) => {
            const id = (event as CustomEvent<CommandId>).detail
            if (id === 'terminal.new') void createTerminal('new')
            else if (id === 'terminal.splitHorizontal') void createTerminal('split', 'horizontal')
            else if (id === 'terminal.splitVertical') void createTerminal('split', 'vertical')
            else if (id === 'terminal.close' && activeSession) void closeTerminal(activeSession.sessionId)
            else if (id === 'terminal.clear' && activeSession) void clearTerminal(activeSession.sessionId)
            else if (id === 'terminal.restart' && activeSession) void restartTerminal(activeSession)
        }
        window.addEventListener('zyra:run-scoped-command', run)
        return () => window.removeEventListener('zyra:run-scoped-command', run)
    }, [active, activeSession, clearTerminal, closeTerminal, createTerminal, restartTerminal])
    const activeGroup = uiState.groups.find((group) => group.id === uiState.activeGroupId)
        || uiState.groups.find((group) => group.terminalIds.includes(activeSession?.sessionId || ''))
        || uiState.groups[0]
        || null
    const visibleSessions = (activeGroup?.terminalIds || [])
        .map((sessionId) => sessions.find((session) => session.sessionId === sessionId) || null)
        .filter(Boolean) as TerminalSessionItem[]
    const splitLimitReached = visibleSessions.length >= ASSISTANT_TERMINALS_PER_GROUP_LIMIT
    const resizeSidebar = (clientX: number) => {
        const start = resizeRef.current
        if (!start) return
        setSidebarWidth(Math.max(190, Math.min(320, start.startWidth + clientX - start.startX)))
    }
    const finishResize = (pointerId: number) => {
        if (resizeRef.current?.pointerId !== pointerId) return
        resizeRef.current = null
        try { localStorage.setItem('terminal:sidebar-width', String(sidebarWidth)) } catch { /* keep this window's width */ }
    }

    return (
        <section className="flex min-h-0 flex-1 overflow-hidden bg-[color-mix(in_srgb,var(--color-bg)_96%,black)]" aria-label="Terminal workspace">
            <aside className="relative flex min-w-[190px] max-w-[320px] shrink-0 flex-col border-r border-[var(--surface-divider)] bg-[color-mix(in_srgb,var(--color-bg)_90%,var(--color-card))]" style={{ width: sidebarWidth }}>
                <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-[var(--surface-divider)] px-2.5">
                        <span className="text-[12px] font-semibold text-sparkle-text">Sessions</span>
                        <TerminalNewSessionMenu defaultShell={settings.defaultShell} defaultDirectory={normalizedProjectPath} creating={creating} onCreate={(shell, directory) => void createTerminal('new', 'horizontal', shell, directory)} shortcutTitle={shortcutTitle('New session', 'terminal.new')} />
                </div>
                <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto py-1" aria-label="Terminal sessions">
                    {uiState.groups.map((group) => {
                        const groupSessions = group.terminalIds.map((id) => sessions.find((session) => session.sessionId === id)).filter((session): session is TerminalSessionItem => Boolean(session))
                        if (groupSessions.length === 0) return null
                        return <div key={group.id} className="relative">
                            {groupSessions.map((session, index) => {
                                const selected = session.sessionId === activeSession?.sessionId
                                return <div key={session.sessionId} className={cn('group/session relative flex h-11 items-start gap-1 border-l-2 px-2 py-1.5', selected ? 'border-[var(--accent-primary)] bg-[color-mix(in_srgb,var(--accent-primary)_9%,transparent)]' : 'border-transparent hover:bg-white/[0.04]')}>
                                    <TerminalSessionConnector index={index} count={groupSessions.length} status={session.status} />
                                    <button type="button" onClick={() => activateTerminal(session.sessionId)} className="min-w-0 flex-1 pl-4 text-left" title={session.cwd} aria-current={selected ? 'page' : undefined}>
                                        <span className="flex h-4 items-center gap-1.5"><span className="min-w-0 flex-1 truncate text-[11px] font-medium leading-4 text-sparkle-text">{session.title}</span>{session.hasUnreadOutput ? <span className="size-1.5 shrink-0 rounded-full bg-sky-300" title="Unread output" /> : null}</span>
                                        <span className="mt-0.5 block truncate text-[9px] leading-3 text-sparkle-text-muted">{session.cwd}</span>
                                    </button>
                                    <button type="button" onClick={() => void closeTerminal(session.sessionId)} aria-label={'Close ' + session.title} title={'Close ' + session.title} className="inline-flex size-5 shrink-0 items-center justify-center rounded text-sparkle-text-muted opacity-0 hover:bg-red-500/10 hover:text-red-200 group-hover/session:opacity-100 focus:opacity-100 group-focus-within/session:opacity-100"><X size={12} /></button>
                                </div>
                            })}
                        </div>
                    })}
                </div>
                <div className="flex items-center gap-1 border-t border-[var(--surface-divider)] p-2">
                    <button type="button" onClick={() => void createTerminal('split', 'horizontal')} disabled={creating || !activeSession || splitLimitReached} aria-label="Split horizontally" title={shortcutTitle('Split horizontally', 'terminal.splitHorizontal')} className="inline-flex size-7 items-center justify-center rounded text-sparkle-text-secondary hover:bg-white/[0.06] disabled:opacity-30"><SquareSplitHorizontal size={14} /></button>
                    <button type="button" onClick={() => void createTerminal('split', 'vertical')} disabled={creating || !activeSession || splitLimitReached} aria-label="Split vertically" title={shortcutTitle('Split vertically', 'terminal.splitVertical')} className="inline-flex size-7 items-center justify-center rounded text-sparkle-text-secondary hover:bg-white/[0.06] disabled:opacity-30"><SquareSplitVertical size={14} /></button>
                    <button type="button" onClick={() => activeSession && void clearTerminal(activeSession.sessionId)} disabled={!activeSession} aria-label="Clear terminal" title={shortcutTitle('Clear terminal', 'terminal.clear')} className="inline-flex size-7 items-center justify-center rounded text-sparkle-text-secondary hover:bg-white/[0.06] disabled:opacity-30"><Eraser size={14} /></button>
                    <button type="button" onClick={() => activeSession && void restartTerminal(activeSession)} disabled={!activeSession} aria-label="Restart terminal" title={shortcutTitle('Restart terminal', 'terminal.restart')} className="inline-flex size-7 items-center justify-center rounded text-sparkle-text-secondary hover:bg-white/[0.06] disabled:opacity-30"><RotateCcw size={14} /></button>
                </div>
                <button type="button" role="separator" aria-orientation="vertical" aria-label="Resize terminal sidebar" aria-valuemin={190} aria-valuemax={320} aria-valuenow={sidebarWidth} title="Drag to resize sidebar" className="absolute inset-y-0 right-0 z-20 w-2 translate-x-1/2 cursor-col-resize touch-none bg-transparent hover:bg-[var(--accent-primary)]/15" onPointerDown={(event) => { resizeRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: sidebarWidth }; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={(event) => { if (resizeRef.current?.pointerId === event.pointerId) resizeSidebar(event.clientX) }} onPointerUp={(event) => finishResize(event.pointerId)} onPointerCancel={(event) => finishResize(event.pointerId)} onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setSidebarWidth((width) => { const next = Math.max(190, Math.min(320, width + (event.key === 'ArrowRight' ? 12 : -12))); try { localStorage.setItem('terminal:sidebar-width', String(next)) } catch { /* keep this window's width */ } return next }) } }} />
            </aside>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="min-h-0 min-w-0 flex-1">
                    {visibleSessions.length > 0 ? <div className="grid h-full min-h-0 w-full overflow-hidden" style={activeGroup?.splitDirection === 'vertical' ? { gridTemplateRows: 'repeat(' + visibleSessions.length + ', minmax(0, 1fr))' } : { gridTemplateColumns: 'repeat(' + visibleSessions.length + ', minmax(0, 1fr))' }}>
                        {visibleSessions.map((session, index) => <div key={session.sessionId} className={cn('relative min-h-0 min-w-0 px-2', index > 0 && (activeGroup?.splitDirection === 'vertical' ? 'border-t border-white/[0.08]' : 'border-l border-white/[0.08]'), session.sessionId === activeSession?.sessionId && visibleSessions.length > 1 && 'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent-primary)_35%,transparent)]')}>
                            <AssistantTerminalViewport session={session} workspaceCapability={workspaceCapability || undefined} initialOutput={outputBuffersRef.current.get(session.sessionId) || String(session.recentOutput || '')} theme={terminalTheme} fontFamily={getAppearanceCodeFontStack(settings.appearanceCodeFont)} fontSize={settings.terminalFontSize} cursorBlink={settings.terminalCursorBlink} scrollback={settings.terminalScrollback} active={session.sessionId === activeSession?.sessionId} visible={active} focusRequestId={focusRequestId} onActivate={() => activateTerminal(session.sessionId)} onNewTerminal={() => void createTerminal('new')} onSplitHorizontal={() => void createTerminal('split', 'horizontal')} onSplitVertical={() => void createTerminal('split', 'vertical')} onCloseTerminal={() => void closeTerminal(session.sessionId)} onClearTerminal={() => void clearTerminal(session.sessionId)} onRestartTerminal={() => void restartTerminal(session)} onError={setError} />
                        </div>)}
                    </div> : <div className="flex h-full items-center justify-center text-[11px] text-sparkle-text-muted">{loading || creating ? 'Starting terminal…' : 'No terminal sessions'}</div>}
                </div>
                {error ? <div role="alert" className="shrink-0 border-t border-red-500/15 bg-red-500/[0.06] px-3 py-2 text-[11px] text-red-300">{error}</div> : null}
            </div>
        </section>
    )
})
