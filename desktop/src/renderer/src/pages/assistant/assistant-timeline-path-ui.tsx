import { memo, useMemo, useState } from 'react'
import { Check, Copy, FileCode2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { copyTextToClipboard } from './assistant-timeline-helpers'
import { getAssistantRelativeFilePath } from './assistant-file-navigation'

export function isAbsoluteFilesystemPathLine(value: string): boolean {
    const trimmed = String(value || '').trim()
    if (!trimmed) return false
    if (/^[a-zA-Z]:[\\/]/.test(trimmed)) return true
    if (trimmed.startsWith('\\\\')) return true
    return false
}

export function normalizeComparablePath(value: string): string {
    return String(value || '').trim().replace(/\\/g, '/').toLowerCase()
}

export const TimelineCopyButton = memo(({ value, compact = false }: { value: string; compact?: boolean }) => {
    const [copied, setCopied] = useState(false)
    const [copyError, setCopyError] = useState<string | null>(null)

    const handleCopy = async () => {
        try {
            await copyTextToClipboard(value)
            setCopied(true)
            setCopyError(null)
            window.setTimeout(() => setCopied(false), 1600)
        } catch (error) {
            setCopyError(error instanceof Error ? error.message : 'Failed to copy')
            window.setTimeout(() => setCopyError(null), 2200)
        }
    }

    return (
        <button
            type="button"
            onClick={() => void handleCopy()}
            className={cn(
                'inline-flex items-center justify-center border transition-colors',
                compact ? 'h-6 w-6 rounded' : 'h-7 w-7 rounded-md',
                copied
                    ? 'border-[color-mix(in_srgb,var(--status-success)_24%,transparent)] bg-[color-mix(in_srgb,var(--status-success)_9%,transparent)] text-[color-mix(in_srgb,var(--status-success)_70%,var(--color-text))]'
                    : copyError
                        ? 'border-[color-mix(in_srgb,var(--status-danger)_24%,transparent)] bg-[color-mix(in_srgb,var(--status-danger)_9%,transparent)] text-[color-mix(in_srgb,var(--status-danger)_70%,var(--color-text))]'
                        : 'border-[var(--surface-divider)] bg-[var(--surface-hover)] text-sparkle-text-muted hover:border-[color-mix(in_srgb,var(--color-text)_18%,transparent)] hover:text-sparkle-text'
            )}
            title={copyError || (copied ? 'Copied' : 'Copy')}
        >
            {copied ? <Check size={11} /> : <Copy size={11} />}
        </button>
    )
})

export const TimelineFilePathRow = memo(({
    displayPath,
    fullPath,
    isNew = false,
    onOpen,
    onViewDiff
}: {
    displayPath: string
    fullPath: string
    isNew?: boolean
    onOpen?: (filePath: string) => Promise<void> | void
    onViewDiff?: () => void
}) => {
    return (
        <div className="mt-1.5 rounded-md border border-[color-mix(in_srgb,var(--accent-primary)_22%,var(--surface-divider))] bg-[color-mix(in_srgb,var(--accent-primary)_9%,var(--color-card))] px-2 py-1">
            <div className="flex items-center gap-2">
                {onOpen ? (
                    <button
                        type="button"
                        onClick={() => void onOpen(fullPath)}
                        className="min-w-0 flex-1 text-left font-mono text-[12px] leading-6 text-[color-mix(in_srgb,var(--accent-primary)_74%,var(--color-text))] transition-colors hover:text-sparkle-text"
                    >
                        <span className="flex items-center gap-2">
                            {isNew ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--status-info)]" /> : null}
                            <span className="block min-w-0 whitespace-pre-wrap break-all">{displayPath}</span>
                        </span>
                    </button>
                ) : (
                    <div className="min-w-0 flex-1 font-mono text-[12px] leading-6 text-[color-mix(in_srgb,var(--accent-primary)_74%,var(--color-text))]">
                        <span className="flex items-center gap-2">
                            {isNew ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--status-info)]" /> : null}
                            <span className="block min-w-0 whitespace-pre-wrap break-all">{displayPath}</span>
                        </span>
                    </div>
                )}
                <div className="flex shrink-0 items-center gap-1">
                    {onViewDiff ? (
                        <button
                            type="button"
                            onClick={onViewDiff}
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-[var(--surface-divider)] bg-[var(--surface-hover)] px-2 text-[10px] font-medium text-sparkle-text-secondary transition-colors hover:border-[color-mix(in_srgb,var(--color-text)_18%,transparent)] hover:bg-[var(--surface-active)] hover:text-sparkle-text"
                            title={`View AI runtime diff for ${displayPath}`}
                        >
                            <FileCode2 size={11} />
                            <span>View diff</span>
                        </button>
                    ) : null}
                    <TimelineCopyButton value={displayPath} />
                </div>
            </div>
        </div>
    )
})

export const TimelinePathAwareTextBlock = memo(({
    text,
    projectRootPath,
    onOpenFilePath,
    hiddenPaths
}: {
    text: string
    projectRootPath?: string | null
    onOpenFilePath?: (filePath: string) => Promise<void> | void
    hiddenPaths?: Set<string>
}) => {
    const lines = useMemo(() => text.split(/\r?\n/), [text])

    return (
        <div className="mt-2 space-y-1.5">
            {lines.map((line, index) => {
                const trimmed = line.trim()
                if (!trimmed) {
                    return <div key={`blank-${index}`} className="h-1" />
                }

                const normalizedTrimmed = normalizeComparablePath(trimmed)
                if (hiddenPaths?.has(normalizedTrimmed)) {
                    return null
                }

                if (onOpenFilePath && isAbsoluteFilesystemPathLine(trimmed)) {
                    return (
                        <TimelineFilePathRow
                            key={`path-${index}-${trimmed}`}
                            displayPath={getAssistantRelativeFilePath(trimmed, projectRootPath) || trimmed}
                            fullPath={trimmed}
                            onOpen={onOpenFilePath}
                        />
                    )
                }

                return (
                    <p key={`text-${index}`} className="whitespace-pre-wrap break-all font-mono text-[11px] leading-5 text-sparkle-text-muted">
                        {line}
                    </p>
                )
            })}
        </div>
    )
})
