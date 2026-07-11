import { createContext, useContext, useEffect, useMemo, useState, ReactNode, useCallback } from 'react'

interface CommandPaletteContextValue {
    isOpen: boolean
    open: () => void
    close: () => void
    toggle: () => void
}

const CommandPaletteContext = createContext<CommandPaletteContextValue>({
    isOpen: false,
    open: () => { },
    close: () => { },
    toggle: () => { }
})

interface ProviderProps {
    children: ReactNode
}

export function CommandPaletteProvider({ children }: ProviderProps) {
    const [isOpen, setIsOpen] = useState(false)

    const open = useCallback(() => setIsOpen(true), [])
    const close = useCallback(() => setIsOpen(false), [])
    const toggle = useCallback(() => setIsOpen(v => !v), [])

    // Global keyboard shortcut: Ctrl/Cmd + K
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const isCmdOrCtrl = e.metaKey || e.ctrlKey
            if (isCmdOrCtrl && e.key.toLowerCase() === 'k') {
                // avoid triggering inside inputs when modifiers present deliberately allow (common apps allow)
                e.preventDefault()
                toggle()
            }
            if (e.key === 'Escape') {
                close()
            }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [toggle, close])

    // Lock body scroll while open
    useEffect(() => {
        if (!isOpen) return
        const original = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            document.body.style.overflow = original
        }
    }, [isOpen])

    const value = useMemo(() => ({ isOpen, open, close, toggle }), [isOpen, open, close, toggle])

    return (
        <CommandPaletteContext.Provider value={value}>
            {children}
        </CommandPaletteContext.Provider>
    )
}

export const useCommandPalette = () => useContext(CommandPaletteContext)
