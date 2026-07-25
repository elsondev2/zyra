import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { FileActionsMenuItem } from '@/components/ui/FileActionsMenu'
import { cn } from '@/lib/utils'

const PREVIEW_TREE_MENU_WIDTH_PX = 224
const PREVIEW_TREE_VIEWPORT_PADDING_PX = 8

export type PreviewTreeMenuAnchor = {
    left: number
    right: number
    top: number
    bottom: number
    width: number
}

export function getPreviewTreeMenuAnchor(rect: DOMRect): PreviewTreeMenuAnchor {
    return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width
    }
}

export function PreviewTreeContextMenu({
    items,
    anchor,
    onClose
}: {
    items: FileActionsMenuItem[]
    anchor: PreviewTreeMenuAnchor
    onClose: (options?: { restoreFocus?: boolean }) => void
}) {
    const menuRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        const focusFrameId = window.requestAnimationFrame(() => {
            menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true })
        })
        const handlePointerDown = (event: PointerEvent) => {
            if (!menuRef.current?.contains(event.target as Node)) onClose({ restoreFocus: false })
        }
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose({ restoreFocus: true })
        }
        const handleViewportChange = () => onClose({ restoreFocus: false })
        document.addEventListener('pointerdown', handlePointerDown)
        document.addEventListener('keydown', handleKeyDown)
        window.addEventListener('resize', handleViewportChange)
        window.addEventListener('blur', handleViewportChange)
        return () => {
            window.cancelAnimationFrame(focusFrameId)
            document.removeEventListener('pointerdown', handlePointerDown)
            document.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('resize', handleViewportChange)
            window.removeEventListener('blur', handleViewportChange)
        }
    }, [onClose])

    if (items.length === 0 || typeof document === 'undefined') return null
    const estimatedHeight = Math.min(360, items.length * 32 + 8)
    const preferredLeft = anchor.width <= 1 ? anchor.left : anchor.right - PREVIEW_TREE_MENU_WIDTH_PX
    const left = Math.max(
        PREVIEW_TREE_VIEWPORT_PADDING_PX,
        Math.min(window.innerWidth - PREVIEW_TREE_MENU_WIDTH_PX - PREVIEW_TREE_VIEWPORT_PADDING_PX, preferredLeft)
    )
    const openAbove = anchor.bottom + estimatedHeight + PREVIEW_TREE_VIEWPORT_PADDING_PX > window.innerHeight
        && anchor.top > window.innerHeight - anchor.bottom
    const top = openAbove
        ? Math.max(PREVIEW_TREE_VIEWPORT_PADDING_PX, anchor.top - estimatedHeight - 4)
        : Math.max(
            PREVIEW_TREE_VIEWPORT_PADDING_PX,
            Math.min(window.innerHeight - estimatedHeight - PREVIEW_TREE_VIEWPORT_PADDING_PX, anchor.bottom + 4)
        )

    return createPortal(
        <div
            ref={menuRef}
            data-file-tree-context-menu-root="true"
            role="menu"
            className="fixed z-[360] max-h-[calc(100vh-16px)] w-56 overflow-y-auto rounded-lg border border-white/10 bg-sparkle-card p-1 shadow-2xl shadow-black/60"
            style={{ left, top }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
                if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
                const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
                if (buttons.length === 0) return
                event.preventDefault()
                const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement)
                const nextIndex = event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                        ? buttons.length - 1
                        : event.key === 'ArrowUp'
                            ? (currentIndex <= 0 ? buttons.length - 1 : currentIndex - 1)
                            : (currentIndex + 1) % buttons.length
                buttons[nextIndex]?.focus()
            }}
        >
            {items.map((item) => (
                <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    onClick={() => {
                        onClose({ restoreFocus: false })
                        void item.onSelect()
                    }}
                    className={cn(
                        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                        item.danger
                            ? 'text-red-300 hover:bg-red-500/10 hover:text-red-200'
                            : 'text-sparkle-text-secondary hover:bg-white/[0.06] hover:text-sparkle-text'
                    )}
                >
                    <span className="inline-flex size-4 shrink-0 items-center justify-center">{item.icon}</span>
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                </button>
            ))}
        </div>,
        document.body
    )
}
