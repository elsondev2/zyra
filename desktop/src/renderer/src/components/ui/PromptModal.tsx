import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

interface PromptModalProps {
    isOpen: boolean
    title: string
    message?: string
    value: string
    onChange: (value: string) => void
    onConfirm: () => void
    onCancel: () => void
    confirmLabel?: string
    cancelLabel?: string
    placeholder?: string
    maxLength?: number
    valueSuffix?: string
    errorMessage?: string | null
}

export function PromptModal({
    isOpen,
    title,
    message,
    value,
    onChange,
    onConfirm,
    onCancel,
    confirmLabel = 'Save',
    cancelLabel = 'Cancel',
    placeholder,
    maxLength = 260,
    valueSuffix = '',
    errorMessage = null
}: PromptModalProps) {
    const inputRef = useRef<HTMLInputElement | null>(null)

    useEffect(() => {
        if (!isOpen) return
        const originalOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            document.body.style.overflow = originalOverflow
        }
    }, [isOpen])

    useEffect(() => {
        if (!isOpen) return
        const id = window.setTimeout(() => {
            inputRef.current?.focus()
            inputRef.current?.select()
        }, 0)
        return () => window.clearTimeout(id)
    }, [isOpen])

    if (!isOpen || typeof document === 'undefined') return null

    const canConfirm = value.trim().length > 0

    return createPortal(
        <div
            className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 backdrop-blur-md animate-fadeIn"
            onClick={onCancel}
        >
            {errorMessage && (
                <div className="pointer-events-none absolute top-[12%] left-1/2 z-[132] -translate-x-1/2 rounded-xl border border-red-500/40 bg-red-500/15 px-4 py-2 text-sm text-red-200 shadow-lg backdrop-blur-sm">
                    {errorMessage}
                </div>
            )}
            <div
                className="w-full max-w-md rounded-2xl border border-white/10 bg-sparkle-card p-6 shadow-2xl m-4"
                onClick={(event) => event.stopPropagation()}
            >
                <h3 className="text-base font-semibold text-sparkle-text break-words">{title}</h3>
                {message && (
                    <p className="mt-2 text-sm text-sparkle-text-secondary break-words">{message}</p>
                )}
                <div className="relative mt-4">
                    <input
                        ref={inputRef}
                        value={value}
                        onChange={(event) => onChange(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' && canConfirm) {
                                event.preventDefault()
                                onConfirm()
                            }
                            if (event.key === 'Escape') {
                                event.preventDefault()
                                onCancel()
                            }
                        }}
                        placeholder={placeholder}
                        maxLength={maxLength}
                        className={cn(
                            'w-full rounded-xl border border-white/10 bg-sparkle-bg px-3 py-2.5 text-sm text-sparkle-text outline-none transition-all focus:border-[var(--accent-primary)]/40 focus:ring-4 focus:ring-[var(--accent-primary)]/10 break-words',
                            valueSuffix && 'pr-20'
                        )}
                    />
                    {valueSuffix && (
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-white/10 bg-white/5 px-2 py-1 font-mono text-[11px] text-white/55">
                            {valueSuffix}
                        </span>
                    )}
                </div>
                <div className="mt-5 flex items-center justify-end gap-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-sparkle-text-secondary transition-colors hover:bg-white/[0.03] hover:border-white/20 hover:text-sparkle-text"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        disabled={!canConfirm}
                        onClick={onConfirm}
                        className={cn(
                            'rounded-lg border px-3 py-1.5 text-sm transition-colors shadow-sm',
                            canConfirm
                                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25'
                                : 'cursor-not-allowed border-white/10 bg-white/5 text-white/30'
                        )}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    )
}
