import { Check, ChevronDown, Edit3, FileText, PanelRight, Save, Undo2 } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatedHeight } from '@/components/ui/AnimatedHeight'
import { cn } from '@/lib/utils'

const MENU_ANIMATION_MS = 180

export type PreviewHeaderEditMenuAction = {
    id: string
    label: string
    icon?: ReactNode
    checked?: boolean
    disabled?: boolean
    onSelect: () => void
}

type PreviewHeaderEditMenuProps = {
    previewModeEnabled: boolean
    isEditable: boolean
    isEditMode: boolean
    isDirty: boolean
    isSaving: boolean
    loadingEditableContent?: boolean
    inspectorOpen?: boolean
    onToggleInspector?: () => void
    contextualActions?: PreviewHeaderEditMenuAction[]
    onModeChange: (mode: 'preview' | 'edit') => void
    onSave: () => void
    onRevert: () => void
}

export function PreviewHeaderEditMenu({
    previewModeEnabled,
    isEditable,
    isEditMode,
    isDirty,
    isSaving,
    loadingEditableContent,
    inspectorOpen = false,
    onToggleInspector,
    contextualActions = [],
    onModeChange,
    onSave,
    onRevert
}: PreviewHeaderEditMenuProps) {
    const [menuOpen, setMenuOpen] = useState(false)
    const [menuVisible, setMenuVisible] = useState(false)
    const controlRef = useRef<HTMLDivElement | null>(null)
    const menuRef = useRef<HTMLDivElement | null>(null)
    const closeTimerRef = useRef<number | null>(null)

    const canSwitchToEdit = isEditable && !loadingEditableContent
    const canToggleMode = previewModeEnabled && (isEditMode || canSwitchToEdit)
    const canOpenMenuFromPrimary = !previewModeEnabled
    const ActiveModeIcon = isEditMode ? Edit3 : FileText
    const activeModeLabel = isEditMode ? 'Edit' : 'Preview'

    const openMenu = () => {
        if (closeTimerRef.current !== null) {
            window.clearTimeout(closeTimerRef.current)
            closeTimerRef.current = null
        }
        setMenuVisible(true)
        window.requestAnimationFrame(() => setMenuOpen(true))
    }

    const closeMenu = () => {
        if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
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
            if (menuRef.current?.contains(target) || controlRef.current?.contains(target)) return
            closeMenu()
        }
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') closeMenu()
        }
        const handleBlur = () => closeMenu()
        document.addEventListener('pointerdown', handlePointerDown, true)
        window.addEventListener('keydown', handleEscape)
        window.addEventListener('blur', handleBlur)
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown, true)
            window.removeEventListener('keydown', handleEscape)
            window.removeEventListener('blur', handleBlur)
        }
    }, [menuVisible])

    useEffect(() => () => {
        if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
    }, [])

    const toggleMenu = () => {
        if (menuVisible && menuOpen) closeMenu()
        else openMenu()
    }

    const handlePrimaryAction = () => {
        if (!previewModeEnabled) {
            toggleMenu()
            return
        }
        if (isEditMode) {
            onModeChange('preview')
            return
        }
        if (canSwitchToEdit) onModeChange('edit')
    }

    const rowClassName = 'flex h-7 w-full items-center gap-2 rounded-[4px] px-2 text-left text-[11px] transition-colors'
    const normalRowClassName = 'text-sparkle-text-secondary hover:bg-[var(--surface-hover)] hover:text-sparkle-text'
    const activeRowClassName = 'bg-[var(--surface-active)] text-sparkle-text'
    const disabledRowClassName = 'cursor-not-allowed text-sparkle-text-muted/45 hover:bg-transparent'
    const divider = <div className="my-1 h-px bg-[var(--surface-divider)]" aria-hidden="true" />

    return (
        <div className="relative inline-flex" ref={controlRef}>
            <div className={cn(
                'inline-flex overflow-hidden rounded-md border border-[var(--surface-divider)] bg-[var(--surface-floating)] transition-[border-color,border-radius,box-shadow] duration-150',
                menuVisible && 'rounded-b-none border-b-transparent shadow-[0_10px_24px_rgba(0,0,0,0.16)]'
            )}>
                <button
                    type="button"
                    onClick={handlePrimaryAction}
                    disabled={!canToggleMode && !canOpenMenuFromPrimary}
                    className={cn(
                        'inline-flex h-6 min-w-[112px] items-center gap-1.5 px-2.5 text-[11px] transition-colors',
                        canToggleMode || canOpenMenuFromPrimary
                            ? 'text-sparkle-text hover:bg-[var(--surface-hover)]'
                            : 'cursor-not-allowed text-sparkle-text-muted/45'
                    )}
                    title={previewModeEnabled ? `Switch to ${isEditMode ? 'preview' : 'edit'} mode` : 'File view actions'}
                >
                    {ActiveModeIcon ? <ActiveModeIcon size={12} className="shrink-0" /> : null}
                    <span className="min-w-0 flex-1 truncate text-left">{activeModeLabel}</span>
                    {isDirty ? <span className="size-1.5 shrink-0 rounded-full bg-amber-300/85" aria-label="Unsaved changes" /> : null}
                </button>
                <button
                    type="button"
                    onClick={toggleMenu}
                    className="inline-flex h-6 w-7 items-center justify-center border-l border-[var(--surface-divider)] text-sparkle-text-muted transition-colors hover:bg-[var(--surface-hover)] hover:text-sparkle-text"
                    title="File view menu"
                    aria-label="File view menu"
                    aria-haspopup="menu"
                    aria-expanded={menuVisible && menuOpen}
                >
                    <ChevronDown className={cn('size-3.5 transition-transform duration-150', menuVisible && menuOpen && 'rotate-180')} />
                </button>
            </div>

            {menuVisible ? (
                <div
                    ref={menuRef}
                    className="absolute left-0 top-full z-[160] -mt-px w-full overflow-hidden rounded-b-[7px]"
                >
                    <AnimatedHeight isOpen={menuOpen} duration={MENU_ANIMATION_MS}>
                        <div className="rounded-b-[7px] border border-[var(--surface-divider)] border-t-transparent bg-[var(--surface-floating)] p-1 shadow-[0_14px_34px_rgba(0,0,0,0.32)]">
                            {previewModeEnabled ? (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onModeChange('preview')
                                            closeMenu()
                                        }}
                                        className={cn(rowClassName, !isEditMode ? activeRowClassName : normalRowClassName)}
                                    >
                                        <FileText size={12} className={!isEditMode ? 'text-[var(--accent-primary)]' : undefined} />
                                        <span className="min-w-0 flex-1 truncate">Preview</span>
                                        {!isEditMode ? <Check size={12} className="shrink-0 text-[var(--accent-primary)]" /> : null}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (!canSwitchToEdit) return
                                            onModeChange('edit')
                                            closeMenu()
                                        }}
                                        disabled={!canSwitchToEdit}
                                        className={cn(
                                            rowClassName,
                                            'mt-0.5',
                                            !canSwitchToEdit ? disabledRowClassName : isEditMode ? activeRowClassName : normalRowClassName
                                        )}
                                    >
                                        <Edit3 size={12} className={isEditMode ? 'text-[var(--accent-primary)]' : undefined} />
                                        <span className="min-w-0 flex-1 truncate">Edit</span>
                                        {isEditMode ? <Check size={12} className="shrink-0 text-[var(--accent-primary)]" /> : null}
                                    </button>
                                </>
                            ) : null}

                            {onToggleInspector ? (
                                <>
                                    {previewModeEnabled ? divider : null}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onToggleInspector()
                                            closeMenu()
                                        }}
                                        className={cn(rowClassName, inspectorOpen ? activeRowClassName : normalRowClassName)}
                                    >
                                        <PanelRight size={12} className={inspectorOpen ? 'text-[var(--accent-primary)]' : undefined} />
                                        <span className="min-w-0 flex-1 truncate">Outline / Inspector</span>
                                        {inspectorOpen ? <Check size={12} className="shrink-0 text-[var(--accent-primary)]" /> : null}
                                    </button>
                                </>
                            ) : null}

                            {contextualActions.length > 0 ? (
                                <>
                                    {previewModeEnabled || onToggleInspector ? divider : null}
                                    {contextualActions.map((action, index) => (
                                        <button
                                            key={action.id}
                                            type="button"
                                            disabled={action.disabled}
                                            onClick={() => {
                                                if (action.disabled) return
                                                action.onSelect()
                                                closeMenu()
                                            }}
                                            className={cn(
                                                rowClassName,
                                                index > 0 && 'mt-0.5',
                                                action.disabled ? disabledRowClassName : action.checked ? activeRowClassName : normalRowClassName
                                            )}
                                        >
                                            <span className={cn('inline-flex size-3 shrink-0 items-center justify-center', action.checked && 'text-[var(--accent-primary)]')}>
                                                {action.icon}
                                            </span>
                                            <span className="min-w-0 flex-1 truncate">{action.label}</span>
                                            {action.checked ? <Check size={12} className="shrink-0 text-[var(--accent-primary)]" /> : null}
                                        </button>
                                    ))}
                                </>
                            ) : null}

                            {isDirty ? (
                                <>
                                    {previewModeEnabled || onToggleInspector || contextualActions.length > 0 ? divider : null}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (isSaving) return
                                            onSave()
                                            closeMenu()
                                        }}
                                        disabled={isSaving}
                                        className={cn(rowClassName, isSaving ? disabledRowClassName : normalRowClassName)}
                                    >
                                        <Save size={12} />
                                        <span className="min-w-0 flex-1 truncate">{isSaving ? 'Saving…' : 'Save'}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (isSaving) return
                                            onRevert()
                                            closeMenu()
                                        }}
                                        disabled={isSaving}
                                        className={cn(rowClassName, 'mt-0.5', isSaving ? disabledRowClassName : normalRowClassName)}
                                    >
                                        <Undo2 size={12} />
                                        <span className="min-w-0 flex-1 truncate">Discard</span>
                                    </button>
                                </>
                            ) : null}
                        </div>
                    </AnimatedHeight>
                </div>
            ) : null}
        </div>
    )
}
