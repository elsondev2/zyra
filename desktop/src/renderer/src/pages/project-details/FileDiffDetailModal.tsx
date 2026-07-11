import { useEffect, useMemo, useState } from 'react'
import { Check, Columns3, Copy, RefreshCw, Rows3, X } from 'lucide-react'
import type { FileDiffMetadata } from '@pierre/diffs/react'
import { RawPatchFallback } from '@/components/ui/diff-viewer/RawPatchFallback'
import { VscodeEntryIcon } from '@/components/ui/VscodeEntryIcon'
import { useSettings } from '@/lib/settings'
import { cn } from '@/lib/utils'
import { DiffStats } from './DiffStats'
import PatchDiffViewer from '@/components/ui/diff-viewer/PatchDiffViewer'
import { parsePatchForRendering, resolveFileDiffPath } from '@/lib/diffRendering'

const DIFF_RENDER_MODE_STORAGE_KEY = 'devscope:project-details:diff-render-mode:v1'

interface FileDiffDetailModalProps {
    isOpen: boolean
    filePath: string
    diff: string
    fileDiff?: FileDiffMetadata | null
    loading?: boolean
    additions?: number
    deletions?: number
    status?: 'modified' | 'untracked' | 'added' | 'deleted' | 'renamed' | 'ignored' | 'unknown'
    subtitle?: string
    onClose: () => void
}

function getStatusTone(status?: FileDiffDetailModalProps['status']) {
    switch (status) {
        case 'modified':
            return 'bg-[#E2C08D]/20 text-[#E2C08D]'
        case 'untracked':
        case 'added':
            return 'bg-[#73C991]/20 text-[#73C991]'
        case 'deleted':
            return 'bg-[#FF6B6B]/20 text-[#FF6B6B]'
        case 'renamed':
            return 'bg-blue-500/20 text-blue-300'
        default:
            return 'bg-white/10 text-white/60'
    }
}

