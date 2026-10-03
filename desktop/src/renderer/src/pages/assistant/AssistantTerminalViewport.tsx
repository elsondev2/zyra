import { resolveShortcut } from '@shared/keybindings'
import { isShortcutRecording, keyboardInput, shortcutPlatform } from '@/lib/keybindings'
import { memo, useEffect, useRef } from 'react'
import type { DevScopePreviewTerminalSessionSummary } from '@shared/contracts/devscope-api'
import type { ITheme, Terminal as XtermTerminal } from 'xterm'
import type { FitAddon as XtermFitAddon } from 'xterm-addon-fit'
import { loadPreviewTerminalRuntime } from '@/components/ui/file-preview/previewTerminalRuntime'

function fitTerminalSafely(fitAddon: XtermFitAddon): boolean {
    try {
        fitAddon.fit()
        return true
    } catch {
        return false
    }
}

export const AssistantTerminalViewport = memo(function AssistantTerminalViewport({
    session,
    workspaceCapability,
    initialOutput,
    theme,
    fontFamily,
    fontSize,
    cursorBlink,
    scrollback,
    active,
    visible,
    focusRequestId,
    onActivate,
    onNewTerminal,
    onSplitHorizontal,
    onSplitVertical,
    onCloseTerminal,
    onClearTerminal,
    onRestartTerminal,
    onError
}: {
    session: DevScopePreviewTerminalSessionSummary
    workspaceCapability?: string
    initialOutput: string
    theme: ITheme
    fontFamily: string
    fontSize: number
    cursorBlink: boolean
    scrollback: number
    active: boolean
    visible: boolean
    focusRequestId: number
    onActivate: () => void
    onNewTerminal: () => void
    onSplitHorizontal: () => void
    onSplitVertical: () => void
    onCloseTerminal: () => void
    onClearTerminal: () => void
    onRestartTerminal: () => void
    onError: (message: string) => void
}) {
    const hostRef = useRef<HTMLDivElement | null>(null)
    const terminalRef = useRef<XtermTerminal | null>(null)
    const fitAddonRef = useRef<XtermFitAddon | null>(null)
    const initialOutputRef = useRef(initialOutput)
    const activeRef = useRef(active)
    const visibleRef = useRef(visible)
    const themeRef = useRef(theme)
    const actionRefs = useRef({ onNewTerminal, onSplitHorizontal, onSplitVertical, onCloseTerminal, onClearTerminal, onRestartTerminal })
    activeRef.current = active
    visibleRef.current = visible
    themeRef.current = theme
    actionRefs.current = { onNewTerminal, onSplitHorizontal, onSplitVertical, onCloseTerminal, onClearTerminal, onRestartTerminal }

    useEffect(() => {
        const host = hostRef.current
        if (!host) return
        let disposed = false
        let resizeObserver: ResizeObserver | null = null
        let mountedTerminal: XtermTerminal | null = null
        let inputDisposable: { dispose: () => void } | null = null
        let titleDisposable: { dispose: () => void } | null = null
        let syncFrame = 0
        // Guard browser input at its source. onData also carries automatic terminal
        // protocol replies, which must reach their own PTY even without focus.
        const inputEvents = ['keydown', 'keypress', 'keyup', 'paste', 'beforeinput', 'input', 'compositionstart', 'compositionupdate', 'compositionend']
        const guardInput = (event: Event) => {
            if (activeRef.current && visibleRef.current && host.contains(document.activeElement)) return
            event.preventDefault()
            event.stopImmediatePropagation()
        }
        for (const type of inputEvents) host.addEventListener(type, guardInput, true)
        // Output can arrive before the lazy xterm runtime resolves. Retain it in order.
        const pendingEvents: Parameters<Parameters<typeof window.devscope.onPreviewTerminalEvent>[0]>[0][] = []
        let pendingChars = 0
        const applyEvent = (terminal: XtermTerminal, event: typeof pendingEvents[number]) => {
            if (event.type === 'output') terminal.write(String(event.data || ''))
            else if (event.type === 'clear') terminal.clear()
            else if (event.type === 'error') terminal.write(`\r\n[terminal] ${event.message || 'Terminal error'}\r\n`)
            else if (event.type === 'exit') terminal.write(`\r\n[terminal] Process exited${typeof event.exitCode === 'number' ? ` (${event.exitCode})` : ''}.\r\n`)
        }

        const syncSize = () => {
            window.cancelAnimationFrame(syncFrame)
            syncFrame = window.requestAnimationFrame(() => {
                const terminal = terminalRef.current
                const fitAddon = fitAddonRef.current
                if (!terminal || !fitAddon || host.clientWidth <= 0 || host.clientHeight <= 0) return
                const wasAtBottom = terminal.buffer.active.viewportY >= terminal.buffer.active.baseY
                if (!fitTerminalSafely(fitAddon)) return
                if (wasAtBottom) terminal.scrollToBottom()
                void window.devscope.resizePreviewTerminal({
                    sessionId: session.sessionId,
                    cols: terminal.cols,
                    rows: terminal.rows,
                    workspaceCapability
                }).catch(() => undefined)
            })
        }

        void loadPreviewTerminalRuntime().then((runtime) => {
            if (disposed || hostRef.current !== host) return
            const terminal = new runtime.Terminal({
                cursorBlink,
                convertEol: true,
                fontFamily,
                fontSize,
                lineHeight: 1.08,
                scrollback,
                allowProposedApi: true,
                theme: themeRef.current
            })
            const fitAddon = new runtime.FitAddon()
            terminal.loadAddon(fitAddon)
            terminal.loadAddon(new runtime.WebLinksAddon())
            terminal.open(host)
            mountedTerminal = terminal
            terminalRef.current = terminal
            fitAddonRef.current = fitAddon
            if (initialOutputRef.current) terminal.write(initialOutputRef.current)
            for (const event of pendingEvents.splice(0)) applyEvent(terminal, event)

            terminal.attachCustomKeyEventHandler((event) => {
                if (isShortcutRecording()) return false
                const command = resolveShortcut(keyboardInput(event), shortcutPlatform(), 'terminal')
                const action = command === 'terminal.new' ? actionRefs.current.onNewTerminal
                    : command === 'terminal.splitHorizontal' ? actionRefs.current.onSplitHorizontal
                    : command === 'terminal.splitVertical' ? actionRefs.current.onSplitVertical
                    : command === 'terminal.close' ? actionRefs.current.onCloseTerminal
                    : command === 'terminal.clear' ? actionRefs.current.onClearTerminal
                    : command === 'terminal.restart' ? actionRefs.current.onRestartTerminal : null
                if (!action) return true
                event.preventDefault()
                action()
                return false
            })

            inputDisposable = terminal.onData((data) => {
                if (disposed || !host.isConnected) return
                void window.devscope.writePreviewTerminal({
                    sessionId: session.sessionId,
                    data,
                    workspaceCapability
                }).then((result) => {
                    if (!result.success) onError(result.error || 'Failed to write terminal input.')
                }).catch((error: unknown) => {
                    onError(error instanceof Error ? error.message : 'Failed to write terminal input.')
                })
            })
            titleDisposable = terminal.onTitleChange((title) => {
                const normalizedTitle = String(title || '').trim()
                if (!normalizedTitle) return
                void window.devscope.setPreviewTerminalTitle({
                    sessionId: session.sessionId,
                    title: normalizedTitle,
                    workspaceCapability
                }).catch(() => undefined)
            })

            resizeObserver = new ResizeObserver(syncSize)
            resizeObserver.observe(host)
            syncSize()
            // Runtime loading can finish after focus has moved to another pane or control.
            if (activeRef.current && visibleRef.current && host.contains(document.activeElement)) terminal.focus()
        }).catch((error: unknown) => {
            if (!disposed) onError(error instanceof Error ? error.message : 'Failed to load terminal runtime.')
        })

        const unsubscribe = window.devscope.onPreviewTerminalEvent((event) => {
            if (event.sessionId !== session.sessionId) return
            const terminal = terminalRef.current
            if (terminal) applyEvent(terminal, event)
            else {
                const queued = event.type === 'output' ? { ...event, data: String(event.data || '').slice(-60_000) } : event
                pendingEvents.push(queued)
                pendingChars += queued.type === 'output' ? String(queued.data || '').length : 0
                while (pendingEvents.length > 256 || pendingChars > 60_000) {
                    const removed = pendingEvents.shift()
                    if (removed?.type === 'output') pendingChars -= String(removed.data || '').length
                }
            }
        }, workspaceCapability)

        return () => {
            disposed = true
            for (const type of inputEvents) host.removeEventListener(type, guardInput, true)
            unsubscribe()
            window.cancelAnimationFrame(syncFrame)
            resizeObserver?.disconnect()
            inputDisposable?.dispose()
            titleDisposable?.dispose()
            if (terminalRef.current === mountedTerminal) terminalRef.current = null
            fitAddonRef.current = null
            mountedTerminal?.dispose()
        }
    }, [onError, session.sessionId, workspaceCapability])

    useEffect(() => {
        const terminal = terminalRef.current
        const fitAddon = fitAddonRef.current
        if (!terminal || !fitAddon || !visible) return
        const frame = window.requestAnimationFrame(() => {
            fitTerminalSafely(fitAddon)
            void window.devscope.resizePreviewTerminal({
                sessionId: session.sessionId,
                cols: terminal.cols,
                rows: terminal.rows,
                workspaceCapability
            }).catch(() => undefined)
        })
        return () => window.cancelAnimationFrame(frame)
    }, [session.sessionId, visible, workspaceCapability])

    useEffect(() => {
        if (!active || !visible) return
        const host = hostRef.current
        if (!host) return
        // Claim focus immediately, even when the terminal runtime is still loading.
        if (terminalRef.current) terminalRef.current.focus()
        else host.focus({ preventScroll: true })
    }, [active, focusRequestId, visible])

    useEffect(() => {
        if (!active || !visible) terminalRef.current?.blur()
    }, [active, visible])

    useEffect(() => {
        const terminal = terminalRef.current
        if (!terminal) return
        terminal.options.theme = theme
        terminal.refresh(0, Math.max(0, terminal.rows - 1))
    }, [theme])

    useEffect(() => {
        const terminal = terminalRef.current
        if (!terminal) return
        terminal.options.cursorBlink = cursorBlink
        terminal.options.fontFamily = fontFamily
        terminal.options.fontSize = fontSize
        terminal.options.scrollback = scrollback
        const fitAddon = fitAddonRef.current
        if (fitAddon && visible) fitTerminalSafely(fitAddon)
    }, [cursorBlink, fontFamily, fontSize, scrollback, visible])

    return (
        <div
            ref={hostRef}
            tabIndex={-1}
            className="h-full min-h-0 w-full overflow-hidden bg-[color-mix(in_srgb,var(--color-bg)_96%,black)]"
            onMouseDown={onActivate}
        />
    )
})
