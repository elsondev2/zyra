import type { ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ToastTone } from './types'

export function Field({
    label,
    children
}: {
    label: string
    children: ReactNode
}) {
    return (
        <div>
            <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-white/35">{label}</p>
            {children}
        </div>
    )
}

export function InlineHint({
    children,
    className
}: {
    children: ReactNode
    className?: string
}) {
    return (
        <div className={cn('rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white/65', className)}>
            {children}
        </div>
    )
}

export function StatusBanner({
    children,
    tone,
    className
}: {
    children: ReactNode
    tone: ToastTone
    className?: string
}) {
    return (
        <div
            className={cn(
                'rounded-xl border px-3 py-3 text-sm',
                tone === 'success' && 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100',
                tone === 'error' && 'border-red-400/20 bg-red-400/10 text-red-100',
                tone === 'info' && 'border-white/10 bg-black/20 text-white/70',
                className
            )}
        >
            <div className="flex items-start gap-2">
                <AlertCircle size={14} className="mt-0.5 shrink-0 opacity-80" />
                <span>{children}</span>
            </div>
        </div>
    )
}
