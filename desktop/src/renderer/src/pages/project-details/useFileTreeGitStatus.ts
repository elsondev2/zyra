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
                metaClass: '!text-[#EAC883]',
                nameColor: '#F6D38F',
                metaColor: '',
                pulseColor: '#E2C08D',
                badgeClass: 'bg-[#E2C08D]/30 text-[#F4D6A7]',
                badgeLabel: 'M'
            }
        case 'added':
            return {
                nameClass: 'font-semibold',
                metaClass: '!text-[#86E0A2]',
                nameColor: '#9AF3B5',
                metaColor: '',
                pulseColor: '#73C991',
                badgeClass: 'bg-[#73C991]/30 text-[#8DE2AA]',
                badgeLabel: 'A'
            }
        case 'untracked':
            return {
                nameClass: 'font-semibold',
                metaClass: '!text-[#86E0A2]',
                nameColor: '#9AF3B5',
                metaColor: '',
                pulseColor: '#73C991',
                badgeClass: 'bg-[#73C991]/30 text-[#8DE2AA]',
                badgeLabel: 'U'
            }
        case 'deleted':
            return {
                nameClass: 'font-semibold line-through',
                metaClass: '!text-[#EF8A8A]',
                nameColor: '#FF9A9A',
                metaColor: '',
                pulseColor: '#FF6B6B',
                badgeClass: 'bg-[#FF6B6B]/30 text-[#FF8A8A]',
                badgeLabel: 'D'
            }
        case 'renamed':
            return {
                nameClass: 'font-semibold',
                metaClass: '!text-[#78BFF5]',
                nameColor: '#88CCFF',
                metaColor: '',
                pulseColor: '#60A5FA',
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
