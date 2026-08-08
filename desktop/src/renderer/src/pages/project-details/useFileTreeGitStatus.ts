import { useMemo } from 'react'
import { normalizeFileSystemPath } from './projectDetailsPageHelpers'

type FileGitStatus = 'modified' | 'untracked' | 'added' | 'deleted' | 'renamed' | 'ignored' | 'unknown' | undefined

function statusPriority(status: FileGitStatus): number {
    switch (status) {
        case 'deleted':
            return 5
        case 'modified':
            return 4
        case 'renamed':
            return 3
        case 'added':
        case 'untracked':
            return 2
        default:
            return 0
    }
}

export function getGitStatusVisual(status: FileGitStatus) {
    switch (status) {
        case 'modified':
            return {
                nameClass: 'font-semibold',
                metaClass: '!text-[var(--status-warning)]',
                nameColor: 'var(--status-warning)',
                metaColor: '',
                pulseColor: 'var(--status-warning)',
                badgeClass: 'bg-amber-500/30 text-amber-300',
                badgeLabel: 'M'
            }
        case 'added':
            return {
                nameClass: 'font-semibold',
                metaClass: '!text-[var(--status-success)]',
                nameColor: 'var(--status-success)',
                metaColor: '',
                pulseColor: 'var(--status-success)',
                badgeClass: 'bg-emerald-500/30 text-emerald-300',
                badgeLabel: 'A'
            }
        case 'untracked':
            return {
                nameClass: 'font-semibold',
                metaClass: '!text-[var(--status-success)]',
                nameColor: 'var(--status-success)',
                metaColor: '',
                pulseColor: 'var(--status-success)',
                badgeClass: 'bg-emerald-500/30 text-emerald-300',
                badgeLabel: 'U'
            }
        case 'deleted':
            return {
                nameClass: 'font-semibold line-through',
                metaClass: '!text-[var(--status-danger)]',
                nameColor: 'var(--status-danger)',
                metaColor: '',
                pulseColor: 'var(--status-danger)',
                badgeClass: 'bg-red-500/30 text-red-300',
                badgeLabel: 'D'
            }
        case 'renamed':
            return {
                nameClass: 'font-semibold',
                metaClass: '!text-[var(--accent-primary)]',
                nameColor: 'var(--accent-primary)',
                metaColor: '',
                pulseColor: 'var(--accent-primary)',
                badgeClass: 'bg-blue-500/30 text-blue-300',
                badgeLabel: 'R'
            }
        default:
            return {
                nameClass: '',
                metaClass: '',
                nameColor: '',
                metaColor: '',
                pulseColor: '',
                badgeClass: '',
                badgeLabel: ''
            }
    }
}

export function useFileTreeGitStatus(
    changedFiles: Array<{ path?: string; gitStatus?: string }> | undefined,
    projectRootPath: string
) {
    const changedStatusLookup = useMemo(() => {
        const lookup = new Map<string, Exclude<FileGitStatus, undefined>>()
        for (const file of changedFiles || []) {
            const status = file?.gitStatus as Exclude<FileGitStatus, undefined>
            const relPath = normalizeFileSystemPath(file?.path || '')
            if (!status || !relPath) continue
            lookup.set(relPath, status)
            if (projectRootPath) {
                lookup.set(normalizeFileSystemPath(`${projectRootPath}/${relPath}`), status)
            }
        }
        return lookup
    }, [changedFiles, projectRootPath])

    const changedPathList = useMemo(() => {
        const paths: string[] = []
        for (const file of changedFiles || []) {
            const relPath = normalizeFileSystemPath(file?.path || '')
            if (!relPath) continue
            paths.push(relPath)
            if (projectRootPath) {
                paths.push(normalizeFileSystemPath(`${projectRootPath}/${relPath}`))
            }
        }
        return paths
    }, [changedFiles, projectRootPath])

    const resolveNodeStatus = (node: { path?: string; gitStatus?: string }): FileGitStatus => {
        const fromNode = node.gitStatus as FileGitStatus
        if (fromNode && fromNode !== 'unknown' && fromNode !== 'ignored') return fromNode
        const normalizedNodePath = normalizeFileSystemPath(node.path || '')
        return changedStatusLookup.get(normalizedNodePath)
    }

    const resolveDirectStatus = (node: { path?: string }): FileGitStatus => {
        const normalizedNodePath = normalizeFileSystemPath(node.path || '')
        const direct = changedStatusLookup.get(normalizedNodePath)
        if (direct && direct !== 'unknown' && direct !== 'ignored') return direct
        return undefined
    }

    const folderHasNestedChanges = (folderPath: string): boolean => {
        const normalizedFolderPath = normalizeFileSystemPath(folderPath)
        if (!normalizedFolderPath) return false
        return changedPathList.some((changedPath) => (
            changedPath === normalizedFolderPath
            || changedPath.startsWith(`${normalizedFolderPath}/`)
        ))
    }

    const resolveFolderNestedStatus = (folderPath: string): FileGitStatus => {
        const normalizedFolderPath = normalizeFileSystemPath(folderPath)
        if (!normalizedFolderPath) return undefined

        let best: FileGitStatus = undefined
        for (const [pathKey, status] of changedStatusLookup.entries()) {
            if (pathKey === normalizedFolderPath || pathKey.startsWith(`${normalizedFolderPath}/`)) {
                if (statusPriority(status) > statusPriority(best)) {
                    best = status
                }
            }
        }
        return best
    }

    return {
        resolveNodeStatus,
        resolveDirectStatus,
        folderHasNestedChanges,
        resolveFolderNestedStatus
    }
}
