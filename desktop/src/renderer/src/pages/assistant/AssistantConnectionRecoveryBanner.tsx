import { AlertTriangle, Loader2, RotateCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AssistantRecoveryIssue } from './assistant-runtime-recovery'

export function AssistantConnectionRecoveryBanner(props: {
    issue: AssistantRecoveryIssue
    reconnectPending: boolean
    reconnectAttempt: number
    reconnectMaxAttempts: number
    reconnectExhausted: boolean
    onReconnect: () => void
}) {
    const attemptLabel = props.reconnectAttempt > 1
        ? `${props.reconnectAttempt}/${props.reconnectMaxAttempts}`
        : (props.reconnectExhausted ? 'Stopped' : null)

    return (
        <div className="px-4 pb-2 pt-2">
            <div className="mx-auto flex w-full max-w-3xl items-center gap-3 border border-amber-400/15 bg-amber-500/[0.06] px-3 py-2.5 shadow-[0_12px_30px_rgba(0,0,0,0.18)]">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-amber-400/20 bg-amber-500/[0.08] text-amber-200">
                    <AlertTriangle size={15} />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="truncate text-[12px] font-semibold text-sparkle-text">{props.issue.title}</span>
                        {attemptLabel ? (
                            <span className="inline-flex shrink-0 items-center border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-sparkle-text-secondary">
                                {attemptLabel}
                            </span>
                        ) : null}
                    </div>
                    <div className="truncate pt-0.5 text-[11px] text-sparkle-text-secondary">
                        {props.issue.brief}
                    </div>
                </div>
                <button
                    type="button"
                    onClick={props.onReconnect}
                    disabled={props.reconnectPending}
                    className={cn(
                        'inline-flex h-8 shrink-0 items-center gap-1.5 border px-2.5 text-[11px] font-semibold text-sparkle-text transition-colors',
                        props.reconnectPending
                            ? 'cursor-not-allowed border-white/10 bg-white/[0.04] text-sparkle-text-secondary'
                            : 'border-white/10 bg-white/[0.03] hover:border-white/15 hover:bg-white/[0.05]'
                    )}
                >
                    {props.reconnectPending ? <Loader2 size={13} className="animate-spin" /> : <RotateCw size={13} />}
                    <span>{props.reconnectPending ? 'Retrying' : 'Reconnect'}</span>
                </button>
            </div>
        </div>
    )
}
