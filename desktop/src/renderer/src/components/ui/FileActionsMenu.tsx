import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreVertical } from 'lucide-react'
import { dismissTransientMenus, TRANSIENT_MENU_DISMISS_EVENT } from '@/lib/transient-menu'
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
    density?: 'default' | 'compact'
}

export function FileActionsMenu({
    items,
    buttonClassName,
    openButtonClassName,
    menuClassName,
    title = 'Actions',
    triggerIcon,
    presentation = 'portal',
    preferredDirection,
    density = 'default'
}: FileActionsMenuProps) {
    const [open, setOpen] = useState(false)
    const rootRef = useRef<HTMLDivElement | null>(null)
    const buttonRef = useRef<HTMLButtonElement | null>(null)
    const menuRef = useRef<HTMLDivElement | null>(null)
    const [inlineDirection, setInlineDirection] = useState<'up' | 'down'>('down')
    const [menuPosition, setMenuPosition] = useState<{
        direction: 'up' | 'down'
        top?: number
        bottom?: number
        left: number
        maxHeight: number
    } | null>(null)
    const compact = density === 'compact'
    const resolvedMenuWidth = compact ? 176 : 180

    const updatePosition = (menuWidth = resolvedMenuWidth) => {
        const button = buttonRef.current
        if (!button) return

        const viewportPadding = 12
        const gap = 6
        const estimatedMenuHeight = Math.min(360, items.length * (compact ? 28 : 34) + 14)
        const rect = button.getBoundingClientRect()
        const spaceBelow = window.innerHeight - rect.bottom - viewportPadding
        const spaceAbove = rect.top - viewportPadding
        let direction: 'up' | 'down' = preferredDirection
            || (spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow ? 'up' : 'down')
        if (direction === 'down' && spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow) direction = 'up'
        if (direction === 'up' && spaceAbove < estimatedMenuHeight && spaceBelow > spaceAbove) direction = 'down'

        if (presentation === 'inline') {
            setInlineDirection(direction)
            setMenuPosition(null)
            return
        }

        const maxLeft = Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding)
        const left = Math.max(viewportPadding, Math.min(rect.right - menuWidth, maxLeft))
        setMenuPosition(direction === 'up'
            ? {
                direction,
                bottom: Math.max(viewportPadding, window.innerHeight - rect.top + gap),
                left,
                maxHeight: Math.max(1, spaceAbove - gap)
            }
            : {
                direction,
                top: Math.max(viewportPadding, rect.bottom + gap),
                left,
                maxHeight: Math.max(1, spaceBelow - gap)
            })
    }

    useEffect(() => {
        if (!open) return

        updatePosition()
        const handleResize = () => updatePosition(menuRef.current?.offsetWidth ?? resolvedMenuWidth)
        const rafId = window.requestAnimationFrame(handleResize)
        window.addEventListener('resize', handleResize)
        return () => {
            window.cancelAnimationFrame(rafId)
            window.removeEventListener('resize', handleResize)
        }
    }, [compact, items.length, open, preferredDirection, presentation, resolvedMenuWidth])

    useEffect(() => {
        if (!open || presentation !== 'portal') return

        const handleScroll = () => setOpen(false)

        window.addEventListener('scroll', handleScroll, true)
        return () => window.removeEventListener('scroll', handleScroll, true)
    }, [open, presentation])

    useEffect(() => {
        if (!open) return

        const dismiss = () => setOpen(false)
        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target
            if (!(target instanceof Node)) {
                dismiss()
                return
            }
            const isInsideButton = Boolean(rootRef.current?.contains(target))
            const isInsideMenu = Boolean(menuRef.current?.contains(target))
            if (!isInsideButton && !isInsideMenu) dismiss()
        }
        const handleFocusIn = (event: FocusEvent) => {
            const target = event.target
            if (!(target instanceof Node)) return
            if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return
            dismiss()
        }
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') dismiss()
        }

        document.addEventListener('pointerdown', handlePointerDown, true)
        document.addEventListener('focusin', handleFocusIn)
        document.addEventListener('keydown', handleEscape)
        window.addEventListener('blur', dismiss)
        window.addEventListener(TRANSIENT_MENU_DISMISS_EVENT, dismiss)
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown, true)
            document.removeEventListener('focusin', handleFocusIn)
            document.removeEventListener('keydown', handleEscape)
            window.removeEventListener('blur', dismiss)
            window.removeEventListener(TRANSIENT_MENU_DISMISS_EVENT, dismiss)
        }
    }, [open])

    if (items.length === 0) return null

    const menuDirection = presentation === 'inline' ? inlineDirection : menuPosition?.direction
    const menuBody = (
        <div
            role="menu"
            className={cn(
                'overflow-y-auto overscroll-contain rounded-xl border p-1.5 shadow-[0_18px_48px_rgba(0,0,0,0.34)]',
                compact
                    ? 'border-[var(--surface-divider)] bg-[var(--surface-floating)]'
                    : 'border-white/10 bg-sparkle-card',
                menuDirection === 'up' ? 'assistant-menu-in-up' : 'assistant-menu-in-down'
            )}
            style={{ maxHeight: menuPosition ? `${menuPosition.maxHeight}px` : 'calc(100vh - 24px)' }}
        >
            {items.map((item) => (
                <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    onClick={() => {
                        setOpen(false)
                        void item.onSelect()
                    }}
                    className={cn(
                        'flex w-full items-center gap-2 text-left transition-colors',
                        compact
                            ? 'min-h-7 rounded-sm px-2 py-1 text-[12px] leading-none'
                            : 'rounded-md px-2.5 py-2 text-xs',
                        item.disabled
                            ? compact ? 'cursor-not-allowed text-sparkle-text-muted/35' : 'cursor-not-allowed text-white/20'
                            : item.danger
                                ? 'text-red-200 hover:bg-red-500/15 hover:text-red-100'
                                : compact
                                    ? 'text-sparkle-text-secondary hover:bg-[var(--surface-hover)] hover:text-sparkle-text'
                                    : 'text-white/75 hover:bg-white/10 hover:text-white'
                    )}
                >
                    {item.icon && <span className="shrink-0">{item.icon}</span>}
                    <span>{item.label}</span>
                </button>
            ))}
        </div>
    )

    return (
        <div ref={rootRef} className="relative">
            <button
                ref={buttonRef}
                type="button"
                onClick={(event) => {
                    event.stopPropagation()
                    if (!open) {
                        dismissTransientMenus()
                        setMenuPosition(null)
                    }
                    setOpen(!open)
                }}
                className={cn(
                    'h-7 w-7 inline-flex items-center justify-center rounded-[4px] border-0 text-white/45 transition-colors hover:bg-white/10 hover:text-white',
                    buttonClassName,
                    open && (openButtonClassName || 'border-0 bg-white/10 text-white opacity-100')
                )}
                title={title}
                aria-haspopup="menu"
                aria-expanded={open}
            >
                {triggerIcon || <MoreVertical size={15} className="mx-auto" />}
            </button>

            {open && presentation === 'inline' ? (
                <div
                    ref={menuRef}
                    className={cn(
                        'absolute right-0 z-[140]',
                        compact ? 'w-44' : 'min-w-[180px]',
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
                        'fixed z-[340]',
                        compact ? 'w-44' : 'min-w-[180px]',
                        menuClassName
                    )}
                    style={{
                        top: menuPosition.top == null ? undefined : `${menuPosition.top}px`,
                        bottom: menuPosition.bottom == null ? undefined : `${menuPosition.bottom}px`,
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
