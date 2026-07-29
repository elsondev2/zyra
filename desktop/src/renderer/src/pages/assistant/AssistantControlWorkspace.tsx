import { useCallback, useEffect, useState } from 'react'
import { LoaderCircle, ShieldCheck } from 'lucide-react'
import type { ControlCapability, ControlStateSnapshot, ControlWindowCandidate } from '@shared/agent-control/contracts'
import { cn } from '@/lib/utils'
import { AssistantChromePairing } from './AssistantChromePairing'
import { AssistantControlAudit } from './AssistantControlAudit'
import { AssistantControlEmergencyStop } from './AssistantControlEmergencyStop'
import { AssistantControlGrantDialog } from './AssistantControlGrantDialog'
import { AssistantControlTargets } from './AssistantControlTargets'
import { AssistantWindowsTargetPicker } from './AssistantWindowsTargetPicker'
import {
    clearBrowserControlApprovalPreferences,
    onBrowserControlApprovalPreferencesChange,
    readBrowserControlApprovalPreferences
} from './assistant-control-approval-preferences'

type Mode = 'targets' | 'grants' | 'audit' | 'pairing'
const MODES: Array<{ id: Mode; label: string }> = [
    { id: 'targets', label: 'Targets' }, { id: 'grants', label: 'Grants' }, { id: 'audit', label: 'Audit' }, { id: 'pairing', label: 'Pairing' }
]

export function AssistantControlWorkspace({ active }: { active: boolean }) {
    const [mode, setMode] = useState<Mode>('targets')
    const [state, setState] = useState<ControlStateSnapshot | null>(null)
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [windows, setWindows] = useState<ControlWindowCandidate[]>([])
    const [rememberedSiteCount, setRememberedSiteCount] = useState(() => readBrowserControlApprovalPreferences().length)

    const refresh = useCallback(async () => {
        const result = await window.devscope.agentControl.getState()
        if (!result.success) throw new Error(result.error)
        setState(result.state)
    }, [])

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        void refresh().catch((caught) => {
            if (!cancelled) setError(caught instanceof Error ? caught.message : 'Control Center is unavailable.')
        }).finally(() => { if (!cancelled) setLoading(false) })
        const unsubscribe = window.devscope.agentControl.onStateChange((next) => { if (!cancelled) setState(next) })
        return () => { cancelled = true; unsubscribe() }
    }, [refresh])

    const run = useCallback(async (operation: () => Promise<unknown>) => {
        setBusy(true)
        setError(null)
        try { await operation(); await refresh() }
        catch (caught) { setError(caught instanceof Error ? caught.message : 'Control operation failed.') }
        finally { setBusy(false) }
    }, [refresh])

    useEffect(() => onBrowserControlApprovalPreferencesChange(() => {
        setRememberedSiteCount(readBrowserControlApprovalPreferences().length)
    }), [])

    const refreshWindows = useCallback(() => run(async () => {
        const result = await window.devscope.agentControl.listWindows()
        if (!result.success) throw new Error(result.error)
        setWindows(result.windows)
    }), [run])

    if (loading || !state) return <div className="flex min-h-0 flex-1 items-center justify-center"><LoaderCircle size={16} className="animate-spin" /></div>
    const pending = state.pendingGrants[0]
    return (
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden" aria-label="Agent Control Center">
            <header className="flex h-9 shrink-0 items-center gap-1 border-b border-white/[0.07] px-2">
                <ShieldCheck size={12} className={state.active ? 'text-emerald-300' : 'text-sparkle-text-muted/50'} />
                <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-sparkle-text-secondary">Control Center</span>
                {rememberedSiteCount > 0 ? (
                    <button type="button" onClick={() => clearBrowserControlApprovalPreferences()} className="h-5 border border-white/[0.07] px-1.5 text-[8px] text-sparkle-text-muted hover:bg-white/[0.04] hover:text-sparkle-text-secondary" title="Clear sites remembered with Don’t ask again">
                        Forget sites · {rememberedSiteCount}
                    </button>
                ) : null}
                <AssistantControlEmergencyStop active={state.active || state.pairing.state !== 'stopped'} onStop={() => void run(async () => {
                    const result = await window.devscope.agentControl.emergencyStop()
                    if (!result.success) throw new Error(result.error)
                })} />
            </header>
            <nav className="flex h-8 shrink-0 border-b border-white/[0.06] px-1" aria-label="Control Center modes">
                {MODES.map((entry) => <button key={entry.id} type="button" onClick={() => setMode(entry.id)} className={cn('flex-1 border-b text-[9px]', mode === entry.id ? 'border-[var(--accent-primary)] text-sparkle-text-secondary' : 'border-transparent text-sparkle-text-muted/55')}>{entry.label}</button>)}
            </nav>
            {error ? <div className="shrink-0 border-b border-red-400/15 bg-red-500/[0.05] px-2 py-1.5 text-[9px] text-red-200/80">{error}</div> : null}
            {pending ? <AssistantControlGrantDialog request={pending} onReject={() => void run(async () => {
                const result = await window.devscope.agentControl.rejectGrant(pending.requestId)
                if (!result.success) throw new Error(result.error)
            })} onApprove={(capabilities: ControlCapability[], durationMs, maxActions) => void run(async () => {
                const result = await window.devscope.agentControl.approveGrant({
                    pendingRequestId: pending.requestId,
                    targetId: pending.targetId,
                    capabilities,
                    durationMs,
                    maxActions,
                    allowedOrigins: pending.allowedOrigins,
                    allowedExecutableIdentities: pending.allowedExecutableIdentities
                })
                if (!result.success) throw new Error(result.error)
            })} /> : null}
            <div className="min-h-0 flex-1 overflow-y-auto">
                {mode === 'targets' ? <><AssistantControlTargets targets={state.targets} grants={state.grants} onRevoke={(grantId) => void run(async () => {
                    const result = await window.devscope.agentControl.revokeGrant(grantId)
                    if (!result.success) throw new Error(result.error)
                })} /><AssistantWindowsTargetPicker windows={windows} busy={busy} error={error} onRefresh={() => void refreshWindows()} onSelect={(windowToken) => void run(async () => {
                    const result = await window.devscope.agentControl.selectWindow(windowToken)
                    if (!result.success) throw new Error(result.error)
                })} /></> : null}
                {mode === 'grants' ? <AssistantControlTargets targets={state.targets.filter((target) => state.grants.some((grant) => grant.targetId === target.targetId))} grants={state.grants} onRevoke={(grantId) => void run(async () => {
                    const result = await window.devscope.agentControl.revokeGrant(grantId)
                    if (!result.success) throw new Error(result.error)
                })} /> : null}
                {mode === 'audit' ? <AssistantControlAudit events={state.audit} onClear={() => void run(async () => {
                    const result = await window.devscope.agentControl.clearAudit()
                    if (!result.success) throw new Error(result.error)
                })} /> : null}
                {mode === 'pairing' ? <AssistantChromePairing pairing={state.pairing} busy={busy} onStart={() => void run(async () => {
                    const result = await window.devscope.agentControl.startChromePairing()
                    if (!result.success) throw new Error(result.error)
                })} onStop={() => void run(async () => {
                    const result = await window.devscope.agentControl.stopChromePairing()
                    if (!result.success) throw new Error(result.error)
                })} /> : null}
            </div>
            {!active ? <span className="sr-only">Control Center retained while inactive</span> : null}
        </section>
    )
}
