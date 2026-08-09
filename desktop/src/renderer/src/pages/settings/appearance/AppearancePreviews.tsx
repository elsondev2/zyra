import { Check } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import type { AccentColor } from '@/lib/settings'
import type { ThemeDefinition } from '@/lib/settings-theme-catalog'
import { cn } from '@/lib/utils'

export function AppearanceThemeCard({
    theme,
    label = theme.name,
    selected,
    onSelect
}: {
    theme: ThemeDefinition
    label?: string
    selected: boolean
    onSelect: () => void
}) {
    const { tokens } = theme
    return (
        <button
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={onSelect}
            className={cn(
                'group min-w-0 rounded-xl text-left outline-none transition-[transform,opacity] focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--settings-bg)]',
                selected ? 'opacity-100' : 'opacity-72 hover:-translate-y-0.5 hover:opacity-100'
            )}
            title={`${theme.name}: ${theme.description}`}
        >
            <div
                className="relative h-[138px] overflow-hidden rounded-[11px] border-2 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                style={{
                    backgroundColor: tokens.bg,
                    borderColor: selected ? 'var(--accent-primary)' : tokens.border
                }}
            >
                <div className="flex h-full overflow-hidden rounded-lg border" style={{ borderColor: tokens.border }}>
                    <div className="w-[31%] shrink-0 p-2" style={{ backgroundColor: tokens.card }}>
                        <div className="mb-3 flex items-center gap-1">
                            <span className="size-1.5 rounded-full" style={{ backgroundColor: theme.tokens.primary }} />
                            <span className="h-1.5 w-8 rounded-full" style={{ backgroundColor: tokens.textMuted }} />
                        </div>
                        <div className="space-y-2">
                            {[0.82, 0.62, 0.72, 0.48].map((width, index) => (
                                <div key={index} className="flex items-center gap-1.5">
                                    <span className="size-2 rounded-sm" style={{ backgroundColor: index === 0 ? theme.tokens.primary : tokens.accent }} />
                                    <span className="h-1.5 rounded-full" style={{ width: `${width * 100}%`, backgroundColor: index === 0 ? tokens.textDark : tokens.textMuted }} />
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="min-w-0 flex-1 p-2.5" style={{ backgroundColor: tokens.bg }}>
                        <div className="mb-2.5 h-1.5 w-1/2 rounded-full" style={{ backgroundColor: tokens.textMuted }} />
                        <div className="rounded-md border p-2" style={{ backgroundColor: tokens.card, borderColor: tokens.border }}>
                            <div className="mb-2 h-2 w-2/5 rounded-full" style={{ backgroundColor: tokens.textDarker }} />
                            <div className="space-y-2">
                                <div className="h-1.5 w-full rounded-full" style={{ backgroundColor: tokens.accent }} />
                                <div className="h-1.5 w-4/5 rounded-full" style={{ backgroundColor: tokens.accent }} />
                                <div className="h-1.5 w-3/5 rounded-full" style={{ backgroundColor: tokens.accent }} />
                            </div>
                        </div>
                    </div>
                </div>
                {selected ? (
                    <span className="absolute right-2 top-2 inline-flex size-5 items-center justify-center rounded-full bg-[var(--accent-primary)] text-[var(--accent-on-primary)] shadow-sm">
                        <Check size={12} strokeWidth={2.4} />
                    </span>
                ) : null}
            </div>
            <div className="flex min-w-0 items-center justify-between gap-2 px-1 pt-2">
                <span className={cn('truncate text-[12px] font-medium', selected ? 'text-[var(--settings-text)]' : 'text-[var(--settings-text-secondary)]')}>{label}</span>
                <span className="size-2.5 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: theme.tokens.primary }} />
            </div>
        </button>
    )
}

function SystemThemeHalf({ theme }: { theme: ThemeDefinition }) {
    const { tokens } = theme
    return (
        <div className="min-w-0 flex-1 p-2.5" style={{ backgroundColor: tokens.bg }}>
            <div className="mb-3 flex items-center gap-1.5">
                <span className="size-2 rounded-sm" style={{ backgroundColor: tokens.primary }} />
                <span className="h-1.5 w-8 rounded-full" style={{ backgroundColor: tokens.textMuted }} />
            </div>
            <div className="rounded-md border p-2" style={{ backgroundColor: tokens.card, borderColor: tokens.border }}>
                <div className="mb-2 h-2 w-1/2 rounded-full" style={{ backgroundColor: tokens.textDark }} />
                <div className="space-y-2">
                    <div className="h-1.5 w-full rounded-full" style={{ backgroundColor: tokens.accent }} />
                    <div className="h-1.5 w-4/5 rounded-full" style={{ backgroundColor: tokens.accent }} />
                    <div className="h-1.5 w-3/5 rounded-full" style={{ backgroundColor: tokens.accent }} />
                </div>
            </div>
        </div>
    )
}

export function AppearanceSystemThemeCard({
    darkTheme,
    lightTheme,
    selected,
    onSelect
}: {
    darkTheme: ThemeDefinition
    lightTheme: ThemeDefinition
    selected: boolean
    onSelect: () => void
}) {
    return (
        <button
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={onSelect}
            className={cn(
                'group min-w-0 rounded-xl text-left outline-none transition-[transform,opacity] focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--settings-bg)]',
                selected ? 'opacity-100' : 'opacity-72 hover:-translate-y-0.5 hover:opacity-100'
            )}
            title="Follow the Windows light or dark appearance"
        >
            <div
                className="relative h-[138px] overflow-hidden rounded-[11px] border-2 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                style={{
                    backgroundColor: darkTheme.tokens.bg,
                    borderColor: selected ? 'var(--accent-primary)' : 'var(--settings-border)'
                }}
            >
                <div className="flex h-full overflow-hidden rounded-lg border" style={{ borderColor: darkTheme.tokens.border }}>
                    <SystemThemeHalf theme={darkTheme} />
                    <div className="w-px shrink-0" style={{ backgroundColor: lightTheme.tokens.border }} />
                    <SystemThemeHalf theme={lightTheme} />
                </div>
                {selected ? (
                    <span className="absolute right-2 top-2 inline-flex size-5 items-center justify-center rounded-full bg-[var(--accent-primary)] text-[var(--accent-on-primary)] shadow-sm">
                        <Check size={12} strokeWidth={2.4} />
                    </span>
                ) : null}
            </div>
            <div className="flex min-w-0 items-center justify-between gap-2 px-1 pt-2">
                <span className={cn('truncate text-[12px] font-medium', selected ? 'text-[var(--settings-text)]' : 'text-[var(--settings-text-secondary)]')}>System default</span>
                <span className="flex size-2.5 shrink-0 overflow-hidden rounded-full border border-black/10">
                    <span className="h-full w-1/2" style={{ backgroundColor: darkTheme.tokens.bg }} />
                    <span className="h-full w-1/2" style={{ backgroundColor: lightTheme.tokens.card }} />
                </span>
            </div>
        </button>
    )
}

