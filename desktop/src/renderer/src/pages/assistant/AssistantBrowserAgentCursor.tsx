import { memo } from 'react'
import { MousePointer2 } from 'lucide-react'
import type { ControlCursorState } from '@shared/agent-control/contracts'
import { cn } from '@/lib/utils'

function cursorLabel(cursor: ControlCursorState): string {
    if (cursor.principal?.type === 'agent') return 'Agent'
    return 'Zyra'
}

export const AssistantBrowserAgentCursor = memo(function AssistantBrowserAgentCursor({ cursor }: {
    cursor: ControlCursorState | null
}) {
    if (!cursor?.visible) return null
    const durationMs = Math.max(0, Math.min(2_000, Number(cursor.durationMs) || 0))
    const active = cursor.phase !== 'idle'
    return (
        <div className="pointer-events-none absolute inset-0 z-[26] overflow-hidden" aria-label={`${cursorLabel(cursor)} Browser cursor`}>
            <div
                className="absolute left-0 top-0 will-change-transform motion-reduce:transition-none"
                style={{
                    transform: `translate3d(${cursor.x}px, ${cursor.y}px, 0)`,
                    transitionProperty: 'transform',
                    transitionDuration: `${durationMs}ms`,
                    transitionTimingFunction: cursor.phase === 'dragging' ? 'linear' : 'cubic-bezier(0.22, 1, 0.36, 1)'
                }}
            >
                <span className={cn(
                    'absolute -left-2.5 -top-2.5 size-5 rounded-full border transition-all motion-reduce:transition-none',
                    active ? 'scale-100 border-cyan-200/55 bg-cyan-300/20' : 'scale-75 border-cyan-200/20 bg-cyan-300/5',
                    cursor.phase === 'pressing' && 'scale-125 bg-cyan-200/30'
                )} />
                <MousePointer2 size={19} strokeWidth={2.2} className="relative -translate-x-[2px] -translate-y-[2px] fill-cyan-300 text-slate-950 drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)]" />
                <span className="absolute left-3 top-3 whitespace-nowrap rounded-sm border border-cyan-200/25 bg-slate-950/90 px-1 py-0.5 text-[7px] font-semibold uppercase tracking-[0.08em] text-cyan-100 shadow-md shadow-black/35">
                    {cursorLabel(cursor)}{active ? ` · ${cursor.phase}` : ''}
                </span>
            </div>
        </div>
    )
})
