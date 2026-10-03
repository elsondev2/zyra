import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { ACCENT_COLORS, type AccentColor } from '@/lib/settings'
import { cn } from '@/lib/utils'
import { SettingsSwitch } from '../settings-layout'
import { suggestAccentCompanion } from './accent-companion'
import { ZyraColorPicker } from './ZyraColorPicker'

const PAGE_SIZE = 5
const CUSTOM_PAGE = Math.floor(ACCENT_COLORS.length / PAGE_SIZE)

function accentsMatch(left: AccentColor, right: AccentColor): boolean {
    return left.primary.toLowerCase() === right.primary.toLowerCase()
        && left.secondary.toLowerCase() === right.secondary.toLowerCase()
}

function pageForValue(value: AccentColor): number {
    const index = ACCENT_COLORS.findIndex((accent) => accentsMatch(accent, value))
    if (index < 0) return CUSTOM_PAGE
    return Math.floor(index / PAGE_SIZE)
}

export function AppearanceAccentPicker({ value, background, onChange }: {
    value: AccentColor
    background: string
    onChange: (accent: AccentColor) => void
}) {
    const groupName = useId()
    const pageCount = Math.ceil((ACCENT_COLORS.length + 1) / PAGE_SIZE)
    const [page, setPage] = useState(() => pageForValue(value))
    const [autoCompanion, setAutoCompanion] = useState(true)
    const [editingSecondary, setEditingSecondary] = useState(false)
    const currentPage = Math.min(Math.max(page, 0), pageCount - 1)
    const windowStart = currentPage * PAGE_SIZE
    const windowEnd = windowStart + PAGE_SIZE

    useEffect(() => {
        setPage((previous) => {
            const needed = pageForValue(value)
            const clamped = Math.min(Math.max(previous, 0), pageCount - 1)
            const visible = ACCENT_COLORS.findIndex((accent) => accentsMatch(accent, value))
            const selectedIndex = visible < 0 ? ACCENT_COLORS.length : visible
            if (selectedIndex >= clamped * PAGE_SIZE && selectedIndex < clamped * PAGE_SIZE + PAGE_SIZE) return previous
            return needed
        })
    }, [value, pageCount])

    const canGoPrev = currentPage > 0
    const canGoNext = currentPage < pageCount - 1
    const customSelected = value.name === 'Custom' || !ACCENT_COLORS.some((accent) => accentsMatch(accent, value))
    const updateCustomColor = (hex: string) => {
        onChange({
            name: 'Custom',
            primary: editingSecondary ? value.primary : hex,
            secondary: editingSecondary ? hex : autoCompanion ? suggestAccentCompanion(hex, background) : value.secondary
        })
    }

    return (
        <div className="ml-auto flex w-full items-center justify-end gap-1.5">
            <button
                type="button"
                aria-label="Show previous accent colors"
                disabled={!canGoPrev}
                onClick={() => setPage(currentPage - 1)}
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-[var(--settings-border)] bg-[var(--settings-control)] text-[var(--settings-text-muted)] transition-colors hover:border-[var(--settings-border-strong)] hover:text-[var(--settings-text)] disabled:cursor-not-allowed disabled:opacity-35"
            >
                <ChevronLeft size={13} aria-hidden="true" />
            </button>
            <div className="flex w-[172px] shrink-0 items-center justify-start gap-2" role="radiogroup" aria-label="Accent preset">
                {ACCENT_COLORS.map((accent, index) => {
                    const selected = accentsMatch(accent, value)
                    const visible = index >= windowStart && index < windowEnd
                    return (
                        <label
                            key={accent.name}
                            title={accent.name}
                            className={cn(
                                'relative inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full border outline-none transition-transform hover:scale-105 focus-within:ring-2 focus-within:ring-[var(--accent-primary)] focus-within:ring-offset-2 focus-within:ring-offset-[var(--settings-section)] motion-reduce:transition-none',
                                selected ? 'border-[var(--settings-text)]' : 'border-black/15',
                                !visible && 'hidden'
                            )}
                            style={{ background: `linear-gradient(135deg, ${accent.primary} 0 52%, ${accent.secondary} 52% 100%)` }}
                        >
                            <input type="radio" name={groupName} value={accent.name} checked={selected} aria-label={accent.name} onChange={() => onChange(accent)} className="sr-only" tabIndex={visible ? undefined : -1} />
                            {selected ? <Check size={13} strokeWidth={2.5} aria-hidden="true" className="text-white [filter:drop-shadow(0_1px_1px_rgba(0,0,0,0.7))]" /> : null}
                        </label>
                    )
                })}
                {currentPage === CUSTOM_PAGE ? <ZyraColorPicker
                    label={editingSecondary ? 'Companion accent' : 'Custom accent'}
                    value={editingSecondary ? value.secondary : value.primary}
                    onChange={updateCustomColor}
                    addSwatch
                    addSwatchBackground={customSelected ? `linear-gradient(135deg, ${value.primary} 0 52%, ${value.secondary} 52% 100%)` : undefined}
                    selected={customSelected}
                    onOpen={() => {
                        setEditingSecondary(false)
                        setAutoCompanion(value.name !== 'Custom' || value.secondary === suggestAccentCompanion(value.primary, background))
                    }}
                    footer={<div className="space-y-2.5">
                        <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--settings-text)]">
                            <span>Pick companion automatically</span>
                            <SettingsSwitch checked={autoCompanion} onCheckedChange={(enabled) => {
                                setAutoCompanion(enabled)
                                if (enabled) {
                                    setEditingSecondary(false)
                                    onChange({ name: 'Custom', primary: value.primary, secondary: suggestAccentCompanion(value.primary, background) })
                                }
                            }} label="Pick companion automatically" />
                        </div>
                        <div className="flex gap-1.5">
                            {([
                                { label: 'Primary', color: value.primary, secondary: false },
                                { label: 'Companion', color: value.secondary, secondary: true }
                            ] as const).map((choice) => <button
                                key={choice.label}
                                type="button"
                                disabled={choice.secondary && autoCompanion}
                                aria-pressed={editingSecondary === choice.secondary}
                                onClick={() => setEditingSecondary(choice.secondary)}
                                className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-[var(--settings-border)] px-1.5 py-1 text-[10px] text-[var(--settings-text-secondary)] transition-colors hover:border-[var(--settings-border-strong)] disabled:cursor-not-allowed disabled:opacity-55 aria-pressed:border-[var(--accent-primary)]"
                            >
                                <span className="size-3 shrink-0 rounded-full border border-black/20" style={{ backgroundColor: choice.color }} />
                                {choice.label}
                            </button>)}
                        </div>
                    </div>}
                /> : null}
            </div>
            <button
                type="button"
                aria-label="Show next accent colors"
                disabled={!canGoNext}
                onClick={() => setPage(currentPage + 1)}
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-[var(--settings-border)] bg-[var(--settings-control)] text-[var(--settings-text-muted)] transition-colors hover:border-[var(--settings-border-strong)] hover:text-[var(--settings-text)] disabled:cursor-not-allowed disabled:opacity-35"
            >
                <ChevronRight size={13} aria-hidden="true" />
            </button>
        </div>
    )
}
