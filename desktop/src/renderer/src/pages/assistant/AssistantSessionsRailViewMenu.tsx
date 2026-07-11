import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, Check, Clock3, Folders, List, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import type {
    AssistantRailGroupMode,
    AssistantRailSortMode
} from './useAssistantPageSidebarState'

type ViewOption<T extends string> = {
    value: T
    label: string
    icon: React.ReactNode
}

const GROUP_OPTIONS: ViewOption<AssistantRailGroupMode>[] = [
    { value: 'project', label: 'By project', icon: <Folders size={13} /> },
    { value: 'flat', label: 'Flat list', icon: <List size={13} /> }
]

const SORT_OPTIONS: ViewOption<AssistantRailSortMode>[] = [
    { value: 'updated', label: 'Updated', icon: <Clock3 size={13} /> },
    { value: 'created', label: 'Created', icon: <CalendarDays size={13} /> }
]

function ViewSection<T extends string>(props: {
    label: string
    options: ViewOption<T>[]
    selected: T
    onSelect: (value: T) => void
}) {
    const { label, options, selected, onSelect } = props
    return (
        <div className="space-y-1">
            <p className="px-2 text-[10px] font-medium uppercase tracking-[0.18em] text-sparkle-text-muted/42">{label}</p>
            <div className="space-y-0.5">
                {options.map((option) => {
                    const active = option.value === selected
                    return (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => onSelect(option.value)}
                            className={cn(
                                'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors',
                                active
                                    ? 'bg-white/[0.06] text-sparkle-text'
                                    : 'text-sparkle-text-secondary hover:bg-white/[0.04] hover:text-sparkle-text'
                            )}
                        >
                            <span className={cn('shrink-0', active ? 'text-[var(--accent-primary)]' : 'text-sparkle-text-muted/55')}>
                                {option.icon}
                            </span>
                            <span className="flex-1">{option.label}</span>
                            <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
                                {active ? <Check size={12} className="text-[var(--accent-primary)]" /> : null}
                            </span>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

export function AssistantSessionsRailViewMenu(props: {
    groupMode: AssistantRailGroupMode
    sortMode: AssistantRailSortMode
    onGroupModeChange: (value: AssistantRailGroupMode) => void
    onSortModeChange: (value: AssistantRailSortMode) => void
    iconOnly?: boolean
}) {
    const {
        groupMode,
        sortMode,
        onGroupModeChange,
        onSortModeChange,
        iconOnly = false
    } = props

    const [open, setOpen] = useState(false)
    const rootRef = useRef<HTMLDivElement | null>(null)
    const buttonRef = useRef<HTMLButtonElement | null>(null)
    const menuRef = useRef<HTMLDivElement | null>(null)
    const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null)

    useEffect(() => {
        if (!open) return

        const updatePosition = () => {
            const button = buttonRef.current
            if (!button) return
            const rect = button.getBoundingClientRect()
            const viewportPadding = 12
            const width = menuRef.current?.offsetWidth ?? 200
            const height = menuRef.current?.offsetHeight ?? 280
            const gap = 8
            const maxLeft = Math.max(viewportPadding, window.innerWidth - width - viewportPadding)
            const maxTop = Math.max(viewportPadding, window.innerHeight - height - viewportPadding)
            setMenuPosition({
                top: Math.max(viewportPadding, Math.min(maxTop, rect.bottom + gap)),
                left: Math.max(viewportPadding, Math.min(maxLeft, rect.right - width))
            })
        }

        updatePosition()
        const rafId = window.requestAnimationFrame(updatePosition)
        window.addEventListener('resize', updatePosition)
        window.addEventListener('scroll', updatePosition, true)
        return () => {
            window.cancelAnimationFrame(rafId)
            window.removeEventListener('resize', updatePosition)
            window.removeEventListener('scroll', updatePosition, true)
        }
    }, [open])

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

    return (
        <div ref={rootRef} className="relative">
            <button
                ref={buttonRef}
                type="button"
                onClick={() => setOpen((current) => !current)}
                className={cn(
                    iconOnly
                        ? 'inline-flex h-6 w-6 items-center justify-center rounded-md border border-transparent bg-transparent text-sparkle-text-muted/45 transition-colors hover:bg-white/[0.04] hover:text-sparkle-text'
                        : 'inline-flex h-8 items-center gap-1.5 rounded-full border border-transparent bg-white/[0.03] px-3 text-[11px] font-medium text-sparkle-text-secondary transition-colors hover:bg-white/[0.05] hover:text-sparkle-text',
                    open && 'bg-white/[0.06] text-sparkle-text'
                )}
                title="Sidebar view options"
            >
                <SlidersHorizontal size={12} className="shrink-0" />
                {!iconOnly ? <span>View</span> : null}
            </button>

            {open && menuPosition && typeof document !== 'undefined' ? createPortal(
                <div
                    ref={menuRef}
                    className="fixed z-[170] w-[200px] overflow-hidden rounded-2xl border border-white/10 bg-sparkle-card p-1.5 shadow-[0_24px_60px_rgba(0,0,0,0.45)]"
                    style={{
                        top: `${menuPosition.top}px`,
                        left: `${menuPosition.left}px`
                    }}
                >
                    <ViewSection
                        label="Organize"
                        options={GROUP_OPTIONS}
                        selected={groupMode}
                        onSelect={(value) => {
                            onGroupModeChange(value)
                            setOpen(false)
                        }}
                    />
                    <div className="mx-2 my-1.5 h-px bg-white/6" />
                    <ViewSection
                        label="Sort by"
                        options={SORT_OPTIONS}
                        selected={sortMode}
                        onSelect={(value) => {
                            onSortModeChange(value)
                            setOpen(false)
                        }}
                    />
                </div>,
                document.body
            ) : null}
        </div>
    )
}