function CodeLine({ number, children, active = false, accent }: { number: number; children: ReactNode; active?: boolean; accent: string }) {
    return (
        <div className="grid grid-cols-[24px_minmax(0,1fr)] items-center text-[10px] leading-5" style={active ? { backgroundColor: `color-mix(in srgb, ${accent} 16%, transparent)` } : undefined}>
            <span className="pr-2 text-right opacity-35">{number}</span>
            <span className="min-w-0 truncate pr-2">{children}</span>
        </div>
    )
}

export function AppearanceCodePreview({ theme, accent, compact }: { theme: ThemeDefinition; accent: AccentColor; compact: boolean }) {
    const { tokens } = theme
    const style = {
        '--appearance-preview-comment': tokens.textMuted,
        '--appearance-preview-keyword': accent.secondary,
        '--appearance-preview-string': tokens.secondary
    } as CSSProperties

    return (
        <div
            aria-label={`Live ${theme.name} palette preview`}
            className="grid h-[124px] grid-cols-2 overflow-hidden rounded-xl border font-mono shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]"
            style={{ ...style, backgroundColor: tokens.bg, borderColor: tokens.border, color: tokens.textDark }}
        >
            <div className="min-w-0 border-r py-2" style={{ borderColor: tokens.border }}>
                <CodeLine number={1} accent={accent.primary}><span style={{ color: 'var(--appearance-preview-keyword)' }}>const</span> palette = {'{'}</CodeLine>
                <CodeLine number={2} accent={accent.primary}><span style={{ color: 'var(--appearance-preview-comment)' }}>  surface:</span> <span style={{ color: 'var(--appearance-preview-string)' }}>'sidebar'</span>,</CodeLine>
                <CodeLine number={3} accent={accent.primary} active><span style={{ color: 'var(--appearance-preview-comment)' }}>  accent:</span> <span style={{ color: accent.primary }}>'{accent.primary}'</span>,</CodeLine>
                <CodeLine number={4} accent={accent.primary}><span style={{ color: 'var(--appearance-preview-comment)' }}>  contrast:</span> <span style={{ color: tokens.text }}>balanced</span>,</CodeLine>
                <CodeLine number={5} accent={accent.primary}>{'};'}</CodeLine>
            </div>
            <div className="min-w-0 py-2" style={{ backgroundColor: tokens.card }}>
                <CodeLine number={1} accent={accent.primary}><span style={{ color: 'var(--appearance-preview-keyword)' }}>const</span> workspace = {'{'}</CodeLine>
                <CodeLine number={2} accent={accent.primary} active><span style={{ color: 'var(--appearance-preview-comment)' }}>  background:</span> <span style={{ color: tokens.secondary }}>'{tokens.bg}'</span>,</CodeLine>
                <CodeLine number={3} accent={accent.primary} active><span style={{ color: 'var(--appearance-preview-comment)' }}>  foreground:</span> <span style={{ color: tokens.text }}>'{tokens.text}'</span>,</CodeLine>
                <CodeLine number={4} accent={accent.primary}><span style={{ color: 'var(--appearance-preview-comment)' }}>  density:</span> {compact ? 'compact' : 'comfortable'},</CodeLine>
                <CodeLine number={5} accent={accent.primary}>{'};'}</CodeLine>
            </div>
        </div>
    )
}
