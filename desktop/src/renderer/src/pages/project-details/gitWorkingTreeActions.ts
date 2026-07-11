import { invalidateProjectGitOverview } from '@/lib/projectGitOverview'
import {
    normalizePath,
    toStagedDetail,
    toStagedOnlyDetail,
    toUnstagedDetail
} from './gitActionHelpers'
import type { ApplyOptimisticDetails, GitActionParams } from './gitActionTypes'
import type { GitStatusDetail } from './types'

export function createGitWorkingTreeActions(
    params: GitActionParams,
    bulkActionScope: 'project' | 'repo',
    applyOptimisticDetails: ApplyOptimisticDetails
) {
    const handleStageFile = async (filePath: string) => {
        if (!params.decodedPath || !filePath.trim()) return

        const normalizedTarget = normalizePath(filePath)
        const rollback = applyOptimisticDetails((prev) => {
            let changed = false
            const next = prev.map((detail) => {
                if (normalizePath(detail.path) !== normalizedTarget) return detail
                changed = true
                return toStagedDetail(detail)
            })
            return changed ? next : prev
        })

        try {
            const result = await window.devscope.stageFiles(params.decodedPath, [filePath])
            if (!result?.success) {
                throw new Error(result?.error || 'Failed to stage file')
            }

            invalidateProjectGitOverview(params.decodedPath)
            void params.refreshGitData(false, { quiet: true, mode: 'working' })
        } catch (err: any) {
            rollback()
            params.showToast(`Failed to stage file: ${err.message}`, undefined, undefined, 'error')
        }
    }

    const handleUnstageFile = async (filePath: string) => {
        if (!params.decodedPath || !filePath.trim()) return

        const normalizedTarget = normalizePath(filePath)
        const rollback = applyOptimisticDetails((prev) => {
            let changed = false
            const next = prev.map((detail) => {
                if (normalizePath(detail.path) !== normalizedTarget) return detail
                changed = true
                return toUnstagedDetail(detail)
            })
            return changed ? next : prev
        })

        try {
            const result = await window.devscope.unstageFiles(params.decodedPath, [filePath])
            if (!result?.success) {
                throw new Error(result?.error || 'Failed to unstage file')
            }

            invalidateProjectGitOverview(params.decodedPath)
            void params.refreshGitData(false, { quiet: true, mode: 'working' })
        } catch (err: any) {
            rollback()
            params.showToast(`Failed to unstage file: ${err.message}`, undefined, undefined, 'error')
        }
    }

    const handleStageAll = async () => {
        if (!params.decodedPath || params.unstagedFiles.length === 0) return

        const rollback = applyOptimisticDetails((prev) => prev.map((detail) => (
            detail.unstaged ? toStagedDetail(detail) : detail
        )))

        try {
            const result = await window.devscope.stageFiles(params.decodedPath, [], { scope: bulkActionScope })
            if (!result?.success) {
                throw new Error(result?.error || 'Failed to stage all files')
            }

            invalidateProjectGitOverview(params.decodedPath)
            void params.refreshGitData(false, { quiet: true, mode: 'working' })
        } catch (err: any) {
            rollback()
            params.showToast(`Failed to stage files: ${err.message}`, undefined, undefined, 'error')
        }
    }

    const handleUnstageAll = async () => {
        if (!params.decodedPath || params.stagedFiles.length === 0) return

        const rollback = applyOptimisticDetails((prev) => prev.map((detail) => (
            detail.staged ? toUnstagedDetail(detail) : detail
        )))

        try {
            const result = await window.devscope.unstageFiles(params.decodedPath, [], { scope: bulkActionScope })
            if (!result?.success) {
                throw new Error(result?.error || 'Failed to unstage all files')
            }

            invalidateProjectGitOverview(params.decodedPath)
            void params.refreshGitData(false, { quiet: true, mode: 'working' })
        } catch (err: any) {
            rollback()
            params.showToast(`Failed to unstage files: ${err.message}`, undefined, undefined, 'error')
        }
    }

    const handleDiscardUnstagedFile = async (filePath: string) => {
        if (!params.decodedPath || !filePath.trim()) return

        const normalizedTarget = normalizePath(filePath)
        const rollback = applyOptimisticDetails((prev) => {
            let changed = false
            const next: GitStatusDetail[] = []
            for (const detail of prev) {
                if (normalizePath(detail.path) !== normalizedTarget) {
                    next.push(detail)
                    continue
                }

                changed = true
                if (detail.staged) {
                    next.push(toStagedOnlyDetail(detail))
                }
            }
            return changed ? next : prev
        })

        try {
            const result = await window.devscope.discardChanges(params.decodedPath, [filePath], { mode: 'unstaged' })
            if (!result?.success) {
                throw new Error(result?.error || 'Failed to discard file changes')
            }

            invalidateProjectGitOverview(params.decodedPath)
            void params.refreshGitData(false, { quiet: true, mode: 'working' })
        } catch (err: any) {
            rollback()
            params.showToast(`Failed to revert changes: ${err.message}`, undefined, undefined, 'error')
        }
    }

    const handleDiscardUnstagedAll = async () => {
        if (!params.decodedPath || params.unstagedFiles.length === 0) return

        const rollback = applyOptimisticDetails((prev) => {
            let changed = false
            const next: GitStatusDetail[] = []
            for (const detail of prev) {
                if (!detail.unstaged) {
                    next.push(detail)
                    continue
                }

                changed = true
                if (detail.staged) {
                    next.push(toStagedOnlyDetail(detail))
                }
            }
            return changed ? next : prev
        })

        try {
            const result = await window.devscope.discardChanges(params.decodedPath, [], {
                scope: bulkActionScope,
                mode: 'unstaged'
            })
            if (!result?.success) {
                throw new Error(result?.error || 'Failed to discard unstaged changes')
            }

            invalidateProjectGitOverview(params.decodedPath)
            void params.refreshGitData(false, { quiet: true, mode: 'working' })
        } catch (err: any) {
            rollback()
            params.showToast(`Failed to revert changes: ${err.message}`, undefined, undefined, 'error')
        }
    }

    return {
        handleStageFile,
        handleUnstageFile,
        handleStageAll,
        handleUnstageAll,
        handleDiscardUnstagedFile,
        handleDiscardUnstagedAll
    }
}
