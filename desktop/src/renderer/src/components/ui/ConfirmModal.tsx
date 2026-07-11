import { cn } from '@/lib/utils'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

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
    checkboxLabel
}: ConfirmModalProps) {
    const [checkboxChecked, setCheckboxChecked] = useState(false)

    useEffect(() => {
        if (isOpen) {
            const originalOverflow = document.body.style.overflow
            document.body.style.overflow = 'hidden'
            return () => {
                document.body.style.overflow = originalOverflow
            }
        }
    }, [isOpen])

    useEffect(() => {
        if (isOpen) setCheckboxChecked(false)
    }, [isOpen])

    if (!isOpen) return null
    if (typeof document === 'undefined') return null

    const content = (
        <>
            <h3 className="text-base font-semibold text-sparkle-text">{title}</h3>
            <p className="mt-2 text-sm leading-5 text-sparkle-text-secondary">
                {message}
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                {checkboxLabel ? (
                    <label className="flex cursor-pointer items-center gap-2 text-[13px] text-sparkle-text-muted transition-colors hover:text-sparkle-text-secondary">
                        <input
                            type="checkbox"
                            checked={checkboxChecked}
                            onChange={(event) => setCheckboxChecked(event.currentTarget.checked)}
                            className="size-3.5 rounded border-white/15 bg-transparent accent-amber-300"
                        />
                        <span>{checkboxLabel}</span>
                    </label>
                ) : <span />}
                <div className="flex items-center justify-end gap-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-sparkle-text-secondary transition-colors hover:border-white/20 hover:bg-white/[0.03] hover:text-sparkle-text"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        onClick={() => onConfirm({ checkboxChecked })}
                        className={cn(
                            'rounded-lg border border-white/10 px-3 py-1.5 text-sm transition-colors shadow-sm hover:border-white/20',
                            variant === 'danger' && 'bg-red-500/15 text-red-200 hover:bg-red-500/25',
                            variant === 'warning' && 'bg-amber-500/15 text-amber-200 hover:bg-amber-500/25',
                            variant === 'info' && 'bg-sparkle-primary/15 text-white/90 hover:bg-sparkle-primary/25'
                        )}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </>
    )

    return createPortal((
        <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-md animate-fadeIn"
            onClick={onCancel}
        >
            <div
                className={cn(
                    fullscreen
                        ? 'h-screen w-screen max-w-none rounded-none border-0 bg-sparkle-bg/98 p-0 shadow-none'
                        : 'w-full max-w-md rounded-2xl border border-white/10 bg-sparkle-card p-6 shadow-2xl m-4'
                )}
                onClick={(e) => e.stopPropagation()}
            >
                {fullscreen ? (
                    <div className="flex h-full w-full items-center justify-center p-6">
                        <div
                            className={cn(
                                'w-full max-w-xl rounded-2xl border border-white/10 bg-sparkle-card p-6 shadow-2xl animate-modal-in'
                            )}
                        >
                            {content}
                        </div>
                    </div>
                ) : (
                    content
                )}
            </div>
        </div>
    ), document.body)
}
