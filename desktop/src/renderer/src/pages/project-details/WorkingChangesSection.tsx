import { useEffect, useMemo, useState, type Dispatch, type MouseEvent, type SetStateAction } from 'react'
import { Check, Copy } from 'lucide-react'
import { VscodeEntryIcon } from '@/components/ui/VscodeEntryIcon'
import { cn } from '@/lib/utils'
import { DiffStats } from './DiffStats'
import type { DiffMode, WorkingChangeItem } from './workingChangesTypes'
import { getDiffCounts, getStatusBadge } from './workingChangesUtils'

const PAGE_SIZE = 10

type WorkingChangesSectionProps = {
    title: string
    files: WorkingChangeItem[]
    copiedPath: string | null
    pendingActionPath: string | null
    pendingRevertPath?: string | null
    loadingDiffKeys: Set<string>
    emptyText: string
    actionLabel: string
    secondaryActionAllLabel?: string
    diffMode: DiffMode
    onViewDiff: (file: WorkingChangeItem, mode: DiffMode) => Promise<void>
    onActionFile: (path: string) => Promise<void>
    onRevertFile?: (file: WorkingChangeItem) => void
    onActionAll: () => Promise<void>
    onSecondaryActionAll?: () => Promise<void>
    onEnsureStats?: (paths: string[]) => void
    setCopiedPath: Dispatch<SetStateAction<string | null>>
    onSetPendingActionPath: (path: string | null) => void
    iconTheme: 'light' | 'dark'
}

