import { createContext, useContext, type ReactNode, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

const AccessoryHeaderContext = createContext<HTMLElement | null>(null)
export const AccessoryHeaderProvider = AccessoryHeaderContext.Provider

/** Keeps the workspace controller in place while presenting its chrome in the window header. */
export function AccessoryHeaderPortal({ children, draggable = false }: { children: ReactNode; draggable?: boolean }) {
    const target = useContext(AccessoryHeaderContext)
    return target ? createPortal(<div className="flex h-full min-w-0 flex-1 items-center" style={{ WebkitAppRegion: draggable ? 'drag' : 'no-drag' } as CSSProperties}>{children}</div>, target) : null
}
