import type { ControlAuditEvent } from '@shared/agent-control/contracts'

export function AssistantControlAudit({ events, onClear }: { events: ControlAuditEvent[]; onClear: () => void }) {
    return (
        <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
            <div className="mb-2 flex items-center justify-between">
                <span className="text-[8px] font-semibold uppercase tracking-[0.12em] text-sparkle-text-muted/50">Redacted local audit</span>
                <button type="button" onClick={onClear} className="h-5 border border-white/[0.07] px-1.5 text-[8px] text-sparkle-text-muted hover:bg-white/[0.04]">Clear audit</button>
            </div>
            <div className="space-y-1.5">
                {events.length === 0 ? <p className="text-[9px] text-sparkle-text-muted/55">No retained control events.</p> : events.map((event) => (
                    <article key={event.auditId} className="border border-white/[0.06] bg-white/[0.018] p-2 text-[9px]">
                        <div className="flex justify-between gap-2"><span className="font-medium text-sparkle-text-secondary">{event.eventType}</span><span className="text-sparkle-text-muted/45">{new Date(event.occurredAt).toLocaleTimeString()}</span></div>
                        <div className="mt-1 text-sparkle-text-muted/65">{event.outcome}{event.actionType ? ` · ${event.actionType}` : ''}{event.observationRevision ? ` · rev ${event.observationRevision}` : ''}</div>
                        {event.message ? <p className="mt-1 line-clamp-3 text-sparkle-text-muted/55">{event.message}</p> : null}
                    </article>
                ))}
            </div>
        </div>
    )
}
