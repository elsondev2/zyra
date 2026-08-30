import { useCallback, useEffect, useState } from 'react'
import { Check, ChevronDown, Globe2, LoaderCircle, Monitor, ShieldCheck, X } from 'lucide-react'
import type {
    ControlCapability,
    ControlPendingGrant,
    ControlStateSnapshot,
    ControlTarget,
    ControlWindowCandidate
} from '@shared/agent-control/contracts'
import { cn } from '@/lib/utils'
import {
    clearBrowserControlApprovalPreferences,
    onBrowserControlApprovalPreferencesChange,
    readBrowserControlApprovalPreferences
} from './assistant-control-approval-preferences'
import type { AssistantThreadControlSummary } from './assistant-thread-details'

function controlTargetLabel(target: ControlTarget | undefined): string {
    if (!target) return 'Computer surface'
    if (target.kind === 'zyra-browser') {
        if (target.title?.trim()) return target.title.trim()
        if (target.origin) {
            try { return new URL(target.origin).hostname.replace(/^www\./, '') }
            catch { return target.origin }
        }
        return 'Zyra Browser'
    }
    if (target.kind === 'chrome-tab') {
        if (target.origin) {
            try { return `Chrome · ${new URL(target.origin).hostname.replace(/^www\./, '')}` }
            catch { return `Chrome · ${target.origin}` }
        }
        return 'Chrome tab'
    }
    return target.executableIdentity.split(/[\\/]/).at(-1) || 'Windows app'
}

function controlCapabilitySummary(capabilities: readonly ControlCapability[]): string {
    const actions: string[] = []
    if (capabilities.some((entry) => entry.startsWith('observe.'))) actions.push('view the page')
    if (capabilities.some((entry) => entry.startsWith('pointer.'))) actions.push('click')
    if (capabilities.some((entry) => entry.startsWith('keyboard.')) || capabilities.includes('form.select')) actions.push('type')
    if (capabilities.includes('navigate')) actions.push('navigate')
    if (capabilities.includes('scroll')) actions.push('scroll')
    if (capabilities.includes('tab.manage')) actions.push('manage tabs')
    return actions.length > 0 ? new Intl.ListFormat(undefined, { style: 'long', type: 'conjunction' }).format(actions) : 'use this surface'
}

function formatClock(value: string | null | undefined): string {
    if (!value) return ''
    const timestamp = Date.parse(value)
    if (!Number.isFinite(timestamp)) return ''
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(timestamp))
}

