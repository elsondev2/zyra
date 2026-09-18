import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Code2, Download, Info, Maximize2, Minimize2, X } from 'lucide-react'
import { NativeOverlayPortal } from '../native-overlay-portal'

const actionClass = 'inline-flex items-center gap-2 rounded px-2 py-1.5 text-[12px] text-sparkle-text-muted hover:bg-[var(--surface-hover)] hover:text-sparkle-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)]'

export function VisualizationInfo({ title, summary, html, expanded, onExpand, onSave }: {
    title: string; summary: string; html: string; expanded: boolean; onExpand: () => void; onSave: () => void
}) {
    const id = useId()
    const trigger = useRef<HTMLButtonElement>(null)
    const panel = useRef<HTMLDivElement>(null)
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [open, setOpen] = useState(false)
    const [sourceOpen, setSourceOpen] = useState(false)
    const [position, setPosition] = useState({ left: 0, top: 0 })
    const cancelClose = () => { if (timer.current) clearTimeout(timer.current); timer.current = null }
    const show = () => { cancelClose(); if (!sourceOpen) setOpen(true) }
    const close = () => { cancelClose(); setOpen(false) }
    const scheduleClose = () => {
        cancelClose()
        timer.current = setTimeout(() => {
            const active = trigger.current?.ownerDocument.activeElement
            if (active !== trigger.current && !panel.current?.contains(active ?? null)) setOpen(false)
        }, 150)
    }
    useEffect(() => () => cancelClose(), [])
    useLayoutEffect(() => {
        if (!open) return
        const view = trigger.current!.ownerDocument.defaultView!
        const update = () => {
            const anchor = trigger.current?.getBoundingClientRect()
            const bounds = panel.current?.getBoundingClientRect()
            if (!anchor || !bounds) return
            setPosition({ left: Math.max(12, Math.min(anchor.left, view.innerWidth - bounds.width - 12)), top: Math.max(12, anchor.bottom + bounds.height + 6 <= view.innerHeight - 12 ? anchor.bottom + 6 : anchor.top - bounds.height - 6) })
        }
        update()
        view.addEventListener('resize', update)
        view.addEventListener('scroll', update, true)
        const observer = new ResizeObserver(update)
        if (panel.current) observer.observe(panel.current)
        return () => { view.removeEventListener('resize', update); view.removeEventListener('scroll', update, true); observer.disconnect() }
    }, [open])
    useEffect(() => {
        if (!open) return
        const owner = trigger.current!.ownerDocument
        const outside = (event: PointerEvent) => {
            const target = event.target as Node | null
            if (!trigger.current?.contains(target) && !panel.current?.contains(target)) close()
        }
        const escape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return
            trigger.current?.focus()
            close()
            event.preventDefault()
        }
        owner.addEventListener('pointerdown', outside)
        owner.addEventListener('keydown', escape)
        return () => { owner.removeEventListener('pointerdown', outside); owner.removeEventListener('keydown', escape) }
    }, [open])
    return <>
        <button ref={trigger} type="button" aria-label={`About ${title}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
            onMouseEnter={show} onMouseLeave={scheduleClose} onFocus={show} onBlur={scheduleClose} onClick={show}
            onKeyDown={event => {
                if (open && (event.key === 'ArrowDown' || (event.key === 'Tab' && !event.shiftKey))) {
                    event.preventDefault()
                    panel.current?.querySelector('button')?.focus()
                }
            }}
            className="inline-flex size-6 shrink-0 items-center justify-center rounded text-sparkle-text-muted hover:text-sparkle-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)]"><Info size={13} aria-hidden="true" /></button>
        {open && trigger.current ? createPortal(<div ref={panel} id={id} role="dialog" aria-label={`About ${title}`} style={position}
            onMouseEnter={cancelClose} onMouseLeave={scheduleClose} onFocus={cancelClose} onBlur={scheduleClose}
            className="fixed z-[3000] max-h-[calc(100vh-24px)] w-[min(320px,calc(100vw-24px))] overflow-y-auto rounded-md border border-[var(--surface-divider)] bg-sparkle-card p-3 text-[12px] leading-5 text-sparkle-text shadow-xl">
            <p className="break-words font-medium">{title}</p>
            {summary ? <p className="mt-1 break-words text-sparkle-text-muted">{summary}</p> : null}
            <div className="mt-2 flex flex-wrap gap-1">
                <button type="button" className={actionClass} onClick={() => { close(); setSourceOpen(true) }}><Code2 size={13} aria-hidden="true" />View HTML</button>
                <button type="button" className={actionClass} onClick={onSave}><Download size={13} aria-hidden="true" />Save HTML</button>
                <button type="button" className={actionClass} onClick={onExpand} aria-expanded={expanded} aria-label={expanded ? 'Collapse visualization' : 'Expand visualization'}>{expanded ? <Minimize2 size={13} aria-hidden="true" /> : <Maximize2 size={13} aria-hidden="true" />}{expanded ? 'Collapse' : 'Expand'}</button>
            </div>
        </div>, trigger.current.ownerDocument.body) : null}
        {sourceOpen ? <VisualizationSource title={title} html={html} onSave={onSave} onClose={() => {
            setSourceOpen(false)
            requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }))
        }} /> : null}
    </>
}

function VisualizationSource({ title, html, onSave, onClose }: { title: string; html: string; onSave: () => void; onClose: () => void }) {
    const dialog = useRef<HTMLDialogElement>(null)
    const id = useId()
    return <NativeOverlayPortal autoFocus={false} onReady={() => { if (!dialog.current?.open) dialog.current?.showModal() }}>
        <dialog ref={dialog} aria-labelledby={id} aria-modal="true" onCancel={event => { event.preventDefault(); dialog.current?.close() }} onClose={onClose}
            className="m-auto w-[min(900px,calc(100vw-32px))] max-w-none overflow-hidden rounded-lg border border-[var(--surface-divider)] bg-sparkle-card p-0 text-sparkle-text shadow-2xl backdrop:bg-black/40">
            <div className="flex max-h-[80vh] flex-col">
                <header className="flex shrink-0 items-center gap-3 border-b border-[var(--surface-divider)] px-4 py-3">
                    <h2 id={id} className="min-w-0 flex-1 truncate text-sm font-medium">{title} · HTML</h2>
                    <button type="button" className={actionClass} onClick={onSave}>Save HTML</button>
                    <button type="button" autoFocus className={actionClass} aria-label="Close HTML" onClick={() => dialog.current?.close()}><X size={16} aria-hidden="true" /></button>
                </header>
                <pre tabIndex={0} aria-label="HTML source" className="min-h-0 overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-[12px] leading-5">{html}</pre>
            </div>
        </dialog>
    </NativeOverlayPortal>
}
