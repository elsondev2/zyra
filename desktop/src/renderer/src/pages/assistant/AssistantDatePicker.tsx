import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const FULL_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

function parseDateValue(value: string): Date {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date()
}

function formatDateValue(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function AssistantDatePicker({ value, max, onChange }: { value: string; max: string; onChange: (value: string) => void }) {
    const triggerRef = useRef<HTMLButtonElement | null>(null)
    const dialogRef = useRef<HTMLElement | null>(null)
    const [open, setOpen] = useState(false)
    const [visibleMonth, setVisibleMonth] = useState(() => {
        const date = parseDateValue(value)
        return new Date(date.getFullYear(), date.getMonth(), 1)
    })
    const selectedDate = parseDateValue(value)
    const maximumDate = parseDateValue(max)
    const monthLabel = useMemo(() => new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(visibleMonth), [visibleMonth])
    const displayValue = useMemo(() => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(selectedDate), [value])
    const days = useMemo(() => {
        const firstWeekday = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1).getDay()
        const count = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate()
        return [
            ...Array.from({ length: firstWeekday }, () => null),
            ...Array.from({ length: count }, (_, index) => new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), index + 1))
        ]
    }, [visibleMonth])

    useEffect(() => {
        if (!open) return
        const frame = window.requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus())
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.stopImmediatePropagation()
                setOpen(false)
                window.requestAnimationFrame(() => triggerRef.current?.focus())
                return
            }
            if (event.key !== 'Tab' || !dialogRef.current) return
            const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled])')]
            if (focusable.length === 0) return
            const first = focusable[0]
            const last = focusable[focusable.length - 1]
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault()
                last.focus()
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault()
                first.focus()
            }
        }
        window.addEventListener('keydown', handleKeyDown, true)
        return () => {
            window.cancelAnimationFrame(frame)
            window.removeEventListener('keydown', handleKeyDown, true)
        }
    }, [open])

    return (
        <>
            <button ref={triggerRef} type="button" onClick={() => setOpen(true)} className={cn('inline-flex h-9 min-w-36 items-center justify-between gap-2 rounded-md border px-2.5 text-[9px] transition-colors', open ? 'border-[var(--accent-primary)]/40 bg-[var(--accent-primary)]/[0.06] text-sparkle-text' : 'border-[var(--surface-divider)] text-sparkle-text-secondary hover:bg-[var(--surface-hover)]')} aria-haspopup="dialog" aria-expanded={open}><span>{displayValue}</span><CalendarDays size={12} className="text-sparkle-text-muted/60" /></button>
            {open && typeof document !== 'undefined' ? createPortal(
                <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-[color-mix(in_srgb,var(--color-bg)_72%,transparent)] p-4 backdrop-blur-[2px]" onPointerDown={(event) => {
                    if (event.target === event.currentTarget) {
                        setOpen(false)
                        window.requestAnimationFrame(() => triggerRef.current?.focus())
                    }
                }}>
                    <section ref={dialogRef} className="w-[300px] rounded-xl border border-[var(--surface-divider)] bg-[color-mix(in_srgb,var(--color-card)_98%,var(--color-bg))] p-3 shadow-[0_24px_80px_rgba(0,0,0,0.42)]" role="dialog" aria-modal="true" aria-label="Choose import start date">
                        <div className="flex h-8 items-center">
                            <button type="button" onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} className="inline-flex size-8 items-center justify-center rounded-md text-sparkle-text-muted hover:bg-[var(--surface-hover)] hover:text-sparkle-text" aria-label="Previous month"><ChevronLeft size={13} /></button>
                            <span className="min-w-0 flex-1 text-center text-[10px] font-semibold text-sparkle-text-secondary">{monthLabel}</span>
                            <button type="button" onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} disabled={visibleMonth.getFullYear() === maximumDate.getFullYear() && visibleMonth.getMonth() >= maximumDate.getMonth()} className="inline-flex size-8 items-center justify-center rounded-md text-sparkle-text-muted hover:bg-[var(--surface-hover)] hover:text-sparkle-text disabled:opacity-25" aria-label="Next month"><ChevronRight size={13} /></button>
                            <button type="button" onClick={() => {
                                setOpen(false)
                                window.requestAnimationFrame(() => triggerRef.current?.focus())
                            }} className="ml-1 inline-flex size-8 items-center justify-center rounded-md text-sparkle-text-muted hover:bg-[var(--surface-hover)] hover:text-sparkle-text" aria-label="Close date picker"><X size={12} /></button>
                        </div>
                        <div className="mt-1 grid grid-cols-7 text-center text-[7px] font-medium text-sparkle-text-muted/45">{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <span key={`${day}:${index}`} className="py-1">{day}</span>)}</div>
                        <div className="grid grid-cols-7 gap-0.5">
                            {days.map((date, index) => date ? (
                                <button key={formatDateValue(date)} type="button" disabled={date > maximumDate || date < new Date(1990, 0, 1)} aria-pressed={formatDateValue(date) === value} aria-label={FULL_DATE_FORMATTER.format(date)} onClick={() => {
                                    onChange(formatDateValue(date))
                                    setOpen(false)
                                    window.requestAnimationFrame(() => triggerRef.current?.focus())
                                }} className={cn('inline-flex size-9 items-center justify-center rounded-md text-[9px] tabular-nums transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-20', formatDateValue(date) === value ? 'bg-[var(--accent-primary)] text-[var(--accent-contrast)] hover:bg-[var(--accent-primary)]' : 'text-sparkle-text-secondary')}>{date.getDate()}</button>
                            ) : <span key={`blank:${index}`} className="size-9" />)}
                        </div>
                    </section>
                </div>,
                document.body
            ) : null}
        </>
    )
}
