import type { RefObject } from 'react'
import { cn } from '@/lib/utils'
import { PYTHON_OUTPUT_MIN_HEIGHT, type PythonOutputEntry } from './modalShared'

type PreviewPythonOutputPanelProps = {
    fileName: string
    visible: boolean
    runState: 'idle' | 'running' | 'success' | 'failed' | 'stopped'
    interpreter: string
    command: string
    entries: PythonOutputEntry[]
    height: number
    showTimestamps: boolean
    scrollRef: RefObject<HTMLDivElement | null>
    onResizeStart: (event: { preventDefault: () => void; clientY: number }) => void
    onToggleTimestamps: () => void
    onClear: () => void
}

export function PreviewPythonOutputPanel({
    fileName,
    visible,
    runState,
    interpreter,
    command,
    entries,
    height,
    showTimestamps,
    scrollRef,
    onResizeStart,
    onToggleTimestamps,
    onClear
}: PreviewPythonOutputPanelProps) {
    if (!visible) return null

    const statusClass = (
        runState === 'success'
            ? 'text-emerald-300'
            : runState === 'failed'
                ? 'text-red-300'
                : runState === 'stopped'
                    ? 'text-amber-300'
                    : runState === 'running'
                        ? 'text-sky-300'
                        : 'text-sparkle-text-secondary'
    )

    return (
        <div className="border-t border-sparkle-border bg-sparkle-card/85 backdrop-blur-sm flex flex-col" style={{ height: `${Math.max(PYTHON_OUTPUT_MIN_HEIGHT, height)}px` }}>
            <div onMouseDown={onResizeStart} className="group relative h-2 cursor-row-resize bg-transparent hover:bg-[var(--accent-primary)]/12 transition-colors" title="Resize output">
                <div className="pointer-events-none absolute left-1/2 top-1/2 h-[2px] w-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sparkle-border-secondary/70 group-hover:bg-[var(--accent-primary)]/65 transition-colors" />
            </div>
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-sparkle-border-secondary">
                <div className="min-w-0">
                    <div className={cn('text-xs font-medium', statusClass)}>Python Run: {runState}</div>
                    {(interpreter || command) && (
                        <div className="text-[10px] text-sparkle-text-muted truncate">
                            {interpreter ? `${interpreter} | ` : ''}{command || fileName}
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-1.5">
                    <button type="button" onClick={onToggleTimestamps} className={cn('rounded-md border px-2 py-1 text-[10px] transition-colors', showTimestamps ? 'border-sky-400/45 bg-sky-500/12 text-sky-200' : 'border-sparkle-border text-sparkle-text-secondary hover:bg-sparkle-card-hover hover:text-sparkle-text')} title="Toggle timestamps">Time</button>
                    <button type="button" onClick={onClear} className="rounded-md border border-sparkle-border px-2 py-1 text-[10px] text-sparkle-text-secondary hover:bg-sparkle-card-hover hover:text-sparkle-text transition-colors">Clear</button>
                </div>
            </div>
            <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto custom-scrollbar px-3 py-2 text-[11px] leading-relaxed whitespace-pre-wrap break-words font-mono">
                {entries.length === 0 ? (
                    <span className="text-sparkle-text-muted">[No output yet]</span>
                ) : (
                    <div className="space-y-1">
                        {entries.map((entry) => (
                            <div key={entry.id} className={cn(entry.source === 'stderr' ? 'text-red-300' : entry.source === 'system' ? 'text-sky-300' : 'text-sparkle-text-secondary')}>
                                {showTimestamps && <span className="text-[10px] text-sparkle-text-muted mr-2">[{new Date(entry.at).toLocaleTimeString()}]</span>}
                                <span>{entry.text}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
