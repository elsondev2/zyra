import type { RefObject } from 'react'
import { Eraser, Square, Trash2, X } from 'lucide-react'
import type { Shell } from '@/lib/settings'
import { cn } from '@/lib/utils'
import { PREVIEW_TERMINAL_MIN_HEIGHT, TERMINAL_PANEL_ANIMATION_MS, type PreviewTerminalSessionItem, type PreviewTerminalState, type TerminalPanelPhase } from './modalShared'
import { PreviewTerminalNewMenu } from './PreviewTerminalNewMenu'

type PreviewTerminalPanelProps = {
    render: boolean
    phase: TerminalPanelPhase
    height: number
    state: PreviewTerminalState
    shellLabel: string
    sessions: PreviewTerminalSessionItem[]
    groupKey: string
    currentSession: PreviewTerminalSessionItem | null
    themeBackground: string
    hostRef: RefObject<HTMLDivElement | null>
    onHostInteract: () => void
    error: string | null
    onResizeStart: (event: { preventDefault: () => void; clientY: number }) => void
    newShell: Shell
    onNewShellChange: (shell: Shell) => void
    onNew: (shell: Shell) => void
    onClear: () => void
    onStop: (sessionId?: string) => void
    onMinimize: () => void
    onSelect: (sessionId: string) => void
}

