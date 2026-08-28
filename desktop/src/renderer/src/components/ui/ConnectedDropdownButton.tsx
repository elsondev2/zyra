import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatedHeight } from '@/components/ui/AnimatedHeight'
import { cn } from '@/lib/utils'

const MENU_ANIMATION_MS = 220

const TONE_STYLES = {
    sky: {
        trigger: 'bg-sky-500/14 text-sky-100 hover:bg-sky-500/[0.18]',
        chevron: 'bg-sky-500/11 text-sky-200 hover:bg-sky-500/[0.15]',
        dot: 'bg-sky-300/85',
        row: 'bg-sky-500/14 text-sky-100'
    },
    amber: {
        trigger: 'bg-amber-500/14 text-amber-100 hover:bg-amber-500/[0.18]',
        chevron: 'bg-amber-500/11 text-amber-200 hover:bg-amber-500/[0.15]',
        dot: 'bg-amber-300/85',
        row: 'bg-amber-500/14 text-amber-100'
    },
    emerald: {
        trigger: 'bg-emerald-500/14 text-emerald-100 hover:bg-emerald-500/[0.18]',
        chevron: 'bg-emerald-500/11 text-emerald-200 hover:bg-emerald-500/[0.15]',
        dot: 'bg-emerald-300/85',
        row: 'bg-emerald-500/14 text-emerald-100'
    },
    violet: {
        trigger: 'bg-violet-500/14 text-violet-100 hover:bg-violet-500/[0.18]',
        chevron: 'bg-violet-500/11 text-violet-200 hover:bg-violet-500/[0.15]',
        dot: 'bg-violet-300/85',
        row: 'bg-violet-500/14 text-violet-100'
    },
    rose: {
        trigger: 'bg-rose-500/14 text-rose-100 hover:bg-rose-500/[0.18]',
        chevron: 'bg-rose-500/11 text-rose-200 hover:bg-rose-500/[0.15]',
        dot: 'bg-rose-300/85',
        row: 'bg-rose-500/14 text-rose-100'
    }
} as const

export type ConnectedDropdownButtonOption = {
    id: string
    label: string
    icon?: ReactNode
    tone?: ConnectedDropdownButtonTone
}

export type ConnectedDropdownButtonTone = keyof typeof TONE_STYLES

