import { ArrowRightLeft, Minus, Plus, Save, Search, SlidersHorizontal, Undo2 } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { cn } from '@/lib/utils'

type PreviewEditorSettingsMenuProps = {
    enabled: boolean
    setFindRequestToken: Dispatch<SetStateAction<number>>
    setReplaceRequestToken: Dispatch<SetStateAction<number>>
    editorWordWrap: 'on' | 'off'
    setEditorWordWrap: Dispatch<SetStateAction<'on' | 'off'>>
    editorMinimapEnabled: boolean
    setEditorMinimapEnabled: Dispatch<SetStateAction<boolean>>
    editorFontSize: number
    setEditorFontSize: Dispatch<SetStateAction<number>>
    isDirty?: boolean
    isSaving?: boolean
    onSave?: () => void
    onRevert?: () => void
}

export function PreviewEditorSettingsMenu({
    enabled,
    setFindRequestToken,
    setReplaceRequestToken,
    editorWordWrap,
    setEditorWordWrap,
    editorMinimapEnabled,
    setEditorMinimapEnabled,
    editorFontSize,
    setEditorFontSize,
    isDirty = false,
    isSaving = false,
    onSave,
    onRevert
}: PreviewEditorSettingsMenuProps) {
    const [open, setOpen] = useState(false)
    const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null)
    const rootRef = useRef<HTMLDivElement | null>(null)
    const buttonRef = useRef<HTMLButtonElement | null>(null)
    const menuRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        if (!open) return
        const updatePosition = () => {
            const rect = buttonRef.current?.getBoundingClientRect()
            if (!rect) return
            setMenuPosition({
                top: Math.min(window.innerHeight - 12, rect.bottom + 6),
                left: Math.max(12, Math.min(window.innerWidth - 220, rect.right - 208))
            })
        }
        updatePosition()
        window.addEventListener('resize', updatePosition)
        return () => window.removeEventListener('resize', updatePosition)
    }, [open])

    useEffect(() => {
        if (!open) return
        const dismiss = (event: Event) => {
            const target = event.target as Node
            if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false)
        }
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false)
        }
        document.addEventListener('pointerdown', dismiss, true)
        window.addEventListener('keydown', handleKeyDown)
        return () => {
            document.removeEventListener('pointerdown', dismiss, true)
            window.removeEventListener('keydown', handleKeyDown)
        }
    }, [open])

    return (
        <div ref={rootRef} className="no-drag relative">
            <button
                ref={buttonRef}
                type="button"
                onClick={() => setOpen((current) => !current)}
                className={cn(
                    'inline-flex size-6 items-center justify-center rounded-md border border-transparent text-white/45 transition-colors hover:bg-white/[0.05] hover:text-white/82',
                    open && 'border-white/[0.08] bg-white/[0.07] text-white'
                )}
                title="Editor settings"
                aria-label="Editor settings"
                aria-haspopup="menu"
                aria-expanded={open}
            >
                <SlidersHorizontal size={13} />
            </button>

            {open && menuPosition && typeof document !== 'undefined' ? createPortal(
                <div
                    ref={menuRef}
                    className="assistant-menu-in-down fixed z-[340] w-52 rounded-lg border border-[var(--surface-divider)] bg-[var(--surface-floating)] p-1.5 text-[11px] shadow-[0_18px_48px_rgba(0,0,0,0.34)] backdrop-blur-xl"
                    style={{ top: menuPosition.top, left: menuPosition.left }}
                    role="menu"
                >
                    <div className="flex gap-1">
                        <button
                            type="button"
                            disabled={!enabled}
                            onClick={() => {
                                setFindRequestToken((current) => current + 1)
                                setOpen(false)
                            }}
                            className="flex min-h-8 flex-1 items-center gap-1.5 rounded-md px-2 text-sparkle-text-secondary transition-colors hover:bg-[var(--surface-hover)] hover:text-sparkle-text disabled:cursor-not-allowed disabled:opacity-35"
                        >
                            <Search size={12} /> Find
                        </button>
                        <button
                            type="button"
                            disabled={!enabled}
                            onClick={() => {
                                setReplaceRequestToken((current) => current + 1)
                                setOpen(false)
                            }}
                            className="flex min-h-8 flex-1 items-center gap-1.5 rounded-md px-2 text-sparkle-text-secondary transition-colors hover:bg-[var(--surface-hover)] hover:text-sparkle-text disabled:cursor-not-allowed disabled:opacity-35"
                        >
                            <ArrowRightLeft size={12} /> Replace
                        </button>
                    </div>
                    <div className="my-1 h-px bg-[var(--surface-divider)]" />
                    <button
                        type="button"
                        disabled={!enabled}
                        onClick={() => setEditorWordWrap((current) => current === 'on' ? 'off' : 'on')}
                        className="flex min-h-8 w-full items-center justify-between rounded-md px-2 text-sparkle-text-secondary transition-colors hover:bg-[var(--surface-hover)] hover:text-sparkle-text disabled:cursor-not-allowed disabled:opacity-35"
                    >
                        <span>Word wrap</span>
                        <span className="text-[10px] font-medium text-sparkle-text-muted">{editorWordWrap === 'on' ? 'On' : 'Off'}</span>
                    </button>
                    <button
                        type="button"
                        disabled={!enabled}
                        onClick={() => setEditorMinimapEnabled((current) => !current)}
                        className="flex min-h-8 w-full items-center justify-between rounded-md px-2 text-sparkle-text-secondary transition-colors hover:bg-[var(--surface-hover)] hover:text-sparkle-text disabled:cursor-not-allowed disabled:opacity-35"
                    >
                        <span>Minimap</span>
                        <span className="text-[10px] font-medium text-sparkle-text-muted">{editorMinimapEnabled ? 'On' : 'Off'}</span>
                    </button>
                    <div className="flex min-h-8 items-center justify-between px-2 text-sparkle-text-secondary">
                        <span>Font size</span>
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                disabled={!enabled || editorFontSize <= 11}
                                onClick={() => setEditorFontSize((current) => Math.max(11, current - 1))}
                                className="inline-flex size-6 items-center justify-center rounded-md hover:bg-[var(--surface-hover)] hover:text-sparkle-text disabled:opacity-30"
                                aria-label="Decrease editor font size"
                            >
                                <Minus size={11} />
                            </button>
                            <span className="w-6 text-center font-mono text-[10px] text-sparkle-text-muted">{editorFontSize}</span>
                            <button
                                type="button"
                                disabled={!enabled || editorFontSize >= 22}
                                onClick={() => setEditorFontSize((current) => Math.min(22, current + 1))}
                                className="inline-flex size-6 items-center justify-center rounded-md hover:bg-[var(--surface-hover)] hover:text-sparkle-text disabled:opacity-30"
                                aria-label="Increase editor font size"
                            >
                                <Plus size={11} />
                            </button>
                        </div>
                    </div>
                    {isDirty && onSave && onRevert ? (
                        <>
                            <div className="my-1 h-px bg-[var(--surface-divider)]" />
                            <button
                                type="button"
                                disabled={isSaving}
                                onClick={() => {
                                    if (isSaving) return
                                    onSave()
                                    setOpen(false)
                                }}
                                className="flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-sparkle-text-secondary transition-colors hover:bg-[var(--surface-hover)] hover:text-sparkle-text disabled:cursor-not-allowed disabled:opacity-35"
                            >
                                <Save size={12} /> {isSaving ? 'Saving…' : 'Save'}
                            </button>
                            <button
                                type="button"
                                disabled={isSaving}
                                onClick={() => {
                                    if (isSaving) return
                                    onRevert()
                                    setOpen(false)
                                }}
                                className="flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-sparkle-text-secondary transition-colors hover:bg-[var(--surface-hover)] hover:text-sparkle-text disabled:cursor-not-allowed disabled:opacity-35"
                            >
                                <Undo2 size={12} /> Discard
                            </button>
                        </>
                    ) : null}
                </div>,
                document.body
            ) : null}
        </div>
    )
}