export function AssistantThreadDetailsComputerUse({
    controlState,
    threadControl,
    className
}: {
    controlState: ControlStateSnapshot | null
    threadControl: AssistantThreadControlSummary
    className?: string
}) {
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [advancedOpen, setAdvancedOpen] = useState(false)
    const [windows, setWindows] = useState<ControlWindowCandidate[]>([])
    const [rememberedSiteCount, setRememberedSiteCount] = useState(() => readBrowserControlApprovalPreferences().length)
    const pendingGrant = threadControl.pendingGrants[0] || null
    const targetById = new Map(threadControl.targets.map((target) => [target.targetId, target]))

    useEffect(() => onBrowserControlApprovalPreferencesChange(() => {
        setRememberedSiteCount(readBrowserControlApprovalPreferences().length)
    }), [])

    const run = useCallback(async (operation: () => Promise<{ success: boolean; error?: string } | unknown>) => {
        setBusy(true)
        setError(null)
        try {
            const result = await operation()
            const actionResult = result && typeof result === 'object'
                ? result as { success?: boolean; error?: unknown }
                : null
            if (actionResult?.success === false) {
                throw new Error(typeof actionResult.error === 'string' ? actionResult.error : 'The action could not be completed.')
            }
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'The action could not be completed.')
        } finally {
            setBusy(false)
        }
    }, [])

    const refreshWindows = useCallback(() => run(async () => {
        const result = await window.devscope.agentControl.listWindows()
        if (result.success) setWindows(result.windows)
        return result
    }), [run])

    const approveGrant = useCallback((request: ControlPendingGrant) => run(() => (
        window.devscope.agentControl.approveGrant({
            pendingRequestId: request.requestId,
            targetId: request.targetId,
            capabilities: request.capabilities,
            durationMs: Math.max(1_000, Date.parse(request.expiresAt) - Date.now()),
            maxActions: request.maxActions,
            allowedOrigins: request.allowedOrigins,
            allowedExecutableIdentities: request.allowedExecutableIdentities
        })
    )), [run])

    return (
        <section className={cn('border-t border-white/[0.06]', className || 'mt-5 pt-4')} aria-labelledby="thread-control-heading">
            <div className="flex items-center justify-between gap-3">
                <h3 id="thread-control-heading" className="text-[10px] font-semibold text-sparkle-text-secondary">Computer use</h3>
                <span className={cn(
                    'inline-flex items-center gap-1.5 text-[8px] font-medium',
                    pendingGrant ? 'text-amber-200/75' : threadControl.activeGrants.length > 0 ? 'text-emerald-200/70' : 'text-sparkle-text-muted/40'
                )}>
                    <span className={cn('size-1 rounded-full', pendingGrant ? 'bg-amber-300' : threadControl.activeGrants.length > 0 ? 'bg-emerald-300' : 'bg-white/20')} />
                    {pendingGrant ? 'Review' : threadControl.activeGrants.length > 0 ? 'Active' : 'Idle'}
                </span>
            </div>

            {pendingGrant ? (
                <ControlRequest
                    request={pendingGrant}
                    target={targetById.get(pendingGrant.targetId)}
                    busy={busy}
                    onApprove={() => void approveGrant(pendingGrant)}
                    onReject={() => void run(() => window.devscope.agentControl.rejectGrant(pendingGrant.requestId))}
                />
            ) : null}

            {threadControl.activeGrants.length > 0 ? (
                <div className="mt-3 divide-y divide-white/[0.05] border-y border-white/[0.055]">
                    {threadControl.activeGrants.map((grant) => {
                        const target = targetById.get(grant.targetId)
                        return (
                            <div key={grant.grantId} className="flex items-center gap-2.5 py-2.5">
                                {target?.kind === 'windows-window' ? <Monitor size={12} className="text-sparkle-text-muted/55" /> : <Globe2 size={12} className="text-sparkle-text-muted/55" />}
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-[10px] font-medium text-sparkle-text-secondary">{controlTargetLabel(target)}</p>
                                    <p className="mt-0.5 text-[8px] text-sparkle-text-muted/45">{Math.max(0, grant.maxActions - grant.actionCount)} actions left · until {formatClock(grant.expiresAt)}</p>
                                </div>
                                <button type="button" onClick={() => void run(() => window.devscope.agentControl.revokeGrant(grant.grantId))} className="text-[8px] font-medium text-sparkle-text-muted/55 hover:text-red-200">Stop</button>
                            </div>
                        )
                    })}
                </div>
            ) : !pendingGrant ? (
                <div className="mt-2.5 flex min-w-0 items-center gap-2.5 border-y border-white/[0.05] py-2.5">
                    <ShieldCheck size={12} className="shrink-0 text-sparkle-text-muted/45" />
                    <div className="min-w-0 flex-1">
                        <p className="text-[9px] font-medium text-sparkle-text-secondary/80">No active access</p>
                        {threadControl.latestEvent ? (
                            <p className="mt-0.5 truncate text-[8px] text-sparkle-text-muted/35">
                                Last {threadControl.latestEvent.actionType || threadControl.latestEvent.eventType.replace(/[.-]/g, ' ')} · {threadControl.latestEvent.outcome} · {formatClock(threadControl.latestEvent.occurredAt)}
                            </p>
                        ) : <p className="mt-0.5 text-[8px] text-sparkle-text-muted/35">This thread has no computer-control grant.</p>}
                    </div>
                </div>
            ) : null}

            {threadControl.activeGrants.length > 0 && threadControl.latestEvent ? (
                <p className="mt-2 truncate text-[8px] text-sparkle-text-muted/35">Last {threadControl.latestEvent.actionType || threadControl.latestEvent.eventType.replace(/[.-]/g, ' ')} · {threadControl.latestEvent.outcome} · {formatClock(threadControl.latestEvent.occurredAt)}</p>
            ) : null}

            <button
                type="button"
                onClick={() => setAdvancedOpen((current) => !current)}
                className="mt-1.5 flex w-full items-center justify-between border-b border-white/[0.045] py-2 text-[8px] font-medium text-sparkle-text-muted/45 hover:text-sparkle-text-secondary"
                aria-expanded={advancedOpen}
            >
                <span>Setup</span>
                <ChevronDown size={10} className={cn('transition-transform', advancedOpen && 'rotate-180')} />
            </button>
            {advancedOpen ? (
                <div className="mt-3 space-y-3 border-l border-white/[0.06] pl-3">
                    <div className="flex flex-wrap gap-1.5">
                        <button type="button" disabled={busy || controlState?.pairing.state === 'waiting'} onClick={() => void run(() => window.devscope.agentControl.startChromePairing())} className="h-7 border border-white/[0.07] px-2 text-[8px] text-sparkle-text-muted hover:bg-white/[0.03] disabled:opacity-40">Pair Chrome</button>
                        <button type="button" disabled={busy} onClick={() => void refreshWindows()} className="h-7 border border-white/[0.07] px-2 text-[8px] text-sparkle-text-muted hover:bg-white/[0.03] disabled:opacity-40">Choose window</button>
                        {rememberedSiteCount > 0 ? <button type="button" onClick={() => clearBrowserControlApprovalPreferences()} className="h-7 border border-white/[0.07] px-2 text-[8px] text-sparkle-text-muted hover:bg-white/[0.03]">Forget sites · {rememberedSiteCount}</button> : null}
                        {controlState?.active ? <button type="button" onClick={() => void run(() => window.devscope.agentControl.emergencyStop())} className="h-7 border border-red-400/15 px-2 text-[8px] text-red-200/65 hover:bg-red-400/[0.05]">Stop all computer use</button> : null}
                    </div>
                    {controlState?.pairing.state === 'waiting' ? <p className="font-mono text-[10px] text-sparkle-text-secondary">Chrome code {controlState.pairing.code} · port {controlState.pairing.port}</p> : null}
                    {windows.length > 0 ? (
                        <div className="divide-y divide-white/[0.045] border-y border-white/[0.055]">
                            {windows.map((candidate) => (
                                <button key={candidate.windowToken} type="button" disabled={candidate.blocked || busy} onClick={() => void run(() => window.devscope.agentControl.selectWindow(candidate.windowToken))} className="flex w-full items-center gap-2 py-2 text-left disabled:opacity-40">
                                    <Monitor size={11} className="text-sparkle-text-muted/45" />
                                    <span className="min-w-0 flex-1 truncate text-[9px] text-sparkle-text-secondary">{candidate.title || candidate.applicationName}</span>
                                    <span className="text-[8px] text-sparkle-text-muted/40">Select</span>
                                </button>
                            ))}
                        </div>
                    ) : null}
                </div>
            ) : null}
            {error ? <p className="mt-2 text-[8px] leading-3.5 text-red-200/65">{error}</p> : null}
        </section>
    )
}

