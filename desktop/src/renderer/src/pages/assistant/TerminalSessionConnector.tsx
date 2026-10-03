import type { DevScopePreviewTerminalSessionSummary } from '@shared/contracts/devscope-api'
import { cn } from '@/lib/utils'

export function TerminalSessionConnector({ index, count, status }: {
    index: number
    count: number
    status: DevScopePreviewTerminalSessionSummary['status']
}) {
    const statusClass = status === 'running' ? 'bg-emerald-300' : status === 'error' ? 'bg-red-300' : 'bg-amber-300'
    return <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-[9px] w-3">
        {count > 1 && index > 0 ? <span data-terminal-connector className="absolute left-0 top-0 h-[14px] w-px bg-white/25" /> : null}
        {count > 1 && index < count - 1 ? <span data-terminal-connector className="absolute bottom-0 left-0 top-[14px] w-px bg-white/25" /> : null}
        <span data-terminal-status-dash className={cn('absolute left-0 top-[14px] z-10 h-px w-3 -translate-y-1/2', statusClass)} title={status} />
    </span>
}