export function WorkingChangesSection({
    title,
    files,
    copiedPath,
    pendingActionPath,
    pendingRevertPath,
    loadingDiffKeys,
    emptyText,
    actionLabel,
    secondaryActionAllLabel,
    diffMode,
    onViewDiff,
    onActionFile,
    onRevertFile,
    onActionAll,
    onSecondaryActionAll,
    onEnsureStats,
    setCopiedPath,
    onSetPendingActionPath,
    iconTheme
}: WorkingChangesSectionProps) {
    const [currentPage, setCurrentPage] = useState(1)
    const sectionAdditions = useMemo(
        () => files.reduce((sum, file) => sum + getDiffCounts(file, diffMode).additions, 0),
        [diffMode, files]
    )
    const sectionDeletions = useMemo(
        () => files.reduce((sum, file) => sum + getDiffCounts(file, diffMode).deletions, 0),
        [diffMode, files]
    )
    const totalLineChanges = sectionAdditions + sectionDeletions
    const totalPages = Math.max(1, Math.ceil(files.length / PAGE_SIZE))
    const paginatedFiles = useMemo(() => {
        const start = (currentPage - 1) * PAGE_SIZE
        return files.slice(start, start + PAGE_SIZE)
    }, [files, currentPage])

    useEffect(() => {
        setCurrentPage((page) => Math.min(page, totalPages))
    }, [totalPages])

    useEffect(() => {
        const missingStatsPaths = paginatedFiles
            .filter((file) => file.statsLoaded !== true)
            .map((file) => file.path)

        if (missingStatsPaths.length > 0) {
            onEnsureStats?.(missingStatsPaths)
        }
    }, [onEnsureStats, paginatedFiles])

    const pageStart = files.length === 0 ? 0 : ((currentPage - 1) * PAGE_SIZE) + 1
    const pageEnd = files.length === 0 ? 0 : Math.min(currentPage * PAGE_SIZE, files.length)
    const loadedStatsCount = useMemo(
        () => files.filter((file) => file.statsLoaded === true).length,
        [files]
    )
    const hasPartialStats = loadedStatsCount < files.length

    const handleCopyPath = (path: string, event: MouseEvent) => {
        event.stopPropagation()
        navigator.clipboard.writeText(path)
        setCopiedPath(path)
        setTimeout(() => setCopiedPath(null), 1200)
    }

    return (
        <div className="space-y-2">
            <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-medium text-white/85">{title}</h4>
                            <span className="rounded-md border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/65">
                                {files.length} files
                            </span>
                        </div>
                        <p className="text-[11px] text-white/45">
                            {hasPartialStats
                                ? `Counting line changes... ${loadedStatsCount}/${files.length} files resolved`
                                : `Totals across all files: ${totalLineChanges} lines changed`}
                        </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        <DiffStats
                            additions={sectionAdditions}
                            deletions={sectionDeletions}
                            loading={hasPartialStats}
                            preserveValuesWhileLoading
                        />
                        <button
                            onClick={() => { void onActionAll() }}
                            disabled={files.length === 0 || pendingActionPath === '__all__'}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white/5 hover:bg-white/10 text-white/70 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                        >
                            {pendingActionPath === '__all__' ? 'Working...' : `${actionLabel} All`}
                        </button>
                        {secondaryActionAllLabel && onSecondaryActionAll ? (
                            <button
                                onClick={() => { void onSecondaryActionAll() }}
                                disabled={files.length === 0 || pendingRevertPath === '__all__'}
                                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-white/10 text-red-300 hover:text-red-200 hover:bg-white/[0.03] hover:border-white/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            >
                                {pendingRevertPath === '__all__' ? 'Working...' : secondaryActionAllLabel}
                            </button>
                        ) : null}
                    </div>
                </div>
            </div>

            {files.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-5 text-center text-sm text-white/45">
                    {emptyText}
                </div>
            ) : (
                <>
                    <div className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10 bg-black/20">
                        {paginatedFiles.map((file) => {
                            const badge = getStatusBadge(file.gitStatus)
                            const diffCounts = getDiffCounts(file, diffMode)
                            const diffKey = `${diffMode}:${file.path}`
                            const diffLoading = loadingDiffKeys.has(diffKey)
                            const actionPending = pendingActionPath === file.path
                            const revertPending = pendingRevertPath === file.path
                            return (
                                <div
                                    key={`${file.path}:${diffMode}`}
                                    className="group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-white/[0.03]"
                                >
                                    <span className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase', badge.className)}>
                                        {badge.label}
                                    </span>
                                    <VscodeEntryIcon pathValue={file.path} kind="file" theme={iconTheme} className="shrink-0" />
                                    <button
                                        onClick={() => {
                                            onSetPendingActionPath(file.path)
                                            void onViewDiff(file, diffMode).finally(() => onSetPendingActionPath(null))
                                        }}
                                        className="min-w-0 flex-1 text-left"
                                    >
                                        <div className="truncate text-sm text-white/85">{file.name}</div>
                                        <div className="truncate text-[11px] text-white/45">{file.path}</div>
                                    </button>
                                    <DiffStats additions={diffCounts.additions} deletions={diffCounts.deletions} loading={file.statsLoaded !== true} />
                                    <button
                                        onClick={(event) => handleCopyPath(file.path, event)}
                                        className="rounded-md p-1.5 text-white/35 transition-colors hover:bg-white/5 hover:text-white/75"
                                        title="Copy file path"
                                    >
                                        {copiedPath === file.path ? <Check size={14} /> : <Copy size={14} />}
                                    </button>
                                    {onRevertFile ? (
                                        <button
                                            onClick={() => onRevertFile(file)}
                                            disabled={revertPending}
                                            className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-white/70 transition-colors hover:border-white/20 hover:bg-white/[0.03] disabled:opacity-40"
                                        >
                                            {revertPending ? 'Working...' : 'Revert'}
                                        </button>
                                    ) : null}
                                    <button
                                        onClick={() => { void onActionFile(file.path) }}
                                        disabled={actionPending || diffLoading}
                                        className="rounded-lg bg-white/5 px-2.5 py-1 text-xs text-white/75 transition-colors hover:bg-white/10 disabled:opacity-40"
                                    >
                                        {actionPending ? 'Working...' : actionLabel}
                                    </button>
                                </div>
                            )
                        })}
                    </div>

                    {totalPages > 1 ? (
                        <div className="flex items-center justify-between px-1 text-[11px] text-white/45">
                            <span>{pageStart}-{pageEnd} of {files.length}</span>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                                    disabled={currentPage <= 1}
                                    className="rounded-md border border-white/10 px-2 py-1 transition-colors hover:border-white/20 hover:bg-white/[0.03] disabled:opacity-40"
                                >
                                    Prev
                                </button>
                                <span>{currentPage}/{totalPages}</span>
                                <button
                                    onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                                    disabled={currentPage >= totalPages}
                                    className="rounded-md border border-white/10 px-2 py-1 transition-colors hover:border-white/20 hover:bg-white/[0.03] disabled:opacity-40"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    ) : null}
                </>
            )}
        </div>
    )
}
