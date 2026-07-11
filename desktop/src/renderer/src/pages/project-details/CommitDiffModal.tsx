import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import {
    Calendar,
    Check,
    Copy,
    GitCommitHorizontal,
    RefreshCw,
    User,
    X
} from 'lucide-react'
import { VscodeEntryIcon } from '@/components/ui/VscodeEntryIcon'
import { useSettings } from '@/lib/settings'
import { cn } from '@/lib/utils'
import { extractFilePatch, scanPatchFileSummaries, type FileDiffSummary } from '@/lib/diffRendering'
import type { GitCommit } from './types'
import { DiffStats } from './DiffStats'
import { FileDiffDetailModal } from './FileDiffDetailModal'

export function CommitDiffModal({ commit, diff, loading, onClose }: { commit: GitCommit, diff: string, loading: boolean, onClose: () => void }) {
    const { settings } = useSettings()
    const iconTheme = settings?.theme === 'light' ? 'light' : 'dark'
    const FILES_PER_PAGE = 15
    const [showCommitInfo, setShowCommitInfo] = useState(false)
    const [copiedHash, setCopiedHash] = useState(false)
    const [copiedPath, setCopiedPath] = useState<string | null>(null)
    const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null)
    const [parsedDiff, setParsedDiff] = useState<FileDiffSummary[]>([])
    const [isPreparingDiff, setIsPreparingDiff] = useState(false)
    const [currentPage, setCurrentPage] = useState(1)
    const filesScrollRef = useRef<HTMLDivElement | null>(null)

    const handleCopyPath = (path: string, e: MouseEvent) => {
        e.stopPropagation()
        navigator.clipboard.writeText(path)
        setCopiedPath(path)
        setTimeout(() => setCopiedPath(null), 1500)
    }

    useEffect(() => {
        if (loading || !diff.trim()) {
            setParsedDiff([])
            setIsPreparingDiff(false)
            return
        }

        let cancelled = false
        let frameId = 0
        let timeoutId = 0

        setIsPreparingDiff(true)
        frameId = window.requestAnimationFrame(() => {
            timeoutId = window.setTimeout(() => {
                if (cancelled) return
                const next = scanPatchFileSummaries(diff)
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
    }, [commit.hash, diff, loading])

    const commitMeta = useMemo(() => {
        const lines = diff.split('\n')
        const fullHashLine = lines.find(line => line.startsWith('commit '))
        const authorLine = lines.find(line => line.startsWith('Author:'))
        const authorDateLine = lines.find(line => line.startsWith('AuthorDate:'))
        const commitDateLine = lines.find(line => line.startsWith('CommitDate:'))

        const fullHash = (fullHashLine?.replace(/^commit\s+/, '').trim() || commit.hash).trim()

        let authorName = commit.author
        let authorEmail: string | null = null
        if (authorLine) {
            const raw = authorLine.replace(/^Author:\s*/, '').trim()
            const match = raw.match(/^(.*)\s<(.+)>$/)
            if (match) {
                authorName = match[1].trim() || commit.author
                authorEmail = match[2].trim()
            } else {
                authorName = raw || commit.author
            }
        }

        const authorDate = (authorDateLine?.replace(/^AuthorDate:\s*/, '').trim() || commit.date).trim()
        const commitDate = (commitDateLine?.replace(/^CommitDate:\s*/, '').trim() || commit.date).trim()

        const commitDateIdx = lines.findIndex(line => line.startsWith('CommitDate:'))
        const messageLines: string[] = []
        if (commitDateIdx >= 0) {
            let idx = commitDateIdx + 1
            while (idx < lines.length && lines[idx].trim() === '') idx += 1
            while (idx < lines.length && lines[idx].startsWith('    ')) {
                messageLines.push(lines[idx].replace(/^    /, ''))
                idx += 1
            }
        }

        return {
            fullHash,
            shortHash: fullHash.substring(0, 7),
            authorName,
            authorEmail,
            authorDate,
            commitDate,
            messageLines,
            isMerge: commit.parents.length > 1
        }
    }, [commit, diff])

    const totalAdditions = useMemo(() => parsedDiff.reduce((sum, file) => sum + file.additions, 0), [parsedDiff])
    const totalDeletions = useMemo(() => parsedDiff.reduce((sum, file) => sum + file.deletions, 0), [parsedDiff])
    const totalPages = useMemo(() => Math.max(1, Math.ceil(parsedDiff.length / FILES_PER_PAGE)), [parsedDiff.length, FILES_PER_PAGE])
    const paginatedFiles = useMemo(() => {
        const start = (currentPage - 1) * FILES_PER_PAGE
        return parsedDiff.slice(start, start + FILES_PER_PAGE)
    }, [currentPage, parsedDiff, FILES_PER_PAGE])
    const pageStart = parsedDiff.length === 0 ? 0 : ((currentPage - 1) * FILES_PER_PAGE) + 1
    const pageEnd = parsedDiff.length === 0 ? 0 : Math.min(currentPage * FILES_PER_PAGE, parsedDiff.length)
    const selectedFileDiff = useMemo<FileDiffSummary | null>(
        () => parsedDiff.find((file) => file.path === selectedFilePath) || null,
        [parsedDiff, selectedFilePath]
    )
    const selectedFilePatch = useMemo(
        () => (selectedFileDiff ? extractFilePatch(diff, selectedFileDiff.path, selectedFileDiff.previousPath) : ''),
        [diff, selectedFileDiff]
    )

    useEffect(() => {
        setCurrentPage((page) => Math.min(page, totalPages))
    }, [totalPages])

    useEffect(() => {
        setCurrentPage(1)
    }, [commit.hash])

    useEffect(() => {
        setSelectedFilePath(null)
    }, [commit.hash, diff])

    useEffect(() => {
        filesScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' })
    }, [currentPage, commit.hash])

    const copyCommitHash = async () => {
        const value = commitMeta.fullHash || commit.hash
        try {
            if (window.devscope.copyToClipboard) {
                await window.devscope.copyToClipboard(value)
            } else {
                await navigator.clipboard.writeText(value)
            }
            setCopiedHash(true)
            setTimeout(() => setCopiedHash(false), 1400)
        } catch {
            setCopiedHash(false)
        }
    }

    useEffect(() => {
        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'

        return () => {
            document.body.style.overflow = previousOverflow
        }
    }, [])

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center overscroll-none bg-black/60 backdrop-blur-md animate-fadeIn"
            onClick={onClose}
        >
            <div
                className="relative m-4 flex h-[90vh] max-h-[95vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-sparkle-card shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-start justify-between p-5 border-b border-white/5 bg-white/5">
                    <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-2">
                            <GitCommitHorizontal size={20} className="text-[var(--accent-primary)]" />
                            {commit.message}
                        </h3>
                        <div className="flex items-center gap-4 text-xs text-white/50">
                            <span className="font-mono bg-white/5 px-2 py-1 rounded text-white/60">
                                {commit.shortHash}
                            </span>
                            <span className="flex items-center gap-1">
                                <User size={12} /> {commit.author}
                            </span>
                            <span className="flex items-center gap-1">
                                <Calendar size={12} /> {new Date(commit.date).toLocaleString()}
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4 shrink-0">
                        {!loading && (
                            <button
                                onClick={() => setShowCommitInfo(true)}
                                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all border border-white/10"
                            >
                                More Info
                            </button>
                        )}
                        <button onClick={onClose} className="text-white/40 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {!loading && !isPreparingDiff && parsedDiff.length > 0 && (
                    <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 bg-black/20">
                        <div className="flex items-center gap-3 text-xs text-white/50">
                            <span className="flex items-center gap-1">
                                <VscodeEntryIcon pathValue="file" kind="file" theme={iconTheme} className="size-3 shrink-0" />
                                {parsedDiff.length} {parsedDiff.length === 1 ? 'file' : 'files'} changed
                            </span>
                            <span className="text-green-400">
                                +{totalAdditions}
                            </span>
                            <span className="text-red-400">
                                -{totalDeletions}
                            </span>
                        </div>
                    </div>
                )}

                <div className="grid flex-1 min-h-0 grid-cols-1 lg:grid-cols-[380px_minmax(0,1fr)] overflow-hidden bg-black/10">
                    <aside className="min-h-0 overflow-y-auto overscroll-contain border-b border-white/5 bg-black/20 p-4 custom-scrollbar [scrollbar-gutter:stable] lg:border-b-0 lg:border-r lg:border-r-white/10">
                        <div className="space-y-3">
                            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                                <p className="text-[11px] uppercase tracking-wide text-white/40">Commit Summary</p>
                                <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                                    <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-white/70">
                                        {commitMeta.isMerge ? 'Merge Commit' : 'Regular Commit'}
                                    </span>
                                    <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-white/70">
                                        {parsedDiff.length} {parsedDiff.length === 1 ? 'file' : 'files'}
                                    </span>
                                </div>
                                <div className="mt-3">
                                    <DiffStats additions={totalAdditions} deletions={totalDeletions} />
                                </div>
                            </div>

                            <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                                <div className="mb-1 text-[11px] uppercase tracking-wide text-white/40">Commit Hash</div>
                                <div className="flex items-start gap-2">
                                    <span className="min-w-0 break-all font-mono text-xs text-white/80">{commitMeta.fullHash}</span>
                                    <button
                                        onClick={copyCommitHash}
                                        className="shrink-0 rounded p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                                        title="Copy full hash"
                                    >
                                        {copiedHash ? <Check size={12} /> : <Copy size={12} />}
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
                                <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                                    <div className="mb-1 text-[11px] uppercase tracking-wide text-white/40">Author</div>
                                    <div className="text-sm text-white/85">{commitMeta.authorName}</div>
                                    {commitMeta.authorEmail && (
                                        <div className="mt-1 break-all font-mono text-[11px] text-white/50">{commitMeta.authorEmail}</div>
                                    )}
                                </div>
                                <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                                    <div className="mb-1 text-[11px] uppercase tracking-wide text-white/40">Authored</div>
                                    <div className="text-sm text-white/80">{new Date(commitMeta.authorDate).toLocaleString()}</div>
                                </div>
                                <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                                    <div className="mb-1 text-[11px] uppercase tracking-wide text-white/40">Committed</div>
                                    <div className="text-sm text-white/80">{new Date(commitMeta.commitDate).toLocaleString()}</div>
                                </div>
                                {commit.parents.length > 0 && (
                                    <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                                        <div className="mb-2 text-[11px] uppercase tracking-wide text-white/40">Parents</div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {commit.parents.map(parent => (
                                                <span key={parent} className="rounded bg-white/5 px-2 py-0.5 font-mono text-[11px] text-white/70 border border-white/10">
                                                    {parent}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                                <div className="mb-2 text-[11px] uppercase tracking-wide text-white/40">Message</div>
                                <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-6 text-white/78">
                                    {commitMeta.messageLines.length > 0 ? commitMeta.messageLines.join('\n') : commit.message}
                                </pre>
                            </div>
                        </div>
                    </aside>

                    <section className="min-h-0 flex flex-col overflow-hidden">
                        <div ref={filesScrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 custom-scrollbar [scrollbar-gutter:stable]">
                            {loading || isPreparingDiff ? (
                                <div className="flex flex-col items-center justify-center py-16 text-white/30">
                                    <RefreshCw size={32} className="mb-4 animate-spin" />
                                    <p className="text-sm">{loading ? 'Loading diff...' : 'Preparing diff...'}</p>
                                </div>
                            ) : parsedDiff.length > 0 ? (
                                <>
                                    <div className="space-y-2">
                                        {paginatedFiles.map((file) => {
                                            return (
                                                <div key={file.path} className="group rounded-xl border border-white/5 bg-black/30 p-3 transition-colors [content-visibility:auto] [contain-intrinsic-size:84px] hover:border-white/10">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div className="flex items-start gap-3 flex-1 min-w-0">
                                                            <VscodeEntryIcon
                                                                pathValue={file.path}
                                                                kind="file"
                                                                theme={iconTheme}
                                                                className="size-4 shrink-0"
                                                            />
                                                            <div className="min-w-0">
                                                                <p className="text-sm font-mono text-white/80 truncate">{file.path}</p>
                                                                {file.previousPath && (
                                                                    <p className="text-[11px] text-blue-300/80 truncate">from {file.previousPath}</p>
                                                                )}
                                                                <p className="text-xs text-white/45">{file.totalLines} diff lines</p>
                                                            </div>
                                                            <button
                                                                onClick={(e) => handleCopyPath(file.path, e)}
                                                                className={cn(
                                                                    'p-1 rounded transition-all shrink-0 opacity-0 group-hover:opacity-100',
                                                                    copiedPath === file.path
                                                                        ? 'text-emerald-400 bg-emerald-400/10'
                                                                        : 'text-white/40 hover:text-white hover:bg-white/10'
                                                                )}
                                                                title={copiedPath === file.path ? 'Copied!' : `Copy path: ${file.path}`}
                                                            >
                                                                {copiedPath === file.path ? <Check size={14} /> : <Copy size={14} />}
                                                            </button>
                                                        </div>
                                                        <div className="flex items-center gap-2 shrink-0">
                                                            <DiffStats additions={file.additions} deletions={file.deletions} compact />
                                                            <button
                                                                onClick={() => setSelectedFilePath(file.path)}
                                                                className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/75 transition-all hover:border-white/20 hover:bg-white/10 hover:text-white"
                                                            >
                                                                View Diff
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-16 text-white/30">
                                    <VscodeEntryIcon pathValue="file" kind="file" theme={iconTheme} className="size-12 mb-4 opacity-50" />
                                    <p className="text-sm">No changes to display</p>
                                </div>
                            )}
                        </div>

                        {!loading && !isPreparingDiff && (
                            <div className="flex items-center justify-between border-t border-white/10 bg-black/25 px-4 py-3 text-[11px] text-white/55">
                                <span>Showing {pageStart}-{pageEnd} of {parsedDiff.length}</span>
                                <div className="flex items-center gap-1.5">
                                    <button
                                        onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                                        disabled={currentPage <= 1}
                                        className="rounded-md border border-white/15 px-2 py-1 text-white/75 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
                                    >
                                        Prev
                                    </button>
                                    <span className="min-w-[54px] text-center text-white/65">{currentPage}/{totalPages}</span>
                                    <button
                                        onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                                        disabled={currentPage >= totalPages}
                                        className="rounded-md border border-white/15 px-2 py-1 text-white/75 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        )}
                    </section>
                </div>

                {showCommitInfo && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setShowCommitInfo(false)}>
                        <div
                            className="w-full max-w-3xl max-h-[80vh] overflow-y-auto custom-scrollbar rounded-2xl bg-sparkle-card border border-white/10 shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-white/[0.03]">
                                <h4 className="text-sm font-semibold text-white">Commit Info</h4>
                                <button
                                    onClick={() => setShowCommitInfo(false)}
                                    className="text-white/40 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            <div className="p-5 space-y-3 text-xs">
                                <p className="text-white/50 text-[11px]">
                                    Extra details hidden from the default view.
                                </p>

                                {commit.parents.length > 0 && (
                                    <div className="rounded-lg bg-black/25 border border-white/10 px-3 py-2">
                                        <div className="text-white/40 mb-1">Parents ({commit.parents.length})</div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {commit.parents.map(parent => (
                                                <span key={parent} className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[11px] font-mono text-white/70">
                                                    {parent}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="rounded-lg bg-black/25 border border-white/10 px-3 py-2">
                                    <div className="text-white/40 mb-1">Commit Message</div>
                                    <pre className="text-xs text-white/75 whitespace-pre-wrap break-words font-mono">
                                        {commitMeta.messageLines.length > 0 ? commitMeta.messageLines.join('\n') : commit.message}
                                    </pre>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <FileDiffDetailModal
                    isOpen={Boolean(selectedFileDiff)}
                    filePath={selectedFileDiff?.path || ''}
                    diff={selectedFilePatch}
                    fileDiff={selectedFileDiff?.fileDiff || null}
                    additions={selectedFileDiff?.additions || 0}
                    deletions={selectedFileDiff?.deletions || 0}
                    subtitle={selectedFileDiff ? `Commit diff - ${commit.shortHash}` : undefined}
                    onClose={() => setSelectedFilePath(null)}
                />
            </div>
        </div>
    )
}
