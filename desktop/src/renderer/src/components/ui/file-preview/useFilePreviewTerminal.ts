import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Shell } from '@/lib/settings'
import { Terminal as XtermTerminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import type { PreviewFile } from './types'
import { createPreviewTerminalSessionId, mapTerminalStatusToState, PREVIEW_TERMINAL_MIN_HEIGHT, readCssVariable, TERMINAL_PANEL_ANIMATION_MS, type PreviewTerminalSessionItem, type PreviewTerminalState, type TerminalPanelPhase } from './modalShared'

type UseFilePreviewTerminalParams = {
    canUsePreviewTerminal: boolean; file: PreviewFile; projectPath?: string; defaultShell: Shell; accentColorPrimary?: string; themeKey?: string; initialHeight: number; persistHeight: (height: number) => void
}

export function useFilePreviewTerminal({
    canUsePreviewTerminal,
    file,
    projectPath,
    defaultShell,
    accentColorPrimary,
    themeKey,
    initialHeight,
    persistHeight
}: UseFilePreviewTerminalParams) {
    const [terminalVisible, setTerminalVisible] = useState(false)
    const [terminalSessions, setTerminalSessions] = useState<PreviewTerminalSessionItem[]>([])
    const [terminalState, setTerminalState] = useState<PreviewTerminalState>('idle')
    const [terminalPanelPhase, setTerminalPanelPhase] = useState<TerminalPanelPhase>('hidden')
    const [terminalSessionId, setTerminalSessionId] = useState('')
    const [terminalGroupKey, setTerminalGroupKey] = useState('')
    const [terminalGroupCwd, setTerminalGroupCwd] = useState('')
    const [terminalHeight, setTerminalHeight] = useState(initialHeight)
    const [isResizingTerminal, setIsResizingTerminal] = useState(false)
    const [terminalError, setTerminalError] = useState<string | null>(null)
    const [pendingTerminalCommand, setPendingTerminalCommand] = useState<string | null>(null)
    const [terminalShellLabel, setTerminalShellLabel] = useState(defaultShell === 'cmd' ? 'CMD' : 'PowerShell')
    const [terminalSessionCwd, setTerminalSessionCwd] = useState(projectPath || file.path || '')
    const [terminalNewShell, setTerminalNewShell] = useState<Shell>(defaultShell)

    const terminalResizeRef = useRef<{ startY: number; startHeight: number } | null>(null)
    const terminalHostRef = useRef<HTMLDivElement | null>(null)
    const terminalMountedHostRef = useRef<HTMLDivElement | null>(null)
    const xtermRef = useRef<XtermTerminal | null>(null)
    const fitAddonRef = useRef<FitAddon | null>(null)
    const terminalHydratedSessionIdRef = useRef('')
    const terminalSessionIdRef = useRef(terminalSessionId)
    useEffect(() => {
        terminalSessionIdRef.current = terminalSessionId
    }, [terminalSessionId])

    const terminalTheme = useMemo(() => {
        const accent = readCssVariable('--accent-primary', accentColorPrimary || '#38bdf8')
        const card = readCssVariable('--color-card', '#0b1220')
        const bg = readCssVariable('--color-bg', '#020617')
        const text = '#e5e7eb'
        const textSecondary = '#94a3b8'
        const borderSecondary = readCssVariable('--color-border-secondary', '#334155')
        return {
            background: card,
            foreground: text,
            cursor: accent,
            cursorAccent: card,
            selectionBackground: `${accent}33`,
            black: bg,
            brightBlack: borderSecondary,
            red: '#f87171',
            brightRed: '#fca5a5',
            green: '#4ade80',
            brightGreen: '#86efac',
            yellow: '#facc15',
            brightYellow: '#fde047',
            blue: '#60a5fa',
            brightBlue: '#93c5fd',
            magenta: '#c084fc',
            brightMagenta: '#e9d5ff',
            cyan: '#22d3ee',
            brightCyan: '#67e8f9',
            white: textSecondary,
            brightWhite: text
        }
    }, [accentColorPrimary, themeKey])

    const shouldShowTerminalPanel = canUsePreviewTerminal && terminalVisible
    const renderTerminalPanel = terminalPanelPhase !== 'hidden'
    const currentTerminalSession = terminalSessions.find((session) => session.sessionId === terminalSessionId) || null
    useEffect(() => {
        setTerminalVisible(false)
        setTerminalSessions([])
        setTerminalState('idle')
        setTerminalPanelPhase('hidden')
        setTerminalSessionId('')
        setTerminalGroupKey('')
        setTerminalGroupCwd('')
        setTerminalHeight(initialHeight)
        setIsResizingTerminal(false)
        setTerminalError(null)
        setPendingTerminalCommand(null)
        setTerminalShellLabel(defaultShell === 'cmd' ? 'CMD' : 'PowerShell')
        setTerminalSessionCwd(projectPath || file.path || '')
        setTerminalNewShell(defaultShell)
    }, [defaultShell, file.path, initialHeight, projectPath])

    useEffect(() => {
        const normalizedHeight = Math.max(PREVIEW_TERMINAL_MIN_HEIGHT, Math.min(720, Math.round(terminalHeight)))
        const timer = window.setTimeout(() => persistHeight(normalizedHeight), 150)
        return () => window.clearTimeout(timer)
    }, [persistHeight, terminalHeight])

    const refreshPreviewTerminalSessions = useCallback(async (preferredSessionId?: string) => {
        if (!canUsePreviewTerminal) {
            setTerminalSessions([])
            setTerminalSessionId('')
            setTerminalGroupKey('')
            setTerminalGroupCwd('')
            return []
        }

        const targetPath = projectPath || file.path
        const result = await window.devscope.listPreviewTerminalSessions({ targetPath })
        if (!result?.success) {
            setTerminalError(result?.error || 'Failed to load terminal sessions.')
            return []
        }
        const nextSessions = (result.sessions || []) as PreviewTerminalSessionItem[]
        setTerminalGroupKey(String(result.groupKey || ''))
        setTerminalGroupCwd(String(result.cwd || targetPath || ''))
        setTerminalSessions((current) => {
            const unreadIds = new Set(current.filter((session) => session.hasUnreadOutput).map((session) => session.sessionId))
            return nextSessions.map((session) => ({
                ...session,
                hasUnreadOutput: unreadIds.has(session.sessionId)
                    && session.sessionId !== preferredSessionId
                    && session.sessionId !== terminalSessionIdRef.current
            }))
        })

        const selectedSessionId = preferredSessionId
            || terminalSessionIdRef.current
            || nextSessions.find((session) => session.status === 'running')?.sessionId
            || nextSessions[0]?.sessionId
            || ''
        terminalSessionIdRef.current = selectedSessionId
        setTerminalSessionId(selectedSessionId)

        const activeSession = nextSessions.find((session) => session.sessionId === selectedSessionId) || null
        setTerminalShellLabel(
            String(activeSession?.shell || defaultShell || 'terminal')
                .replace(/\.exe$/i, '')
                .replace(/^pwsh$/i, 'PowerShell')
                .replace(/^powershell$/i, 'PowerShell')
                .replace(/^cmd$/i, 'CMD')
        )
        setTerminalSessionCwd(String(activeSession?.cwd || result.cwd || targetPath || ''))
        setTerminalState(mapTerminalStatusToState(activeSession?.status))
        if (!activeSession) xtermRef.current?.clear()

        return nextSessions
    }, [canUsePreviewTerminal, defaultShell, file.path, projectPath])

    const createPreviewTerminalSession = useCallback(async (preferredShell?: Shell, title?: string) => {
        if (!canUsePreviewTerminal) return null
        const nextSessionId = createPreviewTerminalSessionId()
        terminalSessionIdRef.current = nextSessionId
        setTerminalSessionId(nextSessionId)
        setTerminalState('connecting')
        setTerminalError(null)

        const nextShell = preferredShell || defaultShell
        setTerminalNewShell(nextShell)

        const result = await window.devscope.createPreviewTerminal({
            sessionId: nextSessionId,
            targetPath: projectPath || file.path,
            preferredShell: nextShell,
            cols: 100,
            rows: 28,
            title
        })

        if (!result?.success) {
            setTerminalState('error')
            setTerminalError(result?.error || 'Failed to start terminal session.')
            return null
        }

        await refreshPreviewTerminalSessions(nextSessionId)
        return nextSessionId
    }, [canUsePreviewTerminal, defaultShell, file.path, projectPath, refreshPreviewTerminalSessions])

    const closePreviewTerminal = useCallback(async (sessionId?: string) => {
        const targetSessionId = String(sessionId || terminalSessionIdRef.current || '').trim()
        if (!targetSessionId) return
        await window.devscope.closePreviewTerminal(targetSessionId).catch(() => undefined)
    }, [])

    const stopPreviewTerminalSession = useCallback(async (sessionId?: string) => {
        const targetSessionId = String(sessionId || terminalSessionIdRef.current || '').trim()
        if (!targetSessionId) return
        await closePreviewTerminal(targetSessionId)
        const nextSessions = await refreshPreviewTerminalSessions(
            targetSessionId === terminalSessionIdRef.current ? undefined : terminalSessionIdRef.current
        )
        if (targetSessionId === terminalSessionIdRef.current && nextSessions.length === 0) {
            setTerminalState('idle')
            setTerminalShellLabel(defaultShell === 'cmd' ? 'CMD' : 'PowerShell')
            setTerminalSessionCwd(terminalGroupCwd || projectPath || file.path || '')
            xtermRef.current?.clear()
        }
    }, [closePreviewTerminal, defaultShell, file.path, projectPath, refreshPreviewTerminalSessions, terminalGroupCwd])

    const selectPreviewTerminalSession = useCallback((sessionId: string) => {
        if (!sessionId) return
        terminalSessionIdRef.current = sessionId
        setTerminalSessionId(sessionId)
        setTerminalSessions((current) => current.map((session) => (
            session.sessionId === sessionId ? { ...session, hasUnreadOutput: false } : session
        )))
    }, [])

    const clearTerminalOutput = useCallback(() => {
        xtermRef.current?.clear()
    }, [])

    const focusTerminal = useCallback(() => {
        xtermRef.current?.focus()
    }, [])

    const queueTerminalCommand = useCallback((command: string) => {
        setTerminalVisible(true)
        setPendingTerminalCommand(command)
    }, [])

    const disposePreviewTerminal = useCallback(() => {
        terminalHydratedSessionIdRef.current = ''
        terminalMountedHostRef.current = null
        fitAddonRef.current = null
        xtermRef.current?.dispose()
        xtermRef.current = null
    }, [])

    useEffect(() => {
        if (shouldShowTerminalPanel) {
            setTerminalPanelPhase((current) => (current === 'visible' ? current : 'entering'))
            const rafId = window.requestAnimationFrame(() => {
                setTerminalPanelPhase((current) => (current === 'entering' ? 'visible' : current))
            })
            return () => window.cancelAnimationFrame(rafId)
        }

        setTerminalPanelPhase((current) => (current === 'hidden' ? current : 'exiting'))
        const timeoutId = window.setTimeout(() => {
            setTerminalPanelPhase((current) => (current === 'exiting' ? 'hidden' : current))
        }, TERMINAL_PANEL_ANIMATION_MS)
        return () => window.clearTimeout(timeoutId)
    }, [shouldShowTerminalPanel])

    useEffect(() => {
        if (!terminalVisible) {
            setTerminalState('idle')
            setTerminalError(null)
            setPendingTerminalCommand(null)
            disposePreviewTerminal()
            return
        }

        if (!renderTerminalPanel) return
        if (!canUsePreviewTerminal) {
            setTerminalState('error')
            setTerminalError('No valid path available to open terminal.')
            return
        }
        if (!currentTerminalSession) {
            disposePreviewTerminal()
            return
        }
        const host = terminalHostRef.current
        if (!host) return
        let terminal = xtermRef.current
        let fitAddon = fitAddonRef.current
        if (terminal && terminalMountedHostRef.current && terminalMountedHostRef.current !== host) {
            disposePreviewTerminal()
            terminal = null
            fitAddon = null
        }
        if (!terminal || !fitAddon) {
            terminal = new XtermTerminal({
                cursorBlink: true,
                fontFamily: 'Consolas, "Cascadia Code", monospace',
                fontSize: Math.max(11, Number.parseInt(readCssVariable('--terminal-font-size', '14'), 10) || 14),
                convertEol: true,
                scrollback: 5000,
                allowProposedApi: true,
                theme: terminalTheme
            })
            fitAddon = new FitAddon()
            terminal.loadAddon(fitAddon)
            terminal.loadAddon(new WebLinksAddon())
            terminal.open(host)
            terminal.focus()
            terminalMountedHostRef.current = host
            xtermRef.current = terminal
            fitAddonRef.current = fitAddon
            terminal.onData((data) => {
                void window.devscope.writePreviewTerminal({ sessionId: terminalSessionIdRef.current, data }).catch(() => undefined)
            })
            terminal.onTitleChange((title) => {
                const normalizedTitle = String(title || '').trim()
                const activeSessionId = terminalSessionIdRef.current
                if (!normalizedTitle || !activeSessionId) return
                void window.devscope.setPreviewTerminalTitle({
                    sessionId: activeSessionId,
                    title: normalizedTitle
                }).catch(() => undefined)
            })
        }

        if (terminalHydratedSessionIdRef.current !== currentTerminalSession.sessionId) {
            terminal.clear()
            if (currentTerminalSession.recentOutput) terminal.write(currentTerminalSession.recentOutput)
            terminalHydratedSessionIdRef.current = currentTerminalSession.sessionId
            window.requestAnimationFrame(() => {
                const activeTerminal = xtermRef.current
                if (!activeTerminal) return
                activeTerminal.refresh(0, Math.max(0, activeTerminal.rows - 1))
            })
        }

        const syncTerminalSize = () => {
            const activeFitAddon = fitAddonRef.current
            if (!activeFitAddon) return
            activeFitAddon.fit()
            const dimensions = activeFitAddon.proposeDimensions?.()
            if (!dimensions) return
            void window.devscope.resizePreviewTerminal({
                sessionId: terminalSessionIdRef.current,
                cols: dimensions.cols,
                rows: dimensions.rows
            }).catch(() => undefined)
        }

        const resizeObserver = new ResizeObserver(syncTerminalSize)
        resizeObserver.observe(host)
        window.addEventListener('resize', syncTerminalSize)
        const initialSyncTimer = window.setTimeout(syncTerminalSize, 0)
        const retrySyncTimer = window.setTimeout(syncTerminalSize, 96)
        const settleSyncTimer = window.setTimeout(syncTerminalSize, TERMINAL_PANEL_ANIMATION_MS + 40)

        return () => {
            resizeObserver.disconnect()
            window.removeEventListener('resize', syncTerminalSize)
            window.clearTimeout(initialSyncTimer)
            window.clearTimeout(retrySyncTimer)
            window.clearTimeout(settleSyncTimer)
        }
    }, [canUsePreviewTerminal, currentTerminalSession, disposePreviewTerminal, renderTerminalPanel, terminalTheme, terminalVisible])

    useEffect(() => {
        if (!terminalVisible || !renderTerminalPanel) return
        const unsubscribe = window.devscope.onPreviewTerminalEvent((eventPayload) => {
            if (!eventPayload?.sessionId) return
            if (eventPayload.type === 'output') {
                const outputChunk = String(eventPayload.data || '')
                setTerminalSessions((current) => current.map((session) => {
                    if (session.sessionId !== eventPayload.sessionId) return session
                    const nextRecentOutput = `${session.recentOutput || ''}${outputChunk}`.slice(-60_000)
                    const isActive = eventPayload.sessionId === terminalSessionIdRef.current
                    return {
                        ...session,
                        title: eventPayload.title || session.title,
                        shell: eventPayload.shell || session.shell,
                        cwd: eventPayload.cwd || session.cwd,
                        groupKey: eventPayload.groupKey || session.groupKey,
                        status: eventPayload.status || session.status,
                        recentOutput: nextRecentOutput,
                        lastActivityAt: Date.now(),
                        hasUnreadOutput: isActive ? false : true
                    }
                }))
                if (eventPayload.sessionId === terminalSessionIdRef.current) xtermRef.current?.write(outputChunk)
                return
            }
            if (eventPayload.type === 'title') {
                setTerminalSessions((current) => current.map((session) => (
                    session.sessionId === eventPayload.sessionId
                        ? {
                            ...session,
                            title: eventPayload.title || session.title,
                            shell: eventPayload.shell || session.shell,
                            cwd: eventPayload.cwd || session.cwd,
                            groupKey: eventPayload.groupKey || session.groupKey,
                            status: eventPayload.status || session.status,
                            lastActivityAt: Date.now()
                        }
                        : session
                )))
                return
            }
            if (eventPayload.type === 'started') {
                void refreshPreviewTerminalSessions(eventPayload.sessionId).then(() => {
                    if (eventPayload.sessionId === terminalSessionIdRef.current) {
                        setTerminalState('active')
                        setTerminalError(null)
                        window.setTimeout(() => xtermRef.current?.focus(), 0)
                    }
                })
                return
            }
            if (eventPayload.type === 'error') {
                setTerminalError(String(eventPayload.message || 'Terminal session error.'))
                void refreshPreviewTerminalSessions(eventPayload.sessionId)
                return
            }
            if (eventPayload.type === 'exit') {
                void refreshPreviewTerminalSessions(eventPayload.sessionId)
            }
        })
        return () => unsubscribe()
    }, [refreshPreviewTerminalSessions, renderTerminalPanel, terminalVisible])

    useEffect(() => {
        if (!terminalVisible || !renderTerminalPanel || !canUsePreviewTerminal) return
        let active = true
        void refreshPreviewTerminalSessions().then((sessions) => {
            if (!active || sessions.length > 0) return
            void createPreviewTerminalSession()
        })
        return () => {
            active = false
        }
    }, [canUsePreviewTerminal, createPreviewTerminalSession, refreshPreviewTerminalSessions, renderTerminalPanel, terminalVisible])
    useEffect(() => {
        if (!terminalVisible || !renderTerminalPanel) return
        const activeSession = currentTerminalSession
        if (!activeSession) {
            setTerminalState('idle')
            setTerminalShellLabel(defaultShell === 'cmd' ? 'CMD' : 'PowerShell')
            setTerminalSessionCwd(terminalGroupCwd || projectPath || file.path || '')
            return
        }

        setTerminalShellLabel(
            String(activeSession.shell || defaultShell || 'terminal')
                .replace(/\.exe$/i, '')
                .replace(/^pwsh$/i, 'PowerShell')
                .replace(/^powershell$/i, 'PowerShell')
                .replace(/^cmd$/i, 'CMD')
        )
        setTerminalSessionCwd(activeSession.cwd || terminalGroupCwd || projectPath || file.path || '')
        setTerminalState(mapTerminalStatusToState(activeSession.status))
        setTerminalSessions((current) => current.map((session) => (
            session.sessionId === terminalSessionId && session.hasUnreadOutput ? { ...session, hasUnreadOutput: false } : session
        )))
    }, [currentTerminalSession, defaultShell, file.path, projectPath, renderTerminalPanel, terminalGroupCwd, terminalSessionId, terminalVisible])
    useEffect(() => {
        if (!pendingTerminalCommand || !terminalVisible || terminalState !== 'active' || !terminalSessionIdRef.current) return
        const commandToWrite = pendingTerminalCommand
        setPendingTerminalCommand(null)
        void window.devscope.writePreviewTerminal({
            sessionId: terminalSessionIdRef.current,
            data: commandToWrite
        }).catch((error: any) => {
            setTerminalError(error?.message || 'Failed to send command to terminal.')
        })
    }, [pendingTerminalCommand, terminalState, terminalVisible])

    const startTerminalResize = useCallback((event: { preventDefault: () => void; clientY: number }) => {
        event.preventDefault()
        terminalResizeRef.current = { startY: event.clientY, startHeight: terminalHeight }
        setIsResizingTerminal(true)
    }, [terminalHeight])

    useEffect(() => {
        if (!isResizingTerminal) return
        const applyDragState = (active: boolean) => {
            if (active) {
                document.documentElement.style.setProperty('cursor', 'row-resize', 'important')
                document.documentElement.style.setProperty('user-select', 'none', 'important')
                document.body.style.setProperty('cursor', 'row-resize', 'important')
                document.body.style.setProperty('user-select', 'none', 'important')
                return
            }

            document.documentElement.style.removeProperty('cursor')
            document.documentElement.style.removeProperty('user-select')
            document.body.style.removeProperty('cursor')
            document.body.style.removeProperty('user-select')
        }

        const maxHeight = Math.max(220, Math.floor(window.innerHeight * 0.78))
        const clamp = (value: number) => Math.min(maxHeight, Math.max(PREVIEW_TERMINAL_MIN_HEIGHT, value))
        const onMove = (event: MouseEvent) => {
            const resize = terminalResizeRef.current
            if (!resize) return
            const delta = resize.startY - event.clientY
            setTerminalHeight(clamp(resize.startHeight + delta))
        }
        const stop = () => {
            terminalResizeRef.current = null
            setIsResizingTerminal(false)
            applyDragState(false)
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', stop)
        }
        applyDragState(true)
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', stop)
        return stop
    }, [isResizingTerminal])

    useEffect(() => {
        return () => {
            disposePreviewTerminal()
        }
    }, [disposePreviewTerminal])

    return {
        terminalVisible,
        setTerminalVisible,
        terminalSessions,
        terminalState,
        terminalPanelPhase,
        terminalSessionId,
        terminalGroupKey,
        terminalGroupCwd,
        terminalHeight,
        terminalError,
        terminalShellLabel,
        terminalSessionCwd,
        terminalNewShell,
        setTerminalNewShell,
        currentTerminalSession,
        terminalTheme,
        terminalHostRef,
        shouldShowTerminalPanel,
        renderTerminalPanel,
        queueTerminalCommand,
        clearTerminalOutput,
        focusTerminal,
        createPreviewTerminalSession,
        stopPreviewTerminalSession,
        selectPreviewTerminalSession,
        startTerminalResize
    }
}
