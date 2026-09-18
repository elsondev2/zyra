import { isOverlayEventInside } from '@/components/ui/native-overlay-portal'
import { addOverlayEventListener } from '@/components/ui/native-overlay-portal'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createOverlayPortal as createPortal } from '@/components/ui/native-overlay-portal'
import { Chrome, Globe, Monitor, MousePointer2, Square, X } from 'lucide-react'
import type { ControlCursorState, ControlStateSnapshot } from '@shared/agent-control/contracts'
import type { AssistantSessionShell } from '@shared/assistant/contracts'
import { useAssistantStoreSelector } from '@/lib/assistant/store'
import { buildControlStatus, controlPrincipalKey, isControlCursorBusy } from './assistant-control-status-model'

const EMPTY_SESSIONS: AssistantSessionShell[] = []
const SURFACES = [
    { kind: 'chrome-tab', label: 'Chrome', Icon: Chrome },
    { kind: 'zyra-browser', label: 'Zyra browser', Icon: Globe },
    { kind: 'windows-window', label: 'Computer', Icon: Monitor },
] as const

/** One quiet entry point for surface access and the global emergency brake. */
export function AssistantControlStatus({ state }: { state: ControlStateSnapshot | null }) {
    const [open, setOpen] = useState(false)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [releasing, setReleasing] = useState<string | null>(null)
    const [cursors, setCursors] = useState<ControlCursorState[]>([])
    const sessions = useAssistantStoreSelector(value => open ? value.snapshot.sessions : EMPTY_SESSIONS)
    const [position, setPosition] = useState({ top: 34, right: 12 })
    const trigger = useRef<HTMLButtonElement>(null)
    const panel = useRef<HTMLDivElement>(null)
    const grants = state?.grants.filter((grant) => grant.state === 'active') || []
    const pending = (state?.pendingGrants.length || 0) + (state?.pendingActionApprovals.length || 0)
    useEffect(() => { setCursors(state?.cursors || []) }, [state?.cursors])
    useEffect(() => {
        if (!open) return
        let disposed = false
        const changed = new Set<string>()
        const unsubscribe = window.devscope.agentControl.onCursorChange(cursor => {
            changed.add(cursor.targetId)
            setCursors(previous => {
                const old = previous.find(entry => entry.targetId === cursor.targetId)
                // Cursor position streams at frame rate; this panel only needs changes
                // in activity or ownership, not every coordinate update.
                if (old && isControlCursorBusy(old) === isControlCursorBusy(cursor)
                    && controlPrincipalKey(old.principal) === controlPrincipalKey(cursor.principal)) return previous
                return [...previous.filter(entry => entry.targetId !== cursor.targetId), cursor]
            })
        })
        // Refresh after a closed panel has missed cursor events. Never replace
        // events that arrived while this snapshot was being requested.
        void window.devscope.agentControl.getState().then(result => {
            if (!disposed && result.success) setCursors(previous => [
                ...previous.filter(cursor => changed.has(cursor.targetId)),
                ...result.state.cursors.filter((cursor: ControlCursorState) => !changed.has(cursor.targetId))
            ])
        }).catch(() => undefined)
        return () => { disposed = true; unsubscribe() }
    }, [open])
    useLayoutEffect(() => {
        if (!open) return
        const place = () => {
            const rect = trigger.current?.getBoundingClientRect()
            if (rect) setPosition({ top: rect.bottom + 7, right: Math.max(8, window.innerWidth - rect.right) })
        }
        place()
        window.addEventListener('resize', place)
        return () => window.removeEventListener('resize', place)
    }, [open])
    useEffect(() => {
        if (!open) return
        const dismiss = (event: PointerEvent) => {
            if (!isOverlayEventInside(event, panel.current) && !isOverlayEventInside(event, trigger.current)) setOpen(false)
        }
        const key = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); trigger.current?.focus() }
        }
        const removeOverlayListener1 = addOverlayEventListener('pointerdown', dismiss, true)
        const removeOverlayListener2 = addOverlayEventListener('keydown', key, true)
        panel.current?.focus()
        return () => {
            removeOverlayListener1()
            removeOverlayListener2()
        }
    }, [open])
    if (!state) return null
    const status = buildControlStatus(state, sessions, cursors)
    const release = async (key: string, grantIds: string[]) => {
        setReleasing(key); setError(null)
        try {
            const results = await Promise.all(grantIds.map(id => window.devscope.agentControl.revokeGrant(id)))
            const failed = results.find(result => !result.success)
            if (failed) throw new Error(failed.error || 'Could not release access.')
        } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not release access.') }
        finally { setReleasing(null) }
    }
    const stop = async () => {
        setBusy(true); setError(null)
        try {
            const result = await window.devscope.agentControl.emergencyStop()
            if (!result.success) throw new Error(result.error || 'Could not stop control.')
        } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not stop control.') }
        finally { setBusy(false) }
    }
    return <>
        <button ref={trigger} type="button" aria-label="Browser and computer access" title="Browser and computer access" aria-haspopup="dialog" aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="mr-1 inline-flex size-7 items-center justify-center rounded-md text-[var(--color-text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-primary)]">
            <MousePointer2 size={17} strokeWidth={1.8} className={grants.length ? 'text-[var(--accent-secondary)]' : ''} />
        </button>
        {open && createPortal(<div ref={panel} tabIndex={-1} role="dialog" aria-label="Browser and computer access"
            className="fixed z-[1200] w-72 max-w-[calc(100vw-16px)] rounded-xl border border-[var(--surface-divider)] bg-[var(--surface-floating)] p-3 text-[var(--color-text)] shadow-xl outline-none animate-[inspector-tab-in_180ms_ease-out_both] motion-reduce:animate-none" style={position}>
            <div className="mb-2 flex items-center justify-between text-xs font-medium"><span>Browser &amp; computer</span><button type="button" aria-label="Close access details" onClick={() => { setOpen(false); trigger.current?.focus() }} className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--color-text)]"><X size={13} /></button></div>
            <div className="max-h-52 space-y-1 overflow-y-auto">
                {SURFACES.map(({ kind, label, Icon }) => {
                    const chats = status.groups.filter(group => group.kind === kind)
                    const using = chats.filter(group => group.usingNow).length
                    const detail = kind === 'chrome-tab' ? status.chrome : using ? `${using} ${using === 1 ? 'chat' : 'chats'} using` : chats.length ? `${chats.length} ${chats.length === 1 ? 'chat has' : 'chats have'} access` : 'Not in use'
                    const highlighted = kind === 'chrome-tab' ? status.chrome === 'Connected' : using > 0
                    return <section key={kind} aria-label={label} className="py-1">
                        <div className="flex min-h-6 items-center gap-2 text-[11px]">
                            <Icon size={14} strokeWidth={1.7} className="shrink-0 text-[var(--color-text-muted)]" />
                            <span className="flex-1">{label}</span>
                            <span className={highlighted ? 'text-[var(--status-success)]' : 'text-[var(--color-text-muted)]'}>{detail}</span>
                        </div>
                        {chats.length > 0 && <ul className="ml-[22px] space-y-1 pb-1 pt-1">{chats.map(chat => <li key={chat.key} className="flex items-center gap-2 text-[10px]">
                            <span className="min-w-0 flex-1 truncate" title={`${chat.title}${chat.surfaces.length ? ` — ${chat.surfaces.join(', ')}` : ''}`}>{chat.title}</span>
                            <span className={`shrink-0 ${chat.usingNow ? 'text-[var(--accent-primary)]' : 'text-[var(--color-text-muted)]'}`}>{chat.usingNow ? 'Using now' : 'Has access'}</span>
                            <button type="button" disabled={releasing !== null} aria-label={`Release ${label} access for ${chat.title}`} onClick={() => void release(chat.key, chat.grantIds)} className="shrink-0 rounded px-1 py-0.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--color-text)] disabled:opacity-40">{releasing === chat.key ? '…' : 'Release'}</button>
                        </li>)}</ul>}
                    </section>
                })}
            </div>
            {pending > 0 && <p role="status" className="mt-2 text-[10px] text-[var(--color-text-muted)]">{pending} {pending === 1 ? 'request needs' : 'requests need'} approval in chat</p>}
            {error && <p role="alert" className="mt-2 text-[11px] text-[var(--status-danger)]">{error}</p>}
            <button type="button" disabled={busy || (!state.active && state.pairing.state === 'stopped' && !pending)} onClick={() => void stop()} className="mt-2 flex h-8 w-full items-center justify-center gap-2 rounded-md bg-[color-mix(in_srgb,var(--status-danger)_8%,transparent)] text-[11px] text-[var(--status-danger)] transition-colors hover:bg-[color-mix(in_srgb,var(--status-danger)_16%,transparent)] disabled:opacity-40"><Square size={11} />{busy ? 'Stopping…' : 'Emergency stop'}</button>
        </div>, document.body)}
    </>
}
