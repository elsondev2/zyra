import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { AnchoredNativeOverlay } from '@/components/ui/AnchoredNativeOverlay'

export type AppSubmenuItem = { id: string; label: string; icon: ReactNode; onSelect: () => void }
export function AppSubmenu({ label, icon, items }: { label: string; icon: ReactNode; items: readonly AppSubmenuItem[] }) {
    const [open, setOpen] = useState(false)
    const trigger = useRef<HTMLButtonElement | null>(null)
    const menu = useRef<HTMLDivElement | null>(null)
    const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const focusOnOpen = useRef(false)
    const cancelClose = () => { if (closeTimer.current) clearTimeout(closeTimer.current); closeTimer.current = null }
    const show = (focus = false) => { cancelClose(); focusOnOpen.current = focus; setOpen(true) }
    const scheduleClose = () => { cancelClose(); closeTimer.current = setTimeout(() => setOpen(false), 180) }
    useEffect(() => () => cancelClose(), [])
    return <div className="relative" onPointerEnter={() => show()} onPointerLeave={scheduleClose}>
        <button ref={trigger} type="button" role="menuitem" aria-haspopup="menu" aria-expanded={open}
            onClick={() => open ? setOpen(false) : show(true)}
            onKeyDown={event => { if (['ArrowRight', 'Enter', ' '].includes(event.key)) { event.preventDefault(); event.stopPropagation(); show(true); if (open) menu.current?.querySelector<HTMLButtonElement>('button')?.focus() } }}
            className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sparkle-text-secondary hover:bg-[var(--surface-hover)] hover:text-sparkle-text focus-visible:bg-[var(--surface-hover)]">
            <span className="inline-flex size-4 shrink-0 items-center justify-center">{icon}</span><span className="min-w-0 flex-1">{label}</span><ChevronRight size={13} />
        </button>
        {open ? <AnchoredNativeOverlay anchorRef={trigger} autoFocus={false} onReady={() => { if (focusOnOpen.current) { focusOnOpen.current = false; menu.current?.querySelector<HTMLButtonElement>('button')?.focus() } }}>
            <div ref={menu} role="menu" aria-label={label} onPointerEnter={cancelClose} onPointerLeave={scheduleClose}
                className="absolute left-full top-0 z-[210] ml-1 w-52 rounded-xl border border-[var(--surface-divider)] bg-[var(--surface-floating)] p-1 text-[12px] shadow-xl"
                onKeyDown={event => {
                    if (event.key === 'Escape' || event.key === 'ArrowLeft') { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); return }
                    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
                    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')]
                    const index = buttons.indexOf(event.currentTarget.ownerDocument.activeElement as HTMLButtonElement)
                    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : event.key === 'ArrowUp' ? (index <= 0 ? buttons.length - 1 : index - 1) : (index + 1) % buttons.length
                    event.preventDefault(); buttons[next]?.focus()
                }}>
                {items.map(item => <button key={item.id} type="button" role="menuitem" onClick={() => { setOpen(false); item.onSelect() }} className="flex min-h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sparkle-text-secondary hover:bg-[var(--surface-hover)] hover:text-sparkle-text focus-visible:bg-[var(--surface-hover)]">
                    <span className="inline-flex size-4 shrink-0 items-center justify-center">{item.icon}</span><span>{item.label}</span>
                </button>)}
            </div>
        </AnchoredNativeOverlay> : null}
    </div>
}
