export interface WorkingChangeItem {
    path: string
    previousPath?: string
    name: string
    gitStatus?: 'modified' | 'untracked' | 'added' | 'deleted' | 'renamed' | 'ignored' | 'unknown'
    staged?: boolean
    unstaged?: boolean
    additions: number
    deletions: number
    stagedAdditions?: number
    stagedDeletions?: number
    unstagedAdditions?: number
    unstagedDeletions?: number
    statsLoaded?: boolean
}

export type DiffMode = 'staged' | 'unstaged'
