import { LoaderCircle, Monitor, RefreshCw } from 'lucide-react'
import type { ControlWindowCandidate } from '@shared/agent-control/contracts'

export function AssistantWindowsTargetPicker({ windows, busy, error, onRefresh, onSelect }: {
    windows: ControlWindowCandidate[]
    busy: boolean
    error: string | null
    onRefresh: () => void
    onSelect: (windowToken: string) => void
}) {
    return (
        <section className="p-2.5">
            <div className="mb-2 flex items-center justify-between">
                <span className="text-[8px] font-semibold uppercase tracking-[0.12em] text-sparkle-text-muted/50">Visible ordinary app windows</span>
                <button type="button" onClick={onRefresh} disabled={busy} className="inline-flex size-6 items-center justify-center border border-white/[0.07]"><RefreshCw size={10} className={busy ? 'animate-spin' : ''} /></button>
            </div>
            {error ? <p className="mb-2 border border-red-400/15 bg-red-500/[0.05] p-2 text-[9px] text-red-200/80">{error}</p> : null}
            {busy && windows.length === 0 ? <LoaderCircle size={14} className="mx-auto mt-6 animate-spin" /> : (
                <div className="space-y-1.5">
                    {windows.map((window) => (
                        <button key={window.windowToken} type="button" disabled={window.blocked || busy} onClick={() => onSelect(window.windowToken)} className="flex w-full items-start gap-2 border border-white/[0.07] bg-white/[0.02] p-2 text-left hover:bg-white/[0.04] disabled:opacity-45">
                            <Monitor size={12} className="mt-0.5 shrink-0" />
                            <span className="min-w-0 flex-1"><span className="block truncate text-[9px] text-sparkle-text-secondary">{window.title}</span><span className="block truncate text-[8px] text-sparkle-text-muted/55">{window.applicationName} · PID {window.processId}</span>{window.blockedReason ? <span className="mt-1 block text-[8px] text-amber-200/70">{window.blockedReason}</span> : null}</span>
                        </button>
                    ))}
                    {!busy && windows.length === 0 ? <p className="text-[9px] text-sparkle-text-muted/55">Refresh to choose a visible application window.</p> : null}
                </div>
            )}
        </section>
    )
}
