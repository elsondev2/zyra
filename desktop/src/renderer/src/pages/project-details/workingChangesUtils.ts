import type { DiffMode, WorkingChangeItem } from './workingChangesTypes'

export function getDiffCounts(file: WorkingChangeItem, mode: DiffMode) {
    if (mode === 'staged') {
        const stagedAdditions = Math.max(0, Number(file.stagedAdditions) || 0)
        const stagedDeletions = Math.max(0, Number(file.stagedDeletions) || 0)

        if (stagedAdditions === 0 && stagedDeletions === 0 && file.unstaged !== true) {
            return {
                additions: Math.max(0, Number(file.additions) || 0),
                deletions: Math.max(0, Number(file.deletions) || 0)
            }
        }

        return {
            additions: stagedAdditions,
            deletions: stagedDeletions
        }
    }

    const unstagedAdditions = Math.max(0, Number(file.unstagedAdditions) || 0)
    const unstagedDeletions = Math.max(0, Number(file.unstagedDeletions) || 0)

    if (unstagedAdditions === 0 && unstagedDeletions === 0 && file.staged !== true) {
        return {
            additions: Math.max(0, Number(file.additions) || 0),
            deletions: Math.max(0, Number(file.deletions) || 0)
        }
    }

    return {
        additions: unstagedAdditions,
        deletions: unstagedDeletions
    }
}

export function getStatusBadge(status?: WorkingChangeItem['gitStatus']) {
    switch (status) {
        case 'modified':
            return { label: 'M', className: 'bg-[#E2C08D]/20 text-[#E2C08D]' }
        case 'untracked':
            return { label: 'U', className: 'bg-[#73C991]/20 text-[#73C991]' }
        case 'added':
            return { label: 'A', className: 'bg-[#73C991]/20 text-[#73C991]' }
        case 'deleted':
            return { label: 'D', className: 'bg-[#FF6B6B]/20 text-[#FF6B6B]' }
        case 'renamed':
            return { label: 'R', className: 'bg-blue-500/20 text-blue-300' }
        case 'ignored':
            return { label: 'I', className: 'bg-white/10 text-white/50' }
        default:
            return { label: '?', className: 'bg-white/10 text-white/50' }
    }
}

export function getDiffKey(mode: DiffMode, path: string): string {
    return `${mode}:${path}`
}
