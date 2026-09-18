import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ChevronDown, Copy, FolderOpen, Maximize2, Minus, RotateCw, Settings2, Square, X } from 'lucide-react'
import { AnchoredNativeOverlay } from '@/components/ui/AnchoredNativeOverlay'
import { addOverlayEventListener, addOverlayWindowBlurListener, isOverlayEventInside } from '@/components/ui/native-overlay-portal'
import { useWindowChrome } from '@/lib/useWindowChrome'
import { previewWindowMenuActions } from './preview-window-menu'

const noDrag = { WebkitAppRegion: 'no-drag' } as CSSProperties
const icons = { reveal: FolderOpen, copy: Copy, settings: Settings2, reload: RotateCw, minimize: Minus, maximize: Maximize2, close: X }

export function PreviewAppMenu({ filePath, isDirty, onClose }: { filePath?: string; isDirty?: boolean; onClose?: () => void }) {
    const { isMaximized } = useWindowChrome()
    const [open, setOpen] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const trigger = useRef<HTMLButtonElement>(null)
    const menu = useRef<HTMLDivElement>(null)
    useEffect(() => {
        if (!open) return
        const pointer = addOverlayEventListener('pointerdown', event => {
            if (!isOverlayEventInside(event, trigger.current) && !isOverlayEventInside(event, menu.current)) setOpen(false)
        }, true)
        const key = addOverlayEventListener('keydown', event => {
            if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus() }
        })
        const blur = addOverlayWindowBlurListener(() => setOpen(false))
        return () => { pointer(); key(); blur() }
    }, [open])
    const actions = previewWindowMenuActions({ api: window.devscope, filePath, isDirty, isMaximized, close: onClose, reload: () => window.location.reload() })
    return <div className="relative flex h-full shrink-0 items-center" style={noDrag}>
        <button ref={trigger} type="button" aria-label="Zyra menu" aria-haspopup="menu" aria-expanded={open}
            className="inline-flex h-full items-center gap-1 px-2 text-[12px] font-semibold text-sparkle-text-secondary hover:text-sparkle-text"
            onClick={() => setOpen(value => !value)}><span>Zyra</span><ChevronDown size={11} /></button>
        {open ? <AnchoredNativeOverlay><div ref={menu} role="menu" className="absolute left-0 top-full z-[190] mt-1 w-52 rounded-lg border border-[var(--surface-divider)] bg-[var(--surface-floating)] p-1 shadow-xl">
            {actions.map(action => {
                const Icon = icons[action.id as keyof typeof icons]
                return <button key={action.id} type="button" role="menuitem" disabled={action.disabled}
                    className="flex h-8 w-full items-center gap-2 rounded px-2.5 text-left text-[12px] text-sparkle-text-secondary hover:bg-[var(--surface-hover)] hover:text-sparkle-text disabled:opacity-40 disabled:hover:bg-transparent"
                    title={action.id === 'reload' && action.disabled ? 'Save or discard changes before reloading' : undefined}
                    onClick={() => { setOpen(false); setError(null); void Promise.resolve().then(() => action.run()).catch(reason => setError(reason instanceof Error ? reason.message : 'The action could not finish.')) }}>
                    <Icon size={13} />{action.label}
                </button>
            })}
        </div></AnchoredNativeOverlay> : null}
        {error ? <AnchoredNativeOverlay><div role="alert" className="absolute left-0 top-full z-[190] mt-1 flex w-72 gap-2 rounded-lg border border-[var(--surface-divider)] bg-[var(--surface-floating)] p-3 text-xs text-sparkle-text shadow-xl"><span>{error}</span><button type="button" aria-label="Dismiss menu error" onClick={() => setError(null)}><X size={13} /></button></div></AnchoredNativeOverlay> : null}
    </div>
}

export function PreviewWindowControls({ onClose }: { onClose?: () => void }) {
    const { policy, isMaximized } = useWindowChrome()
    if (!policy.customWindowControls) return null
    const button = 'inline-flex h-full w-10 items-center justify-center text-sparkle-text-secondary hover:bg-[var(--surface-hover)]'
    return <div className="flex h-full shrink-0" style={noDrag}>
        <button type="button" aria-label="Minimize window" className={button} onClick={() => window.devscope.window.minimize()}><Minus size={14} /></button>
        <button type="button" aria-label={isMaximized ? 'Restore window' : 'Maximize window'} className={button} onClick={() => window.devscope.window.maximize()}>{isMaximized ? <Copy size={12} /> : <Square size={12} />}</button>
        <button type="button" aria-label="Close window" className={`${button} hover:!bg-red-600 hover:!text-white`} onClick={() => onClose ? onClose() : window.devscope.window.close()}><X size={14} /></button>
    </div>
}