export function PreviewTerminalPanel({
    render,
    phase,
    height,
    state,
    shellLabel,
    sessions,
    groupKey,
    currentSession,
    themeBackground,
    hostRef,
    onHostInteract,
    error,
    onResizeStart,
    newShell,
    onNewShellChange,
    onNew,
    onClear,
    onStop,
    onMinimize,
    onSelect
}: PreviewTerminalPanelProps) {
    if (!render) return null

    const statusDotClass = (
        state === 'active'
            ? 'bg-emerald-300'
            : state === 'connecting'
                ? 'bg-sky-300'
                : state === 'error'
                    ? 'bg-red-300'
                    : state === 'exited'
                        ? 'bg-amber-300'
                        : 'bg-sparkle-text-secondary'
    )

    return (
        <div
            className={cn(
                'flex w-full flex-col overflow-hidden rounded-none border border-white/[0.08] bg-sparkle-card/97 shadow-none backdrop-blur-xl transition-[opacity,transform,border-color,background-color] ease-[cubic-bezier(0.16,1,0.3,1)]',
                phase === 'visible'
                    ? 'translate-y-0 opacity-100'
                    : 'pointer-events-none translate-y-2 opacity-0'
            )}
            style={{
                height: `${Math.max(PREVIEW_TERMINAL_MIN_HEIGHT, height)}px`,
                transitionDuration: `${TERMINAL_PANEL_ANIMATION_MS}ms`
            }}
        >
            <div onMouseDown={onResizeStart} className="group relative h-1.5 cursor-row-resize bg-transparent hover:bg-[var(--accent-primary)]/12 transition-colors" title="Resize terminal">
                <div className="pointer-events-none absolute left-1/2 top-1/2 h-[2px] w-12 -translate-x-1/2 -translate-y-1/2 bg-sparkle-border-secondary/70 group-hover:bg-[var(--accent-primary)]/65 transition-colors" />
            </div>
            <div className="flex min-h-[32px] items-center justify-between gap-1.5 border-b border-sparkle-border-secondary px-2 py-1">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 text-[11px] font-medium leading-none text-sparkle-text">
                        <span className={cn('inline-block h-2 w-2 rounded-full', statusDotClass)} />
                        <span>Terminal</span>
                        <span className="rounded-none border border-sparkle-border bg-sparkle-bg/60 px-1.5 py-0 text-[8px] uppercase tracking-[0.16em] text-sparkle-text-muted">{shellLabel}</span>
                        <span className="rounded-none border border-sparkle-border bg-sparkle-bg/60 px-1.5 py-0 text-[8px] uppercase tracking-[0.16em] text-sparkle-text-muted">{sessions.length} session{sessions.length === 1 ? '' : 's'}</span>
                        {groupKey && <span className="rounded-none border border-sparkle-border bg-sparkle-bg/60 px-1.5 py-0 text-[8px] uppercase tracking-[0.16em] text-sparkle-text-muted">linked</span>}
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-1 rounded-none border border-white/[0.07] bg-black/10 p-[2px]">
                    <PreviewTerminalNewMenu value={newShell} onChange={onNewShellChange} onCreate={onNew} />
                    <button
                        type="button"
                        onClick={onClear}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-none text-sparkle-text-secondary transition-colors hover:bg-white/[0.05] hover:text-sparkle-text"
                        title="Clear output. Keeps the shell running."
                        aria-label="Clear output. Keeps the shell running."
                    >
                        <Eraser size={12} />
                    </button>
                    <button
                        type="button"
                        onClick={() => onStop()}
                        disabled={!currentSession}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-none text-red-300 transition-colors hover:bg-red-500/10 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-40"
                        title="Stop session. Ends the current shell."
                        aria-label="Stop session. Ends the current shell."
                    >
                        <Square size={12} />
                    </button>
                    <button
                        type="button"
                        onClick={onMinimize}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-none text-sparkle-text-secondary transition-colors hover:bg-white/[0.05] hover:text-sparkle-text"
                        title="Hide terminal panel"
                        aria-label="Hide terminal panel"
                    >
                        <X size={12} />
                    </button>
                </div>
            </div>
            <div
                className={cn(
                    'flex min-h-0 flex-1 transition-[opacity,transform] ease-[cubic-bezier(0.16,1,0.3,1)]',
                    phase === 'visible' ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
                )}
                style={{ transitionDuration: `${TERMINAL_PANEL_ANIMATION_MS}ms` }}
            >
                <div className="min-w-0 flex-1 border-r border-sparkle-border-secondary bg-sparkle-bg/45">
                    <div className="h-full min-h-0">
                        {currentSession ? (
                            <div onMouseDownCapture={onHostInteract} ref={hostRef} className="h-full min-h-0 w-full overflow-hidden rounded-none focus-within:shadow-[inset_0_0_0_1px_rgba(56,189,248,0.35)]" style={{ backgroundColor: themeBackground }} />
                        ) : (
                            <div className="flex h-full w-full items-center justify-center bg-black/15 px-6 text-center">
                                <div className="max-w-sm space-y-2">
                                    <div className="text-sm font-medium text-sparkle-text">{sessions.length > 0 ? 'Select a session' : 'No terminal yet'}</div>
                                    <div className="flex items-center justify-center gap-2">
                                        <button type="button" onClick={() => onNew(newShell)} className="rounded-none border border-sky-400/30 bg-sky-500/10 px-3 py-1.5 text-[11px] font-medium text-sky-200 transition-colors hover:bg-sky-500/15">{newShell === 'cmd' ? 'New CMD' : 'New PowerShell'}</button>
                                        {sessions.length > 0 && <button type="button" onClick={() => onSelect(sessions[0]?.sessionId || '')} className="rounded-none border border-sparkle-border px-3 py-1.5 text-[11px] font-medium text-sparkle-text-secondary transition-colors hover:bg-sparkle-card-hover hover:text-sparkle-text">First Session</button>}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                <aside className="flex w-[220px] shrink-0 flex-col bg-sparkle-bg/55">
                    <div className="flex-1 min-h-0 overflow-auto custom-scrollbar p-2 space-y-1">
                        {sessions.length === 0 ? (
                            <div className="border border-dashed border-sparkle-border-secondary px-3 py-4 text-center text-[11px] text-sparkle-text-muted">No sessions</div>
                        ) : sessions.map((session) => {
                            const isActive = session.sessionId === currentSession?.sessionId
                            return (
                                <div key={session.sessionId} className={cn('flex items-center gap-1 border px-2 py-1.5 transition-colors', isActive ? 'border-sky-400/35 bg-sky-500/12' : 'border-sparkle-border bg-sparkle-card/60 hover:border-sparkle-border-secondary hover:bg-sparkle-card-hover/60')}>
                                    <button type="button" onClick={() => onSelect(session.sessionId)} className="min-w-0 flex-1 truncate text-left text-[11px] font-medium text-sparkle-text">
                                        {session.title}
                                    </button>
                                    <button type="button" onClick={() => onStop(session.sessionId)} className="rounded-none p-1 text-red-300 transition-colors hover:bg-red-500/10 hover:text-red-200" title="Stop session" aria-label={`Stop ${session.title}`}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            )
                        })}
                    </div>
                </aside>
            </div>
            {error && <div className="px-3 pb-2 text-[10px] text-red-300 truncate">{error}</div>}
        </div>
    )
}