export function FileDiffDetailModal({
    isOpen,
    filePath,
    diff,
    fileDiff = null,
    loading = false,
    additions = 0,
    deletions = 0,
    status,
    subtitle,
    onClose
}: FileDiffDetailModalProps) {
    const { settings } = useSettings()
    const iconTheme = settings?.theme === 'light' ? 'light' : 'dark'
    const [copied, setCopied] = useState(false)
    const [renderMode, setRenderMode] = useState<'stacked' | 'split'>(() => {
        try {
            const stored = String(window.localStorage.getItem(DIFF_RENDER_MODE_STORAGE_KEY) || '').trim()
            return stored === 'split' ? 'split' : 'stacked'
        } catch {
            return 'stacked'
        }
    })
    const [parsedDiff, setParsedDiff] = useState(() => parsePatchForRendering('', 'file-detail:initial'))
    const [isPreparingDiff, setIsPreparingDiff] = useState(false)

    useEffect(() => {
        if (!isOpen || fileDiff) {
            setIsPreparingDiff(false)
            if (!diff) {
                setParsedDiff(parsePatchForRendering('', `file-detail:${filePath}`))
            }
            return
        }

        let cancelled = false
        let frameId = 0
        let timeoutId = 0
        const scope = `file-detail:${filePath}`

        setIsPreparingDiff(Boolean(diff))
        frameId = window.requestAnimationFrame(() => {
            timeoutId = window.setTimeout(() => {
                if (cancelled) return
                const next = parsePatchForRendering(diff, scope)
                if (cancelled) return
                setParsedDiff(next)
                setIsPreparingDiff(false)
            }, 0)
        })

        return () => {
            cancelled = true
            window.cancelAnimationFrame(frameId)
            window.clearTimeout(timeoutId)
        }
    }, [diff, fileDiff, filePath, isOpen])

    const resolvedFileDiff = useMemo(() => {
        if (fileDiff) return fileDiff

        const normalizedPath = filePath.replace(/\\/g, '/')
        return parsedDiff.files.find((entry) => {
            const currentPath = resolveFileDiffPath(entry)
            const previousPath = entry.prevName?.replace(/\\/g, '/')
            return currentPath === normalizedPath || previousPath === normalizedPath
        }) || parsedDiff.files[0] || null
    }, [fileDiff, filePath, parsedDiff.files])
    const hasDiff = Boolean(resolvedFileDiff || parsedDiff.patch)
    const isBusy = loading || isPreparingDiff

    useEffect(() => {
        try {
            window.localStorage.setItem(DIFF_RENDER_MODE_STORAGE_KEY, renderMode)
        } catch {
            // Ignore storage failures.
        }
    }, [renderMode])

    if (!isOpen) return null

    const handleCopyPath = async () => {
        await navigator.clipboard.writeText(filePath)
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
    }

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fadeIn p-4" onClick={onClose}>
            <div
                className="flex h-[92vh] max-h-[95vh] min-h-[420px] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-sparkle-card shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-white/10 bg-white/[0.03]">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <VscodeEntryIcon
                                pathValue={filePath}
                                kind="file"
                                theme={iconTheme}
                                className="size-4 shrink-0"
                            />
                            <h4 className="text-sm font-semibold text-white truncate">{filePath}</h4>
                            {status && (
                                <span className={cn('text-[10px] uppercase font-bold px-1.5 py-0.5 rounded', getStatusTone(status))}>
                                    {status}
                                </span>
                            )}
                        </div>
                        {subtitle && <p className="text-xs text-white/50">{subtitle}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <DiffStats additions={additions} deletions={deletions} />
                        {!loading && hasDiff && (
                            <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
                                <button
                                    onClick={() => setRenderMode('stacked')}
                                    className={cn(
                                        'inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-all',
                                        renderMode === 'stacked'
                                            ? 'border-white/10 bg-white/10 text-white'
                                            : 'border-transparent text-white/55 hover:border-white/10 hover:bg-white/[0.03] hover:text-white'
                                    )}
                                    title="Stacked view"
                                >
                                    <Rows3 size={13} />
                                </button>
                                <button
                                    onClick={() => setRenderMode('split')}
                                    className={cn(
                                        'inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-all',
                                        renderMode === 'split'
                                            ? 'border-white/10 bg-white/10 text-white'
                                            : 'border-transparent text-white/55 hover:border-white/10 hover:bg-white/[0.03] hover:text-white'
                                    )}
                                    title="Split view"
                                >
                                    <Columns3 size={13} />
                                </button>
                            </div>
                        )}
                        <button
                            onClick={() => { void handleCopyPath() }}
                            className={cn(
                                'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] transition-all hover:border-white/20 hover:bg-white/10',
                                copied
                                    ? 'text-emerald-300 bg-emerald-500/10'
                                    : 'text-white/50 hover:text-white'
                            )}
                            title={copied ? 'Copied' : 'Copy path'}
                        >
                            {copied ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                        <button
                            onClick={onClose}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-white/50 transition-all hover:border-white/20 hover:bg-white/10 hover:text-white"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 min-h-0 overflow-hidden bg-black/20">
                    {isBusy ? (
                        <div className="flex items-center justify-center py-16 text-white/30">
                            <RefreshCw size={18} className="animate-spin mr-2" />
                            <span className="text-sm">{loading ? 'Loading diff...' : 'Preparing diff...'}</span>
                        </div>
                    ) : hasDiff ? (
                        resolvedFileDiff ? (
                            <PatchDiffViewer fileDiff={resolvedFileDiff} mode={renderMode} />
                        ) : parsedDiff.error ? (
                            <RawPatchFallback
                                patch={parsedDiff.patch}
                                notice="Falling back to raw diff view because patch parsing failed."
                            />
                        ) : (
                            <PatchDiffViewer patch={parsedDiff.patch} mode={renderMode} />
                        )
                    ) : (
                        <div className="flex items-center justify-center py-16 text-white/35">
                            <span className="text-sm">No diff available for this file.</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
