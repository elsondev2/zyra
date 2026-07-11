import type { ScriptIntent } from './scriptRun'

export interface ProjectTypeDefinition {
    id: string
    displayName: string
    icon: string
    themeColor: string
    markers: string[]
    description: string
}

export interface FrameworkDefinition {
    id: string
    displayName: string
    icon: string
    themeColor: string
    parentType: string
    detectPatterns: any
}

export interface ProjectDetails {
    name: string
    displayName: string
    path: string
    type: string
    projectIconPath?: string | null
    typeInfo?: ProjectTypeDefinition
    markers: string[]
    frameworks: string[]
    frameworkInfo?: FrameworkDefinition[]
    description?: string
    version?: string
    readme?: string
    lastModified?: number
    scripts?: Record<string, string>
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
    dependencyInstallStatus?: {
        installed: boolean | null
        checked: boolean
        ecosystem: 'node' | 'unknown'
        totalPackages: number
        installedPackages: number
        missingPackages: number
        missingDependencies?: string[]
        missingSample?: string[]
        reason?: string
    } | null
}

export interface FileTreeNode {
    name: string
    path: string
    type: 'file' | 'directory'
    size?: number
    children?: FileTreeNode[]
    childrenLoaded?: boolean
    isHidden: boolean
    gitStatus?: 'modified' | 'untracked' | 'added' | 'deleted' | 'renamed' | 'ignored' | 'unknown'
}

export interface GitCommit {
    hash: string
    shortHash: string
    parents: string[]
    author: string
    date: string
    message: string
    additions: number
    deletions: number
    filesChanged: number
    statsLoaded?: boolean
}

export interface GitStatusDetail {
    path: string
    previousPath?: string
    status: 'modified' | 'untracked' | 'added' | 'deleted' | 'renamed' | 'ignored' | 'unknown'
    code: string
    staged: boolean
    unstaged: boolean
    additions: number
    deletions: number
    stagedAdditions: number
    stagedDeletions: number
    unstagedAdditions: number
    unstagedDeletions: number
    statsLoaded?: boolean
}

export interface PendingScriptRun {
    name: string
    command: string
    intent: ScriptIntent
    confidence: number
}

export interface GitBranchSummary {
    name: string
    current: boolean
    commit: string
    label: string
    isRemote: boolean
    isLocal?: boolean
}

export interface GitRemoteSummary {
    name: string
    fetchUrl: string
    pushUrl: string
}

export interface GitSyncStatus {
    currentBranch: string
    upstreamBranch: string | null
    headHash: string | null
    upstreamHeadHash: string | null
    hasRemote: boolean
    ahead: number
    behind: number
    workingTreeChanged: boolean
    workingTreeChangeCount: number
    statusToken: string
    detached: boolean
}

export interface GitTagSummary {
    name: string
    commit?: string
}

export interface GitStashSummary {
    hash: string
    message: string
}

export interface InstalledIde {
    id: string
    name: string
    icon: string
    color: string
}
