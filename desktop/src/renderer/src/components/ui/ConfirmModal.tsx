import { useEffect, useId, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

interface ConfirmModalProps {
    isOpen: boolean
    title: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
    onConfirm: (options?: { checkboxChecked: boolean }) => void
    onCancel: () => void
    variant?: 'danger' | 'warning' | 'info'
    fullscreen?: boolean
    checkboxLabel?: string
    visual?: ReactNode
}

export function ConfirmModal({
    isOpen,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    onConfirm,
    onCancel,
    variant = 'danger',
    fullscreen = false,
    checkboxLabel,
    visual
}: ConfirmModalProps) {
    const [checkboxChecked, setCheckboxChecked] = useState(false)
    const titleId = useId()
    const messageId = useId()

    useEffect(() => {
        if (!isOpen) return
        const originalOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            document.body.style.overflow = originalOverflow
        }
    }, [isOpen])

    useEffect(() => {
        if (isOpen) setCheckboxChecked(false)
    }, [isOpen])

    useEffect(() => {
        if (!isOpen) return
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onCancel()
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, onCancel])

    if (!isOpen || typeof document === 'undefined') return null

    return createPortal((
        <div
            className={cn(
                'fixed inset-0 z-[120] flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn',
                fullscreen ? 'bg-[var(--color-bg)]' : 'bg-black/60'
            )}
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onCancel()
            }}
        >
            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={messageId}
                className={cn(
                    'w-full overflow-hidden rounded-xl border border-white/10 bg-sparkle-card shadow-2xl animate-modal-in',
                    fullscreen ? 'max-w-xl' : 'max-w-[440px]'
                )}
            >
                <div className={cn('px-5 py-4', Boolean(visual) && 'flex items-start gap-3.5')}>
                    {visual ? <div className="mt-0.5 shrink-0">{visual}</div> : null}
                    <div className="min-w-0 flex-1">
                        <h2 id={titleId} className="text-[14px] font-semibold tracking-[-0.01em] text-sparkle-text">{title}</h2>
                        <p id={messageId} className="mt-1.5 text-[12px] leading-5 text-sparkle-text-secondary">
                            {message}
                        </p>
                        {checkboxLabel ? (
                            <label className="mt-4 flex w-fit cursor-pointer items-center gap-2 text-[12px] text-sparkle-text-muted transition-colors hover:text-sparkle-text-secondary">
                                <input
                                    type="checkbox"
                                    checked={checkboxChecked}
                                    onChange={(event) => setCheckboxChecked(event.currentTarget.checked)}
                                    className="size-3.5 shrink-0 rounded border-white/15 bg-transparent accent-[var(--accent-primary)]"
                                />
                                <span>{checkboxLabel}</span>
                            </label>
                        ) : null}
                    </div>
                </div>

                <footer className="flex items-center justify-end gap-2 border-t border-white/[0.08] px-4 py-3">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-md border border-white/10 px-3 text-[12px] font-medium text-sparkle-text-secondary transition-colors hover:border-white/20 hover:bg-white/[0.04] hover:text-sparkle-text"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        onClick={() => onConfirm({ checkboxChecked })}
                        className={cn(
                            'inline-flex h-8 items-center justify-center whitespace-nowrap rounded-md border px-3 text-[12px] font-semibold transition-colors',
                            variant === 'danger' && 'border-red-400/20 bg-red-500/10 text-red-100 hover:bg-red-500/18',
                            variant === 'warning' && 'border-amber-400/20 bg-amber-500/10 text-amber-100 hover:bg-amber-500/18',
                            variant === 'info' && 'border-[color-mix(in_srgb,var(--accent-primary)_24%,transparent)] bg-[color-mix(in_srgb,var(--accent-primary)_12%,transparent)] text-sparkle-text hover:bg-[color-mix(in_srgb,var(--accent-primary)_18%,transparent)]'
                        )}
                    >
                        {confirmLabel}
                    </button>
                </footer>
            </section>
        </div>
    ), document.body)
}
