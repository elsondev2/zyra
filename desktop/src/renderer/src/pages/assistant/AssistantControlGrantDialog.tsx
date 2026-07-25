import { useEffect, useState } from 'react'
import { ShieldCheck, X } from 'lucide-react'
import type { ControlCapability, ControlPendingGrant } from '@shared/agent-control/contracts'

export function AssistantControlGrantDialog({ request, onApprove, onReject }: {
    request: ControlPendingGrant
    onApprove: (capabilities: ControlCapability[], durationMs: number, maxActions: number) => void
    onReject: () => void
}) {
    const [capabilities, setCapabilities] = useState<ControlCapability[]>(request.capabilities)
    const [maxActions, setMaxActions] = useState(request.maxActions)
    useEffect(() => {
        setCapabilities(request.capabilities)
        setMaxActions(request.maxActions)
    }, [request])
    const remainingDuration = Math.max(1_000, Date.parse(request.expiresAt) - Date.now())
    return (
        <section className="m-2.5 border border-amber-300/20 bg-amber-400/[0.045] p-2.5" aria-label="Control grant approval">
            <div className="flex items-start gap-2">
                <ShieldCheck size={13} className="mt-0.5 text-amber-200/80" />
                <div className="min-w-0 flex-1">
                    <h3 className="text-[10px] font-semibold text-sparkle-text-secondary">Control permission requested</h3>
                    <p className="mt-1 text-[9px] leading-4 text-sparkle-text-muted/70">
                        {request.principal.type === 'root' ? `Root turn ${request.principal.turnId.slice(0, 10)}` : `Subagent ${request.principal.agentRunId}`} requested {request.targetId}.
                    </p>
                </div>
                <button type="button" onClick={onReject} aria-label="Decline control grant"><X size={12} /></button>
            </div>
            <div className="mt-2 space-y-1">
                {request.capabilities.map((capability) => (
                    <label key={capability} className="flex items-center gap-1.5 text-[9px] text-sparkle-text-muted/80">
                        <input type="checkbox" checked={capabilities.includes(capability)} onChange={(event) => setCapabilities((current) => event.target.checked ? [...current, capability] : current.filter((entry) => entry !== capability))} />
                        {capability}
                    </label>
                ))}
            </div>
            <label className="mt-2 block text-[9px] text-sparkle-text-muted/70">Maximum successful operations
                <input type="number" min={1} max={request.maxActions} value={maxActions} onChange={(event) => setMaxActions(Math.max(1, Math.min(request.maxActions, Number(event.target.value) || 1)))} className="mt-1 h-6 w-full border border-white/[0.08] bg-black/10 px-2" />
            </label>
            <p className="mt-2 text-[8px] leading-3.5 text-sparkle-text-muted/55">Side effects, password entry, broader origins, and other targets remain outside this grant.</p>
            <div className="mt-2 flex gap-1.5">
                <button type="button" onClick={onReject} className="h-6 flex-1 border border-white/[0.08] text-[9px] hover:bg-white/[0.04]">Decline</button>
                <button type="button" disabled={capabilities.length === 0} onClick={() => onApprove(capabilities, remainingDuration, maxActions)} className="h-6 flex-1 border border-emerald-300/20 bg-emerald-400/[0.08] text-[9px] text-emerald-100 disabled:opacity-40">Approve bounded grant</button>
            </div>
        </section>
    )
}
