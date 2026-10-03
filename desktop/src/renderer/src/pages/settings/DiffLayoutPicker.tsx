import { useId } from 'react'
import { Check } from 'lucide-react'
import type { FileDiffRenderMode } from '@/lib/settings'

const layouts = [
    { value: 'stacked', label: 'Stacked' },
    { value: 'split', label: 'Split' }
] as const

function DiffPreviewLine({ tone, width = '70%' }: { tone?: 'added' | 'removed'; width?: string }) {
    const color = tone === 'added' ? 'var(--status-success)' : tone === 'removed' ? 'var(--status-danger)' : 'var(--settings-text-faint)'
    return (
        <span className="flex h-2.5 items-center gap-1 px-1.5" style={{ color, background: tone ? `color-mix(in srgb, ${color} 12%, transparent)` : undefined }}>
            <span className="w-2 shrink-0 font-mono text-[10px] leading-none">{tone === 'added' ? '+' : tone === 'removed' ? '-' : ''}</span>
            <span className="h-[3px] rounded-sm bg-current opacity-60" style={{ width }} />
        </span>
    )
}

function DiffLayoutPreview({ mode }: { mode: FileDiffRenderMode }) {
    return (
        <span aria-hidden="true" data-diff-layout-preview={mode} className="mb-1.5 block overflow-hidden rounded border border-[var(--settings-border)] bg-[var(--settings-section)]">
            {mode === 'split' ? (
                <span className="grid grid-cols-2 divide-x divide-[var(--settings-border)]">
                    {(['removed', 'added'] as const).map(tone => (
                        <span key={tone} className="block min-w-0 pb-1">
                            <span className="mb-1 block border-b border-[var(--settings-border)] px-1.5 py-0.5 text-[9px] text-[var(--settings-text-muted)]">{tone === 'removed' ? 'Before' : 'After'}</span>
                            <DiffPreviewLine width="55%" />
                            <DiffPreviewLine tone={tone} width="75%" />
                            <DiffPreviewLine tone={tone} width="50%" />
                            <DiffPreviewLine width="65%" />
                        </span>
                    ))}
                </span>
            ) : (
                <span className="block pb-1">
                    <span className="mb-1 block border-b border-[var(--settings-border)] px-1.5 py-0.5 text-[9px] text-[var(--settings-text-muted)]">Before + after</span>
                    <DiffPreviewLine width="40%" />
                    <DiffPreviewLine tone="removed" width="65%" />
                    <DiffPreviewLine tone="added" width="75%" />
                    <DiffPreviewLine width="50%" />
                </span>
            )}
        </span>
    )
}

export function DiffLayoutPicker({ value, onChange }: {
    value: FileDiffRenderMode
    onChange: (value: FileDiffRenderMode) => void
}) {
    const name = useId()
    return (
        <div role="radiogroup" aria-label="File diff layout" className="ml-auto grid w-full max-w-[280px] grid-cols-2 gap-2 sm:w-[280px]">
            {layouts.map(option => (
                <label key={option.value} className="relative min-w-0 cursor-pointer">
                    <input
                        type="radio"
                        name={name}
                        value={option.value}
                        checked={value === option.value}
                        onChange={() => onChange(option.value)}
                        className="peer sr-only"
                        aria-label={option.label}
                    />
                    <span className="block h-full rounded-md border border-[var(--settings-border)] bg-[var(--settings-control)] p-2 transition-colors hover:border-[var(--settings-border-strong)] hover:bg-[var(--settings-control-hover)] peer-checked:border-[var(--accent-primary)] peer-checked:bg-[color-mix(in_srgb,var(--accent-primary)_6%,var(--settings-control))] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--accent-primary)]">
                        <DiffLayoutPreview mode={option.value} />
                        <span className="flex items-center justify-between gap-2 text-[12px] font-medium text-[var(--settings-text)]">
                            {option.label}
                            <span aria-hidden="true" className="inline-flex size-4 shrink-0 items-center justify-center text-[var(--accent-primary)]">{value === option.value ? <Check size={14} /> : null}</span>
                        </span>
                    </span>
                </label>
            ))}
        </div>
    )
}