export function ConnectedDropdownButton(props: {
    value: string
    options: ConnectedDropdownButtonOption[]
    onChange: (value: string) => void
    onPrimaryAction?: (value: string) => void
    primarySuffix?: ReactNode
    disabled?: boolean
    className?: string
    tone?: ConnectedDropdownButtonTone
    menuLabel?: string
    direction?: 'down' | 'up'
    shape?: 'rounded' | 'pill'
    size?: 'default' | 'composer'
}) {
    const {
        value,
        options,
        onChange,
        onPrimaryAction,
        primarySuffix,
        disabled = false,
        className,
        tone = 'sky',
        menuLabel = 'Choose option',
        direction = 'down',
        shape = 'rounded',
        size = 'default'
    } = props
    const [menuOpen, setMenuOpen] = useState(false)
    const [menuVisible, setMenuVisible] = useState(false)
    const triggerRef = useRef<HTMLDivElement | null>(null)
    const menuRef = useRef<HTMLDivElement | null>(null)
    const closeTimerRef = useRef<number | null>(null)

    const selectedOption = options.find((option) => option.id === value) || options[0]
    const alternateOption = options.find((option) => option.id !== selectedOption?.id) || selectedOption
    const selectedToneStyles = TONE_STYLES[selectedOption?.tone || tone]

    const openMenu = () => {
        if (disabled) return
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
            if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return
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

    const DirectionChevron = direction === 'up' ? ChevronUp : ChevronDown
    const composerSize = size === 'composer'

    return (
        <div ref={triggerRef} className={cn('relative inline-flex w-full max-w-[240px]', className)}>
            <div
                style={shape === 'pill' ? { borderBottomLeftRadius: 9999, borderBottomRightRadius: 9999 } : undefined}
                className={cn(
                    'inline-flex w-full overflow-hidden border border-white/[0.07] bg-sparkle-card transition-[border-color,background-color,box-shadow,border-radius] duration-200',
                    shape === 'pill' ? 'rounded-full' : 'rounded-md',
                    menuVisible && (
                        direction === 'up'
                            ? shape === 'pill'
                                ? 'relative z-[121] border-white/20 [border-top-color:transparent] shadow-[0_10px_24px_rgba(0,0,0,0.16)]'
                                : 'rounded-t-none border-t-transparent border-white/20 shadow-[0_10px_24px_rgba(0,0,0,0.16)]'
                            : 'rounded-b-none border-b-transparent border-white/20 shadow-[0_10px_24px_rgba(0,0,0,0.16)]'
                    ),
                    disabled && 'opacity-55'
                )}
            >
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                        if (disabled || !selectedOption) return
                        if (onPrimaryAction) {
                            onPrimaryAction(selectedOption.id)
                            return
                        }
                        if (alternateOption) onChange(alternateOption.id)
                    }}
                    className={cn(
                        'inline-flex min-w-0 flex-1 items-center gap-2 font-medium transition-colors',
                        composerSize ? 'h-9 px-3 text-[12px]' : 'h-8 px-3 text-xs',
                        selectedToneStyles.trigger,
                        disabled && 'cursor-not-allowed'
                    )}
                    title={selectedOption?.label || ''}
                >
                    {selectedOption?.icon || <span className={cn('size-1.5 shrink-0 rounded-full', selectedToneStyles.dot)} aria-hidden="true" />}
                    <span className="min-w-0 flex-1 truncate text-left">{selectedOption?.label}</span>
                    {primarySuffix ? <span className="shrink-0">{primarySuffix}</span> : null}
                </button>
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                        if (disabled) return
                        if (menuVisible && menuOpen) {
                            closeMenu()
                            return
                        }
                        openMenu()
                    }}
                    className={cn(
                        'inline-flex items-center justify-center border-l border-white/[0.08] transition-colors',
                        composerSize ? 'h-9 w-8' : 'h-8 w-9',
                        selectedToneStyles.chevron,
                        disabled && 'cursor-not-allowed'
                    )}
                    aria-haspopup="menu"
                    aria-expanded={menuVisible && menuOpen}
                    title={menuLabel}
                >
                    <DirectionChevron className={cn('size-3.5 transition-transform', menuVisible && menuOpen && 'rotate-180')} />
                </button>
            </div>

            {menuVisible ? (
                <div
                    ref={menuRef}
                    className={cn(
                        'absolute left-0 z-[120] w-full overflow-hidden',
                        direction === 'up'
                            ? shape === 'pill' ? 'bottom-full -mb-[18px]' : 'bottom-full -mb-px'
                            : 'top-full -mt-px',
                        menuVisible ? 'pointer-events-auto' : 'pointer-events-none'
                    )}
                >
                    <AnimatedHeight isOpen={menuOpen} duration={MENU_ANIMATION_MS}>
                        <div
                            role="menu"
                            className={cn(
                                'relative border border-white/[0.08] bg-sparkle-card p-1 shadow-2xl shadow-black/60',
                                direction === 'up'
                                    ? cn(shape === 'pill' ? 'rounded-t-[18px] pb-[19px]' : 'rounded-t-lg', 'rounded-b-none border-b-transparent')
                                    : cn(shape === 'pill' ? 'rounded-b-[18px]' : 'rounded-b-lg', 'rounded-t-none border-t-transparent')
                            )}
                        >
                            <div className={cn('pointer-events-none absolute inset-x-0 h-px bg-white/[0.08]', direction === 'up' ? 'bottom-0' : 'top-0')} />
                            {options.map((option) => {
                                const selected = option.id === selectedOption?.id
                                const optionToneStyles = TONE_STYLES[option.tone || tone]
                                return (
                                    <button
                                        key={option.id}
                                        type="button"
                                        role="menuitem"
                                        onClick={() => {
                                            onChange(option.id)
                                            closeMenu()
                                        }}
                                        className={cn(
                                            'flex w-full items-center gap-2 rounded-md px-2.5 text-left text-xs transition-colors',
                                            composerSize ? 'h-9' : 'py-1.5',
                                            selected
                                                ? optionToneStyles.row
                                                : 'text-sparkle-text-secondary hover:bg-white/[0.05] hover:text-sparkle-text'
                                        )}
                                    >
                                        {option.icon ? <span className="inline-flex shrink-0">{option.icon}</span> : null}
                                        <span className="min-w-0 flex-1 truncate">{option.label}</span>
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
