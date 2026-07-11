import type { DevScopeGitFileStatus } from './devscope-git-contracts'

export type DevScopeProject = {
    name: string
    path: string
    type: string
    projectIconPath?: string | null
    markers: string[]
    frameworks: string[]
    lastModified?: number
    isProject: boolean
}

export type DevScopeFolderItem = {
    name: string
    path: string
    lastModified?: number
    isProject: boolean
}

export type DevScopeFileItem = {
    name: string
    path: string
    size: number
    lastModified?: number
    extension: string
}

export type DevScopeProjectDetails = {
    name: string
    displayName: string
    path: string
    type: string
    projectIconPath?: string | null
    markers: string[]
    frameworks: string[]
    readme?: string
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
    [key: string]: unknown
}

export type DevScopeFileTreeNode = {
    name: string
    path: string
    type: 'file' | 'directory'
    size?: number
    children?: DevScopeFileTreeNode[]
    childrenLoaded?: boolean
    isHidden: boolean
    gitStatus?: DevScopeGitFileStatus
}

export type DevScopePathInfo = {
    path: string
    name: string
    exists: boolean
    type: 'file' | 'directory' | null
}

export type DevScopeIndexedProject = DevScopeProject & {
    sourceFolder: string
    depth: number
}

export type DevScopeIndexedPathEntry = {
    path: string
    rootPath: string
    parentPath: string | null
    relativePath: string
    name: string
    type: 'file' | 'directory'
    extension: string
    size?: number
    lastModified?: number
    isHidden: boolean
    isProject: boolean
    projectType?: string | null
    projectIconPath?: string | null
    markers: string[]
    frameworks: string[]
    depth: number
}

export type DevScopeIndexedPathSearchInput = {
    scopePath?: string
    roots?: string[]
    term?: string
    extensionFilters?: string[]
    limit?: number
    includeFiles?: boolean
    includeDirectories?: boolean
    showHidden?: boolean
}

export type DevScopeIndexedPathSearchResult = {
    entries: DevScopeIndexedPathEntry[]
    ancestors: DevScopeIndexedPathEntry[]
    totalMatched: number
}

export type DevScopeProcessInfo = {
    pid: number
    name: string
    port?: number
    command?: string
    type: 'dev-server' | 'node' | 'python' | 'other'
}

export type DevScopeRunningApp = {
    name: string
    category: 'app' | 'background'
    processCount: number
    cpu: number
    memoryMb: number
}

export type DevScopeInstalledIde = {
    id: string
    name: string
    icon: string
    color: string
}

export type DevScopePythonPreviewEvent = {
    sessionId: string
    type: 'started' | 'stdout' | 'stderr' | 'exit' | 'error'
    text?: string
    code?: number | null
    signal?: string | null
    pid?: number | null
    interpreter?: string
    command?: string
    stopped?: boolean
}
