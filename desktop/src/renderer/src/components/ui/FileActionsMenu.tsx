import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreVertical } from 'lucide-react'
import { AnimatedHeight } from '@/components/ui/AnimatedHeight'
import { cn } from '@/lib/utils'

export interface FileActionsMenuItem {
    id: string
    label: string
    icon?: React.ReactNode
    onSelect: () => void | Promise<void>
    disabled?: boolean
    danger?: boolean
}

interface FileActionsMenuProps {
    items: FileActionsMenuItem[]
    buttonClassName?: string
    openButtonClassName?: string
    menuClassName?: string
    title?: string
    triggerIcon?: React.ReactNode
    presentation?: 'portal' | 'inline'
    preferredDirection?: 'up' | 'down'
}

export function FileActionsMenu({
    items,
    buttonClassName,
    openButtonClassName,
    menuClassName,
    title = 'Actions',
    triggerIcon,
    presentation = 'portal',
    preferredDirection
}: FileActionsMenuProps) {
    const [open, setOpen] = useState(false)
    const rootRef = useRef<HTMLDivElement | null>(null)
    const buttonRef = useRef<HTMLButtonElement | null>(null)
    const menuRef = useRef<HTMLDivElement | null>(null)
    const [inlineDirection, setInlineDirection] = useState<'up' | 'down'>('down')
    const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; originClassName: string } | null>(null)

    const updatePosition = (menuWidth = 180, menuHeight = 220) => {
        const button = buttonRef.current
        if (!button) return

        const viewportPadding = 12
        const gap = 6
        const rect = button.getBoundingClientRect()
        const spaceBelow = window.innerHeight - rect.bottom - viewportPadding
        const spaceAbove = rect.top - viewportPadding
        const shouldOpenUpward = preferredDirection
            ? preferredDirection === 'up'
            : (spaceBelow < menuHeight && spaceAbove > spaceBelow)
        const originClassName = shouldOpenUpward ? 'origin-bottom-right animate-scaleIn' : 'origin-top-right animate-scaleIn'

        if (presentation === 'inline') {
            setInlineDirection(shouldOpenUpward ? 'up' : 'down')
            setMenuPosition(null)
            return
        }

        const maxTop = Math.max(viewportPadding, window.innerHeight - menuHeight - viewportPadding)
        const top = shouldOpenUpward
            ? Math.max(viewportPadding, rect.top - menuHeight - gap)
            : Math.max(viewportPadding, Math.min(maxTop, rect.bottom + gap))
        const maxLeft = Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding)
        const left = Math.max(viewportPadding, Math.min(rect.right - menuWidth, maxLeft))

        setMenuPosition({
            top,
            left,
            originClassName
        })
    }

    useEffect(() => {
        if (!open) return

        updatePosition()
        const handleResize = () => {
            const width = menuRef.current?.offsetWidth ?? 180
            const height = menuRef.current?.offsetHeight ?? 220
            updatePosition(width, height)
        }

        const rafId = window.requestAnimationFrame(handleResize)
        window.addEventListener('resize', handleResize)
        return () => {
            window.cancelAnimationFrame(rafId)
            window.removeEventListener('resize', handleResize)
        }
    }, [open, preferredDirection, presentation])

    useEffect(() => {
        if (!open || presentation !== 'portal') return

        const handleScroll = () => setOpen(false)

        window.addEventListener('scroll', handleScroll, true)
        return () => window.removeEventListener('scroll', handleScroll, true)
    }, [open, presentation])

    useEffect(() => {
        if (!open) return

        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target as Node
            const isInsideButton = Boolean(rootRef.current?.contains(target))
            const isInsideMenu = Boolean(menuRef.current?.contains(target))
            if (!isInsideButton && !isInsideMenu) setOpen(false)
        }

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false)
        }

        document.addEventListener('pointerdown', handlePointerDown)
        document.addEventListener('keydown', handleEscape)
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown)
            document.removeEventListener('keydown', handleEscape)
        }
    }, [open])

    if (items.length === 0) return null

    const menuBody = (
        <AnimatedHeight isOpen={open} duration={220}>
            <div className={cn(
                'rounded-xl border border-white/10 bg-sparkle-card p-1 shadow-2xl shadow-black/60',
                presentation === 'inline'
                    ? inlineDirection === 'up'
                        ? 'origin-bottom-right animate-scaleIn'
                        : 'origin-top-right animate-scaleIn'
                    : menuPosition?.originClassName
            )}>
                {items.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        disabled={item.disabled}
                        onClick={() => {
                            setOpen(false)
                            void item.onSelect()
                        }}
                        className={cn(
                            'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors',
                            item.disabled
                                ? 'cursor-not-allowed text-white/20'
                                : item.danger
                                    ? 'text-red-200 hover:bg-red-500/15 hover:text-red-100'
                                    : 'text-white/75 hover:bg-white/10 hover:text-white'
                        )}
                    >
                        {item.icon && <span className="shrink-0">{item.icon}</span>}
                        <span>{item.label}</span>
                    </button>
                ))}
            </div>
        </AnimatedHeight>
    )

    return (
        <div ref={rootRef} className="relative">
            <button
                ref={buttonRef}
                type="button"
                onClick={(event) => {
                    event.stopPropagation()
                    setOpen((current) => !current)
                }}
                className={cn(
                    'h-7 w-7 inline-flex items-center justify-center rounded-[4px] border-0 text-white/45 transition-colors hover:bg-white/10 hover:text-white',
                    buttonClassName,
                    open && (openButtonClassName || 'border-0 bg-white/10 text-white opacity-100')
                )}
                title={title}
            >
                {triggerIcon || <MoreVertical size={15} className="mx-auto" />}
            </button>

            {open && presentation === 'inline' ? (
                <div
                    ref={menuRef}
                    className={cn(
                        'absolute right-0 z-[140] min-w-[180px] overflow-hidden',
                        inlineDirection === 'up' ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
                        menuClassName
                    )}
                    onClick={(event) => event.stopPropagation()}
                >
                    {menuBody}
                </div>
            ) : null}

            {open && presentation === 'portal' && menuPosition && typeof document !== 'undefined' && createPortal(
                <div
                    ref={menuRef}
                    className={cn(
                        'fixed z-[140] min-w-[180px] overflow-hidden',
                        menuClassName
                    )}
                    style={{
                        top: `${menuPosition.top}px`,
                        left: `${menuPosition.left}px`
                    }}
                    onClick={(event) => event.stopPropagation()}
                >
                    {menuBody}
                </div>,
                document.body
            )}
        </div>
    )
}