function ControlRequest({ request, target, busy, onApprove, onReject }: {
    request: ControlPendingGrant
    target: ControlTarget | undefined
    busy: boolean
    onApprove: () => void
    onReject: () => void
}) {
    return (
        <div className="mt-3 border-y border-amber-300/10 bg-amber-400/[0.025] py-3" aria-label="Computer-use approval needed">
            <div className="flex items-start gap-2.5">
                <ShieldCheck size={12} className="mt-0.5 text-amber-200/70" />
                <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-medium text-sparkle-text-secondary">Allow {controlTargetLabel(target)}?</p>
                    <p className="mt-1 text-[9px] leading-4 text-sparkle-text-muted/55">
                        {request.principal.type === 'agent' ? 'A child agent' : 'This thread'} wants to {controlCapabilitySummary(request.capabilities)}. Access expires automatically.
                    </p>
                </div>
            </div>
            <div className="mt-2.5 flex justify-end gap-1.5">
                <button type="button" disabled={busy} onClick={onReject} className="inline-flex h-7 items-center gap-1 border border-white/[0.07] px-2 text-[8px] text-sparkle-text-muted hover:bg-white/[0.03] disabled:opacity-40"><X size={9} />Not now</button>
                <button type="button" disabled={busy} onClick={onApprove} className="inline-flex h-7 items-center gap-1 border border-emerald-300/15 bg-emerald-400/[0.055] px-2 text-[8px] font-medium text-emerald-100/80 hover:bg-emerald-400/[0.09] disabled:opacity-40">{busy ? <LoaderCircle size={9} className="animate-spin" /> : <Check size={9} />}Allow</button>
            </div>
        </div>
    )
}
