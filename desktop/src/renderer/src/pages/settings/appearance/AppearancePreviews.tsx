import type { CSSProperties, ReactNode } from 'react'
import type { AccentColor, AppearanceCodeFont, AppearanceUiFont } from '@/lib/settings'
import { getAppearanceCodeFontStack, getAppearanceUiFontStack } from '@/lib/settings'
import type { ThemeDefinition } from '@/lib/settings-theme-catalog'

function CodeLine({ number, children, active = false, accent }: { number: number; children: ReactNode; active?: boolean; accent: string }) {
    return (
        <div className="grid grid-cols-[24px_minmax(0,1fr)] items-center text-[10px] leading-5" style={active ? { backgroundColor: `color-mix(in srgb, ${accent} 16%, transparent)` } : undefined}>
            <span className="pr-2 text-right opacity-35">{number}</span>
            <span className="min-w-0 truncate pr-2">{children}</span>
        </div>
    )
}

export function AppearanceWorkspacePreview({
    theme,
    accent,
    compact,
    uiFont,
    codeFont
}: {
    theme: ThemeDefinition
    accent: AccentColor
    compact: boolean
    uiFont: AppearanceUiFont
    codeFont: AppearanceCodeFont
}) {
    const { tokens } = theme
    const style = {
        '--preview-bg': tokens.bg,
        '--preview-card': tokens.card,
        '--preview-border': tokens.border,
        '--preview-border-strong': tokens.borderSecondary,
        '--preview-text': tokens.text,
        '--preview-text-strong': tokens.textDark,
        '--preview-text-secondary': tokens.textSecondary,
        '--preview-text-muted': tokens.textMuted,
        '--preview-surface-accent': tokens.accent,
        '--preview-theme-primary': tokens.primary,
        '--preview-theme-secondary': tokens.secondary,
        '--preview-accent-primary': accent.primary,
        '--preview-accent-secondary': accent.secondary,
        fontFamily: getAppearanceUiFontStack(uiFont)
    } as CSSProperties

    return (
        <div
            role="img"
            aria-label={`Live ${theme.name} preview showing Zyra's chat rail, conversation and code`}
            className="grid h-[238px] min-w-0 grid-cols-[96px_minmax(0,1fr)] overflow-hidden rounded-lg border text-[var(--preview-text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] sm:grid-cols-[140px_minmax(0,1fr)]"
            style={{ ...style, backgroundColor: 'var(--preview-bg)', borderColor: 'var(--preview-border-strong)' }}
        >
            <div className="min-w-0 border-r px-2 py-2.5 sm:px-3" style={{ backgroundColor: 'var(--preview-card)', borderColor: 'var(--preview-border)' }}>
                <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[-0.01em]">
                    <span className="size-2 rounded-sm" style={{ backgroundColor: 'var(--preview-theme-primary)' }} />
                    <span>Zyra</span>
                </div>
                <div className="mt-4 text-[8px] font-medium uppercase tracking-[0.08em]" style={{ color: 'var(--preview-text-secondary)' }}>Chats</div>
                <div className="mt-1.5 space-y-1">
                    <div className="rounded px-1.5 py-1.5 text-[9px] font-medium" style={{ backgroundColor: 'var(--preview-surface-accent)', color: 'var(--preview-text-strong)' }}>Appearance redesign</div>
                    <div className="px-1.5 py-1 text-[9px]" style={{ color: 'var(--preview-text-secondary)' }}>Release notes</div>
                    <div className="px-1.5 py-1 text-[9px]" style={{ color: 'var(--preview-text-secondary)' }}>Settings audit</div>
                </div>
            </div>

            <div className="flex min-w-0 flex-col">
                <div className="flex h-9 shrink-0 items-center justify-between border-b px-3" style={{ borderColor: 'var(--preview-border)' }}>
                    <span className="truncate text-[10px] font-semibold">Appearance redesign</span>
                    <span className="text-[8px]" style={{ color: 'var(--preview-text-secondary)' }}>Local</span>
                </div>
                <div className={compact ? 'min-h-0 flex-1 space-y-2 overflow-hidden px-3 py-2' : 'min-h-0 flex-1 space-y-3 overflow-hidden px-4 py-3'}>
                    <div className="ml-auto max-w-[82%] rounded-md px-2.5 py-1.5 text-[9px] leading-4" style={{ backgroundColor: 'var(--preview-surface-accent)', color: 'var(--preview-text-strong)' }}>
                        Make the settings easier to scan.
                    </div>
                    <div className="max-w-[94%] text-[9px] leading-4" style={{ color: 'var(--preview-text-strong)' }}>
                        Theme choices now stay compact, while exact colors live one level deeper.
                    </div>
                    <div className="overflow-hidden rounded-md border" style={{ backgroundColor: 'var(--preview-card)', borderColor: 'var(--preview-border)', fontFamily: getAppearanceCodeFontStack(codeFont) }}>
                        <div className="border-b px-2 py-1 text-[8px]" style={{ borderColor: 'var(--preview-border)', color: 'var(--preview-text-secondary)' }}>appearance.ts</div>
                        <div className="px-2 py-1.5 text-[9px] leading-4">
                            <div><span style={{ color: 'var(--preview-accent-secondary)' }}>const</span> density = <span style={{ color: 'var(--preview-theme-secondary)' }}>'{compact ? 'compact' : 'comfortable'}'</span></div>
                            <div><span style={{ color: 'var(--preview-accent-secondary)' }}>const</span> accent = <span style={{ color: 'var(--preview-accent-primary)' }}>'{accent.primary}'</span></div>
                        </div>
                    </div>
                </div>
                <div className="mx-3 mb-2.5 flex h-7 shrink-0 items-center justify-between rounded-md border px-2.5 text-[8px]" style={{ backgroundColor: 'var(--preview-card)', borderColor: 'var(--preview-border)', color: 'var(--preview-text-secondary)' }}>
                    <span>Ask Zyra...</span>
                    <span className="inline-flex size-4 items-center justify-center rounded" style={{ backgroundColor: 'var(--preview-accent-primary)', color: 'var(--accent-on-primary)' }}>↑</span>
                </div>
            </div>
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
