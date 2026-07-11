import { Check, ChevronDown, SquareTerminal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Shell } from '@/lib/settings'
import { AnimatedHeight } from '@/components/ui/AnimatedHeight'
import { cn } from '@/lib/utils'

const MENU_ANIMATION_MS = 220

const SHELL_STYLES: Record<Shell, {
    trigger: string
    chevron: string
    row: string
    dot: string
}> = {
    powershell: {
        trigger: 'bg-sky-500/14 text-sky-100 hover:bg-sky-500/[0.18]',
        chevron: 'bg-sky-500/11 text-sky-200 hover:bg-sky-500/[0.15]',
        row: 'bg-sky-500/14 text-sky-100',
        dot: 'bg-sky-300/85'
    },
    cmd: {
        trigger: 'bg-amber-500/14 text-amber-100 hover:bg-amber-500/[0.18]',
        chevron: 'bg-amber-500/11 text-amber-200 hover:bg-amber-500/[0.15]',
        row: 'bg-amber-500/14 text-amber-100',
        dot: 'bg-amber-300/85'
    }
}

const SHELL_LABELS: Record<Shell, string> = {
    powershell: 'PowerShell',
    cmd: 'CMD'
}

type PreviewTerminalNewMenuProps = {
    value: Shell
    onChange: (value: Shell) => void
    onCreate: (value: Shell) => void
}

export function PreviewTerminalNewMenu({ value, onChange, onCreate }: PreviewTerminalNewMenuProps) {
    const [menuOpen, setMenuOpen] = useState(false)
    const [menuVisible, setMenuVisible] = useState(false)
    const controlRef = useRef<HTMLDivElement | null>(null)
    const menuRef = useRef<HTMLDivElement | null>(null)
    const closeTimerRef = useRef<number | null>(null)

    const activeStyles = SHELL_STYLES[value]
    const activeLabel = SHELL_LABELS[value]

    const openMenu = () => {
        if (closeTimerRef.current !== null) {
            window.clearTimeout(closeTimerRef.current)
            closeTimerRef.current = null
        }
        setMenuVisible(true)
        window.requestAnimationFrame(() => setMenuOpen(true))
    }

    const closeMenu = () => {
        if (closeTimerRef.current !== null) {
            window.clearTimeout(closeTimerRef.current)
        }
        setMenuOpen(false)
        closeTimerRef.current = window.setTimeout(() => {
            setMenuVisible(false)
            closeTimerRef.current = null
        }, MENU_ANIMATION_MS)
    }

    useEffect(() => {
        if (!menuVisible) return

        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target as Node | null
            if (controlRef.current?.contains(target) || menuRef.current?.contains(target)) return
            closeMenu()
        }

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') closeMenu()
        }

        document.addEventListener('pointerdown', handlePointerDown, true)
        window.addEventListener('keydown', handleEscape)
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown, true)
            window.removeEventListener('keydown', handleEscape)
        }
    }, [menuVisible])

    useEffect(() => () => {
        if (closeTimerRef.current !== null) {
            window.clearTimeout(closeTimerRef.current)
        }
    }, [])

    return (
        <div ref={controlRef} className="relative inline-flex shrink-0">
            <div
                className={cn(
                    'inline-flex overflow-hidden rounded-none border border-white/[0.07] bg-sparkle-card transition-[border-color,background-color,box-shadow,border-radius] duration-200',
                    menuVisible && 'rounded-b-none border-b-transparent border-white/20 shadow-none'
                )}
            >
                <button
                    type="button"
                    onClick={() => onCreate(value)}
                    className={cn('inline-flex h-6 min-w-[108px] items-center gap-1.5 px-2 text-[10px] font-medium transition-colors', activeStyles.trigger)}
                    title={`Open new ${activeLabel} terminal`}
                    aria-label={`Open new ${activeLabel} terminal`}
                >
                    <SquareTerminal size={12} className="shrink-0" />
                    <span className={cn('size-1.5 shrink-0 rounded-full', activeStyles.dot)} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-left">{activeLabel}</span>
                </button>
                <button
                    type="button"
                    onClick={() => {
                        if (menuVisible && menuOpen) {
                            closeMenu()
                            return
                        }
                        openMenu()
                    }}
                    className={cn('inline-flex h-6 w-6 items-center justify-center border-l border-white/[0.08] transition-colors', activeStyles.chevron)}
                    title="Choose shell"
                    aria-label="Choose shell"
                    aria-haspopup="menu"
                    aria-expanded={menuVisible && menuOpen}
                >
                    <ChevronDown className={cn('size-3 transition-transform', menuVisible && menuOpen && 'rotate-180')} />
                </button>
            </div>

            {menuVisible ? (
                <div
                    ref={menuRef}
                    className={cn(
                        'absolute left-0 top-full z-[160] -mt-px w-full overflow-hidden',
                        menuVisible ? 'pointer-events-auto' : 'pointer-events-none'
                    )}
                >
                    <AnimatedHeight isOpen={menuOpen} duration={MENU_ANIMATION_MS}>
                        <div className="relative rounded-none border border-white/[0.08] border-t-transparent bg-sparkle-card p-1 shadow-none">
                            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/[0.08]" />
                            {(['powershell', 'cmd'] as const).map((shell) => {
                                const selected = shell === value
                                const styles = SHELL_STYLES[shell]
                                return (
                                    <button
                                        key={shell}
                                        type="button"
                                        onClick={() => {
                                            onChange(shell)
                                            closeMenu()
                                        }}
                                        className={cn(
                                            'flex w-full items-center gap-2 rounded-none px-2.5 py-1.5 text-left text-xs transition-colors',
                                            selected
                                                ? styles.row
                                                : 'text-sparkle-text-secondary hover:bg-white/[0.05] hover:text-sparkle-text'
                                        )}
                                    >
                                        <span className={cn('size-1.5 shrink-0 rounded-full', styles.dot)} aria-hidden="true" />
                                        <span className="min-w-0 flex-1 truncate">{SHELL_LABELS[shell]}</span>
                                        {selected ? <Check size={12} className="shrink-0" /> : null}
                                    </button>
                                )
                            })}
                        </div>
                    </AnimatedHeight>
                </div>
            ) : null}
        </div>
    )
}
