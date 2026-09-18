import type { CSSProperties, Ref } from 'react'
import { Copy, Minus, Square, X } from 'lucide-react'
import { useWindowChrome } from '@/lib/useWindowChrome'

export function AccessoryWindowHeader({ title, onClose, slotRef, separated = false }: { title: string; onClose: () => void; slotRef: Ref<HTMLDivElement>; separated?: boolean }) {
    const { policy, isMaximized } = useWindowChrome()
    return <header className="zyra-topbar-surface flex h-[34px] shrink-0 items-center border-b border-[var(--surface-divider)] text-sparkle-text" style={{ WebkitAppRegion: 'drag', paddingLeft: policy.reserveMacTrafficLights ? 76 : 12 } as CSSProperties}>
        <div className={`flex h-full min-w-0 max-w-[180px] shrink-0 items-center pr-3 text-[12px] ${separated ? 'border-r border-[var(--surface-divider)]' : ''}`}><span className="font-semibold">Zyra</span><span className="mx-2 text-sparkle-text-muted">/</span><span className="min-w-0 truncate text-sparkle-text-secondary">{title}</span></div>
        <div ref={slotRef} className="flex h-full min-w-0 flex-1 items-center" data-accessory-header-slot="true" />
        {policy.customWindowControls ? <div className="flex h-full shrink-0" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
            <button type="button" aria-label="Minimize" onClick={() => void window.devscope.window.minimize()} className="flex w-10 items-center justify-center hover:bg-[var(--surface-hover)]"><Minus size={14} /></button>
            <button type="button" aria-label={isMaximized ? 'Restore window' : 'Maximize'} onClick={() => void window.devscope.window.maximize()} className="flex w-10 items-center justify-center hover:bg-[var(--surface-hover)]">{isMaximized ? <Copy size={12} /> : <Square size={12} />}</button>
            <button type="button" aria-label="Close accessory" onClick={onClose} className="flex w-10 items-center justify-center hover:bg-red-600 hover:text-white"><X size={14} /></button>
        </div> : null}
    </header>
}
