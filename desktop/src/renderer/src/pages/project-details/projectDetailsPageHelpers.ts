import type { GitCommit } from './types'
import {
    getFileExtensionFromName,
    getParentFolderPath,
    validateCreateName
} from '@/lib/filesystem/fileSystemPaths'

export {
    getFileExtensionFromName,
    getParentFolderPath,
    validateCreateName
} from '@/lib/filesystem/fileSystemPaths'

export type FileSystemClipboardItem = {
    path: string
    name: string
    type: 'file' | 'directory'
}

export type CreateFileSystemTarget = {
    destinationDirectory: string
    type: 'file' | 'directory'
    presetExtension?: string
}

export const README_COLLAPSED_MAX_HEIGHT = 500
export const PREVIEWABLE_EXTENSIONS = new Set([
    'md', 'markdown', 'mdown', 'mdx',
    'html', 'htm',
    'json', 'jsonc', 'json5',
    'csv', 'tsv',
    'txt', 'log', 'ini', 'conf', 'env',
    'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs',
    'py', 'rb', 'java', 'kt', 'kts',
    'c', 'h', 'cpp', 'cxx', 'hpp', 'cs',
    'go', 'rs', 'php', 'swift', 'dart', 'scala', 'sql',
    'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd',
    'yml', 'yaml', 'toml', 'xml', 'css', 'scss', 'less', 'vue', 'svelte'
])

export const PREVIEWABLE_FILE_NAMES = new Set([
    'dockerfile', 'makefile', '.gitignore', '.gitattributes', '.editorconfig', '.npmrc', '.eslintrc', '.prettierrc'
])

export const WORKING_CHANGE_STATS_CHUNK_SIZE = 120

const PROJECT_ACTIVE_TAB_STORAGE_PREFIX = 'devscope:project-details:active-tab:'
const PROJECT_GIT_VIEW_STORAGE_PREFIX = 'devscope:project-details:git-view:'
const PROJECT_GIT_ACTIVITY_STORAGE_PREFIX = 'devscope:project-details:git-activity:'

export function normalizeWorkingChangePath(path: string): string {
    return String(path || '').replace(/\\/g, '/').trim()
}

export function normalizeFileSystemPath(path: string): string {
    return String(path || '')
        .replace(/\\/g, '/')
        .replace(/\/{2,}/g, '/')
        .replace(/\/$/, '')
        .toLowerCase()
}

export function splitFileNameForRename(name: string): { baseName: string; extensionSuffix: string } {
    const raw = String(name || '')
    const dotIndex = raw.lastIndexOf('.')
    if (dotIndex <= 0 || dotIndex === raw.length - 1) {
        return { baseName: raw, extensionSuffix: '' }
    }
    return {
        baseName: raw.slice(0, dotIndex),
        extensionSuffix: raw.slice(dotIndex)
    }
}

export function resolveBranchState(defaultBranch: string): {
    branchName: 'main' | 'master' | 'custom'
    customBranchName: string
} {
    const normalized = String(defaultBranch || '').trim()
    if (normalized === 'main') {
        return { branchName: 'main', customBranchName: '' }
    }
    if (normalized === 'master') {
        return { branchName: 'master', customBranchName: '' }
    }
    return {
        branchName: 'custom',
        customBranchName: normalized || 'develop'
    }
}

export function readStoredProjectGitView(projectPath: string): 'changes' | 'history' | 'unpushed' | 'pulls' | 'manage' | null {
    try {
        const key = `${PROJECT_GIT_VIEW_STORAGE_PREFIX}${projectPath}`
        const raw = (window.localStorage.getItem(key) || '').trim()
        if (raw === 'changes' || raw === 'history' || raw === 'unpushed' || raw === 'pulls' || raw === 'manage') return raw
    } catch {
        // ignore storage access issues
    }
    return null
}

export function writeStoredProjectGitView(
    projectPath: string,
    gitView: 'changes' | 'history' | 'unpushed' | 'pulls' | 'manage'
): void {
    try {
        const key = `${PROJECT_GIT_VIEW_STORAGE_PREFIX}${projectPath}`
        window.localStorage.setItem(key, gitView)
    } catch {
        // ignore storage access issues
    }
}

export function readStoredProjectActiveTab(projectPath: string): 'readme' | 'files' | 'git' | null {
    try {
        const key = `${PROJECT_ACTIVE_TAB_STORAGE_PREFIX}${projectPath}`
        const raw = (window.localStorage.getItem(key) || '').trim()
        if (raw === 'readme' || raw === 'files' || raw === 'git') return raw
    } catch {
        // ignore storage access issues
    }
    return null
}

export function writeStoredProjectActiveTab(projectPath: string, tab: 'readme' | 'files' | 'git'): void {
    try {
        const key = `${PROJECT_ACTIVE_TAB_STORAGE_PREFIX}${projectPath}`
        window.localStorage.setItem(key, tab)
    } catch {
        // ignore storage access issues
    }
}

export function readStoredProjectGitActivity(projectPath: string): {
    lastFetched?: number
    lastPulled?: number
} {
    try {
        const key = `${PROJECT_GIT_ACTIVITY_STORAGE_PREFIX}${projectPath}`
        const raw = window.localStorage.getItem(key)
        if (!raw) return {}

        const parsed = JSON.parse(raw) as {
            lastFetched?: unknown
            lastPulled?: unknown
        }

        return {
            lastFetched: typeof parsed?.lastFetched === 'number' ? parsed.lastFetched : undefined,
            lastPulled: typeof parsed?.lastPulled === 'number' ? parsed.lastPulled : undefined
        }
    } catch {
        return {}
    }
}

export function writeStoredProjectGitActivity(
    projectPath: string,
    value: {
        lastFetched?: number
        lastPulled?: number
    }
): void {
    try {
        const key = `${PROJECT_GIT_ACTIVITY_STORAGE_PREFIX}${projectPath}`
        window.localStorage.setItem(key, JSON.stringify({
            lastFetched: typeof value.lastFetched === 'number' ? value.lastFetched : null,
            lastPulled: typeof value.lastPulled === 'number' ? value.lastPulled : null
        }))
    } catch {
        // ignore storage access issues
    }
}

export function mergeHistoryCommitStats(previousCommits: GitCommit[], nextCommits: GitCommit[]): GitCommit[] {
    if (previousCommits.length === 0 || nextCommits.length === 0) {
        return nextCommits
    }

    const previousByHash = new Map(previousCommits.map((commit) => [commit.hash, commit]))
    return nextCommits.map((commit) => {
        const previous = previousByHash.get(commit.hash)
        if (!previous || previous.statsLoaded !== true) {
            return commit
        }

        return {
            ...commit,
            additions: previous.additions,
            deletions: previous.deletions,
            filesChanged: previous.filesChanged,
            statsLoaded: true
        }
    })
}
