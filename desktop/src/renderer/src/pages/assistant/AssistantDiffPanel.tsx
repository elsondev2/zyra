import { memo, useEffect, useMemo, useState } from 'react'
import { Check, ChevronRight, Columns3, Copy, FileCode2, Rows3 } from 'lucide-react'
import { RawPatchFallback } from '@/components/ui/diff-viewer/RawPatchFallback'
import { VscodeEntryIcon } from '@/components/ui/VscodeEntryIcon'
import PatchDiffViewer from '@/components/ui/diff-viewer/PatchDiffViewer'
import {
    buildSyntheticSingleFilePatch,
    extractFilePatch,
    parsePatchForRendering,
    resolveFileDiffPath,
    scanPatchFileSummaries,
    summarizeFileDiff
} from '@/lib/diffRendering'
import { useSettings } from '@/lib/settings'
import { cn } from '@/lib/utils'
import { DiffStats } from '@/pages/project-details/DiffStats'
import type { AssistantDiffTarget } from './assistant-diff-types'

export const AssistantDiffPanel = memo(function AssistantDiffPanel(props: {
    open: boolean
    compact?: boolean
    selectedDiff: AssistantDiffTarget | null
    onClose: () => void
}) {
    const { open, compact = false, selectedDiff, onClose } = props
    const { settings } = useSettings()
    const iconTheme = settings.theme === 'light' ? 'light' : 'dark'
    const [copied, setCopied] = useState(false)
    const [renderMode, setRenderMode] = useState<'stacked' | 'split'>('stacked')
    const summaries = useMemo(
        () => selectedDiff ? scanPatchFileSummaries(selectedDiff.patch) : [],
        [selectedDiff]
    )
    const parsedDiff = useMemo(
        () => parsePatchForRendering(
            selectedDiff?.patch || '',
            `assistant-diff:${selectedDiff?.activityId || 'empty'}:${selectedDiff?.filePath || 'none'}`
        ),
        [selectedDiff]
    )
    const matchedSummary = useMemo(() => {
        if (!selectedDiff) return null
        const normalizedFilePath = selectedDiff.filePath.replace(/\\/g, '/')
        const normalizedPreviousPath = selectedDiff.previousPath?.replace(/\\/g, '/')
        return summaries.find((summary) => {
            if (summary.path === normalizedFilePath) return true
            if (normalizedPreviousPath && summary.previousPath === normalizedPreviousPath) return true
            return summary.previousPath === normalizedFilePath
        }) || null
    }, [selectedDiff, summaries])
    const resolvedFileDiff = useMemo(() => {
        if (!selectedDiff) return null
        const normalizedFilePath = selectedDiff.filePath.replace(/\\/g, '/')
        const normalizedPreviousPath = selectedDiff.previousPath?.replace(/\\/g, '/')
        return parsedDiff.files.find((entry) => {
            const currentPath = resolveFileDiffPath(entry)
            const previousPath = entry.prevName?.replace(/\\/g, '/')
            return currentPath === normalizedFilePath
                || (normalizedPreviousPath ? previousPath === normalizedPreviousPath : false)
                || previousPath === normalizedFilePath
        }) || null
    }, [parsedDiff.files, selectedDiff])
    const filePatch = useMemo(() => {
        if (!selectedDiff) return ''
        const extractedPatch = extractFilePatch(selectedDiff.patch, selectedDiff.filePath, selectedDiff.previousPath)
        if (extractedPatch) return extractedPatch
        const syntheticPatch = buildSyntheticSingleFilePatch(
            selectedDiff.patch,
            selectedDiff.displayPath || selectedDiff.filePath,
            selectedDiff.previousPath,
            { isNew: selectedDiff.isNew }
        )
        if (syntheticPatch) return syntheticPatch
        if (!resolvedFileDiff && parsedDiff.files.length === 1) return parsedDiff.patch
        return ''
    }, [parsedDiff.files.length, parsedDiff.patch, resolvedFileDiff, selectedDiff])
    const displayStats = useMemo(() => {
        if (resolvedFileDiff) {
            const summary = summarizeFileDiff(resolvedFileDiff)
            return {
                additions: summary.additions,
                deletions: summary.deletions
            }
        }

        if (filePatch) {
            const summary = scanPatchFileSummaries(filePatch)[0] || null
            if (summary) {
                return {
                    additions: summary.additions,
                    deletions: summary.deletions
                }
            }
        }

        return {
            additions: matchedSummary?.additions ?? 0,
            deletions: matchedSummary?.deletions ?? 0
        }
    }, [filePatch, matchedSummary, resolvedFileDiff])

    useEffect(() => {
        setCopied(false)
    }, [selectedDiff?.activityId, selectedDiff?.filePath])

    const handleCopyPath = async () => {
        if (!selectedDiff?.filePath) return
        await navigator.clipboard.writeText(selectedDiff.filePath)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1200)
    }

    return (
        <div
            className={cn('relative overflow-hidden transition-all duration-300', open ? 'opacity-100' : 'pointer-events-none opacity-0')}
            style={{ width: open ? (compact ? '360px' : '460px') : '0px' }}
        >
            <aside className="flex h-full min-h-0 flex-col border-l border-white/10 bg-sparkle-bg">
                <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--accent-primary)]">
                                <FileCode2 size={11} />
                                Diff
                            </span>
                            {selectedDiff?.isNew ? (
                                <span className="rounded-md border border-sky-400/25 bg-sky-500/[0.10] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-sky-200">
                                    New file
                                </span>
                            ) : null}
                            {selectedDiff?.provisional ? (
                                <span className="rounded-md border border-amber-400/25 bg-amber-500/[0.10] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-amber-200">
                                    Live preview
                                </span>
                            ) : null}
                            {selectedDiff?.truncated ? (
                                <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-white/45">
                                    Truncated
                                </span>
                            ) : null}
                        </div>
                        <p className="mt-2 text-sm font-semibold text-sparkle-text">AI runtime diff</p>
                        {selectedDiff ? (
                            <div className="group/path mt-2 flex min-w-0 items-center gap-2">
                                <VscodeEntryIcon
                                    pathValue={selectedDiff.filePath}
                                    kind="file"
                                    theme={iconTheme}
                                    className="size-4 shrink-0"
                                />
                                <p className="truncate font-mono text-[11px] leading-5 text-sparkle-text-secondary" title={selectedDiff.filePath}>
                                    {selectedDiff.displayPath}
                                </p>
                                <button
                                    type="button"
                                    onClick={() => void handleCopyPath()}
                                    className={cn(
                                        'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] transition-all hover:border-white/20 hover:bg-white/[0.05]',
                                        copied
                                            ? 'opacity-100 text-emerald-300'
                                            : 'pointer-events-none opacity-0 text-sparkle-text-secondary group-hover/path:pointer-events-auto group-hover/path:opacity-100 hover:text-sparkle-text focus-visible:pointer-events-auto focus-visible:opacity-100'
                                    )}
                                    title={copied ? 'Copied' : 'Copy path'}
                                >
                                    {copied ? <Check size={11} /> : <Copy size={11} />}
                                </button>
                            </div>
                        ) : null}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-md border border-white/10 bg-white/[0.03] p-1.5 text-sparkle-text-secondary transition-colors hover:border-white/20 hover:bg-white/[0.05] hover:text-sparkle-text"
                        title="Close diff panel"
                    >
                        <ChevronRight size={14} />
                    </button>
                </div>

                {selectedDiff ? (
                    <>
                        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
                            <DiffStats additions={displayStats.additions} deletions={displayStats.deletions} className="gap-1.5" />
                            <div className="flex items-center gap-1">
                                <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-1">
                                    <button
                                        type="button"
                                        onClick={() => setRenderMode('stacked')}
                                        className={cn(
                                            'inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors',
                                            renderMode === 'stacked'
                                                ? 'border-white/10 bg-white/10 text-white'
                                                : 'border-transparent text-white/55 hover:border-white/10 hover:bg-white/[0.03] hover:text-white'
                                        )}
                                        title="Unified view"
                                    >
                                        <Rows3 size={12} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setRenderMode('split')}
                                        className={cn(
                                            'inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors',
                                            renderMode === 'split'
                                                ? 'border-white/10 bg-white/10 text-white'
                                                : 'border-transparent text-white/55 hover:border-white/10 hover:bg-white/[0.03] hover:text-white'
                                        )}
                                        title="Split view"
                                    >
                                        <Columns3 size={12} />
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="min-h-0 flex-1 bg-black/20">
                            {resolvedFileDiff ? (
                                <PatchDiffViewer fileDiff={resolvedFileDiff} mode={renderMode} />
                            ) : filePatch ? (
                                <PatchDiffViewer patch={filePatch} mode={renderMode} />
                            ) : (
                                <RawPatchFallback
                                    patch={selectedDiff.patch}
                                    notice={parsedDiff.error
                                        ? 'Falling back to raw diff view because patch parsing failed.'
                                        : 'Unable to isolate a single-file diff for this entry. Showing raw patch instead.'}
                                />
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex min-h-[220px] flex-1 items-center justify-center px-6 text-center">
                        <div>
                            <p className="text-sm text-sparkle-text-secondary">No diff selected.</p>
                            <p className="mt-1 text-[12px] text-sparkle-text-muted">Choose "View diff" on an edited file to inspect the runtime patch.</p>
                        </div>
                    </div>
                )}
            </aside>
        </div>
    )
})
