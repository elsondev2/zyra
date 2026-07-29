import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreVertical } from 'lucide-react'
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
    const [menuPosition, setMenuPosition] = useState<{
        direction: 'up' | 'down'
        top?: number
        bottom?: number
        left: number
    } | null>(null)

    const updatePosition = (menuWidth = 180) => {
        const button = buttonRef.current
        if (!button) return

        const viewportPadding = 12
        const gap = 6
        const estimatedMenuHeight = Math.min(360, items.length * 34 + 10)
        const rect = button.getBoundingClientRect()
        const spaceBelow = window.innerHeight - rect.bottom - viewportPadding
        const spaceAbove = rect.top - viewportPadding
        const direction: 'up' | 'down' = preferredDirection
            ? preferredDirection
            : (spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow ? 'up' : 'down')

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
                left
            }
            : {
                direction,
                top: Math.max(viewportPadding, rect.bottom + gap),
                left
            })
    }

    useEffect(() => {
        if (!open) return

        updatePosition()
        const handleResize = () => updatePosition(menuRef.current?.offsetWidth ?? 180)
        const rafId = window.requestAnimationFrame(handleResize)
        window.addEventListener('resize', handleResize)
        return () => {
            window.cancelAnimationFrame(rafId)
            window.removeEventListener('resize', handleResize)
        }
    }, [items.length, open, preferredDirection, presentation])

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

    const menuDirection = presentation === 'inline' ? inlineDirection : menuPosition?.direction
    const menuBody = (
        <div className={cn(
            'max-h-[calc(100vh-24px)] overflow-y-auto rounded-lg border border-white/10 bg-sparkle-card p-1 shadow-2xl shadow-black/60',
            menuDirection === 'up' ? 'assistant-menu-in-up' : 'assistant-menu-in-down'
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
                        'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors',
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
    )

    return (
        <div ref={rootRef} className="relative">
            <button
                ref={buttonRef}
                type="button"
                onClick={(event) => {
                    event.stopPropagation()
                    if (!open) setMenuPosition(null)
                    setOpen(!open)
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
