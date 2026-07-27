import { Chrome, Globe2, Monitor, ShieldCheck } from 'lucide-react'
import type { ControlGrant, ControlTarget } from '@shared/agent-control/contracts'

function targetLabel(target: ControlTarget): string {
    if (target.kind === 'zyra-browser') return `Zyra Browser · ${target.tabId}`
    if (target.kind === 'chrome-tab') return `Paired Chrome · ${target.origin || 'current tab'}`
    return `Windows app · ${target.executableIdentity.slice(0, 12)}`
}

export function AssistantControlTargets({ targets, grants, onRevoke }: {
    targets: ControlTarget[]
    grants: ControlGrant[]
    onRevoke: (grantId: string) => void
}) {
    if (targets.length === 0) return <p className="p-3 text-[10px] leading-4 text-sparkle-text-muted/65">Open an integrated Browser tab, pair an exact Chrome tab, or select a Windows window.</p>
    return (
        <div className="space-y-2 p-2.5">
            {targets.map((target) => {
                const activeGrant = grants.find((grant) => grant.targetId === target.targetId && grant.state === 'active')
                const Icon = target.kind === 'zyra-browser' ? Globe2 : target.kind === 'chrome-tab' ? Chrome : Monitor
                return (
                    <article key={target.targetId} className="border border-white/[0.07] bg-white/[0.02] p-2.5">
                        <div className="flex items-start gap-2">
                            <Icon size={13} className="mt-0.5 shrink-0 text-[var(--accent-primary)]/80" />
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-[10px] font-semibold text-sparkle-text-secondary">{targetLabel(target)}</div>
                                <div className="mt-0.5 truncate font-mono text-[8px] text-sparkle-text-muted/45">{target.targetId}</div>
                            </div>
                            {activeGrant ? <ShieldCheck size={12} className="text-emerald-300/80" /> : null}
                        </div>
                        {activeGrant ? (
                            <div className="mt-2 border-t border-white/[0.06] pt-2 text-[9px] text-sparkle-text-muted/70">
                                <div>{activeGrant.principal.type === 'root' ? 'Root agent' : `Subagent ${activeGrant.principal.agentRunId}`}</div>
                                <div className="mt-0.5">{Math.max(0, activeGrant.maxActions - activeGrant.actionCount)} actions left · expires {new Date(activeGrant.expiresAt).toLocaleTimeString()}</div>
                                <div className="mt-1 line-clamp-2">{activeGrant.capabilities.join(' · ')}</div>
                                <button type="button" onClick={() => onRevoke(activeGrant.grantId)} className="mt-2 h-6 border border-white/[0.08] px-2 text-[9px] hover:bg-white/[0.05]">Revoke</button>
                            </div>
                        ) : <p className="mt-2 text-[9px] text-sparkle-text-muted/55">No active grant</p>}
                    </article>
                )
            })}
        </div>
    )
}
