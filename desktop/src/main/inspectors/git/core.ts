import { spawnSync } from 'child_process'
import log from 'electron-log'
import { existsSync, readdirSync } from 'fs'
import { stat, unlink } from 'fs/promises'
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve } from 'path'
import { simpleGit, type SimpleGit } from 'simple-git'
import { getAugmentedEnv } from '../safe-exec'
import type { CompactPatchResult, GitCommit, GitStatusMap, RepoContext } from './types'

const AI_NOISY_PATCH_FILE_PATTERN = /(?:^|\/)(?:package-lock\.json|yarn\.lock|pnpm-lock\.ya?ml|bun\.lockb?|bun\.lock|min\.(?:js|css)|dist\/|build\/|coverage\/)/i
const AI_PATCH_MAX_FILES = 16
const AI_PATCH_MAX_LINES_PER_FILE = 120
const AI_PATCH_MAX_LINES_TOTAL = 900

export type GitRuntime = {
    binary: string
    env: NodeJS.ProcessEnv
}

let cachedGitRuntime: GitRuntime | null = null

function getGitHubDesktopGitCandidates(localAppData: string): string[] {
    const desktopRoot = join(localAppData, 'GitHubDesktop')
    if (!existsSync(desktopRoot)) return []

    try {
        return readdirSync(desktopRoot, { withFileTypes: true })
            .filter((entry) => entry.isDirectory() && /^app-/i.test(entry.name))
            .sort((left, right) => right.name.localeCompare(left.name))
            .flatMap((entry) => {
                const appRoot = join(desktopRoot, entry.name)
                return [
                    join(appRoot, 'resources', 'app', 'git', 'cmd', 'git.exe'),
                    join(appRoot, 'resources', 'app', 'git', 'bin', 'git.exe'),
                    join(appRoot, 'resources', 'app.asar.unpacked', 'git', 'cmd', 'git.exe'),
                    join(appRoot, 'resources', 'app.asar.unpacked', 'git', 'bin', 'git.exe')
                ]
            })
    } catch {
        return []
    }
}

function resolveGitBinaryPath(env: NodeJS.ProcessEnv): string {
    const locateCommand = process.platform === 'win32' ? 'where' : 'which'
    const locateResult = spawnSync(locateCommand, ['git'], {
        encoding: 'utf8',
        windowsHide: true,
        env
    })

    const resolvedFromPath = locateResult.status === 0
        ? (locateResult.stdout || '')
            .split(/\r?\n/)
            .map((line) => line.trim())
            .find((line) => Boolean(line) && existsSync(line))
        : ''

    if (resolvedFromPath) return resolvedFromPath

    if (process.platform !== 'win32') {
        return ''
    }

    const programFiles = [
        env.ProgramFiles,
        env['ProgramFiles(x86)'],
        process.env.ProgramFiles,
        process.env['ProgramFiles(x86)']
    ].filter((value): value is string => typeof value === 'string' && value.length > 0)
    const localAppData = [
        env.LOCALAPPDATA,
        process.env.LOCALAPPDATA
    ].find((value): value is string => typeof value === 'string' && value.length > 0)
    const userProfile = [
        env.USERPROFILE,
        process.env.USERPROFILE
    ].find((value): value is string => typeof value === 'string' && value.length > 0)
    const chocolateyInstall = [
        env.ChocolateyInstall,
        process.env.ChocolateyInstall
    ].find((value): value is string => typeof value === 'string' && value.length > 0)

    const candidates = [
        ...programFiles.flatMap((root) => [
            join(root, 'Git', 'cmd', 'git.exe'),
            join(root, 'Git', 'bin', 'git.exe')
        ]),
        ...(localAppData ? [
            join(localAppData, 'Programs', 'Git', 'cmd', 'git.exe'),
            join(localAppData, 'Programs', 'Git', 'bin', 'git.exe'),
            ...getGitHubDesktopGitCandidates(localAppData)
        ] : []),
        ...(userProfile ? [
            join(userProfile, 'scoop', 'apps', 'git', 'current', 'cmd', 'git.exe'),
            join(userProfile, 'scoop', 'apps', 'git', 'current', 'bin', 'git.exe')
        ] : []),
        ...(chocolateyInstall ? [
            join(chocolateyInstall, 'bin', 'git.exe')
        ] : [])
    ]

    return candidates.find((candidate) => existsSync(candidate)) || ''
}

function normalizeFsPath(input: string): string {
    const trimmed = String(input || '').trim()
    if (!trimmed) return trimmed
    if (process.platform === 'win32') {
        const msysDrivePath = trimmed.match(/^\/([a-zA-Z])\/(.*)$/)
        if (msysDrivePath) {
            const drive = msysDrivePath[1].toUpperCase()
            const rest = msysDrivePath[2].replace(/\//g, '\\')
            return `${drive}:\\${rest}`
        }
    }
    return trimmed
}

function resolveGitRuntime(): GitRuntime {
    if (cachedGitRuntime) return cachedGitRuntime

    const env = getAugmentedEnv()
    const resolvedPath = resolveGitBinaryPath(env)

    if (!resolvedPath) {
        log.warn('[Git] Falling back to `git` from PATH. Could not resolve a Git binary from PATH or common install locations.')
        return { binary: 'git', env }
    }

    const gitDir = dirname(resolvedPath)
    const pathCandidates = [env.Path, env.PATH].filter((value): value is string => typeof value === 'string' && value.length > 0)
    const allSegments = pathCandidates.flatMap((value) => value.split(delimiter))
    const alreadyPresent = allSegments.some((segment) => segment.trim().toLowerCase() === gitDir.toLowerCase())
    if (!alreadyPresent) {
        const currentPath = env.Path || env.PATH || ''
        const nextPath = currentPath ? `${gitDir}${delimiter}${currentPath}` : gitDir
        env.Path = nextPath
        env.PATH = nextPath
    }

    // Use plain `git` so simple-git can apply its own command safety checks.
    cachedGitRuntime = { binary: 'git', env }
    return cachedGitRuntime
}

export function createGit(projectPath: string): SimpleGit {
    const runtime = resolveGitRuntime()
    const git = simpleGit({
        baseDir: projectPath,
        binary: runtime.binary,
        maxConcurrentProcesses: 6,
        trimmed: false
    })

    const pathValue = runtime.env.Path || runtime.env.PATH
    if (pathValue) {
        git.env('Path', pathValue)
        git.env('PATH', pathValue)
    }

    const inheritedKeys = ['HOME', 'USERPROFILE', 'GIT_ASKPASS', 'SSH_ASKPASS', 'GIT_TERMINAL_PROMPT']
    for (const key of inheritedKeys) {
        const value = runtime.env[key]
        if (typeof value === 'string' && value.length > 0) {
            git.env(key, value)
        }
    }

    // Reduce background read-lock contention from status/diff polling while still allowing
    // commands that need mandatory locks (add/commit) to acquire them normally.
    git.env('GIT_OPTIONAL_LOCKS', '0')

    return git
}

export function getGitRuntime(): GitRuntime {
    return resolveGitRuntime()
}

export function normalizeGitPath(path: string): string {
    return path.replace(/^"|"$/g, '').replace(/\\/g, '/')
}

function sanitizePathSpec(pathSpec: string): string {
    return normalizeGitPath(pathSpec).replace(/^\.\/+/, '').replace(/\/{2,}/g, '/')
}

function isWindowsLikePath(pathSpec: string): boolean {
    return /^[A-Za-z]:\//.test(pathSpec)
}

function normalizeForCompare(pathSpec: string): string {
    const normalized = sanitizePathSpec(pathSpec).replace(/\/+$/, '')
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function stripPrefixedPath(pathSpec: string, prefix: string): string {
    if (!prefix) return sanitizePathSpec(pathSpec)

    let current = sanitizePathSpec(pathSpec)
    const normalizedPrefix = sanitizePathSpec(prefix).replace(/\/+$/, '')
    if (!normalizedPrefix) return current

    while (current.length > 0) {
        const currentCompare = normalizeForCompare(current)
        const prefixCompare = normalizeForCompare(normalizedPrefix)

        if (currentCompare === prefixCompare) {
            current = ''
            continue
        }

        const prefixedCompare = `${prefixCompare}/`
        if (currentCompare.startsWith(prefixedCompare)) {
            current = current.slice(normalizedPrefix.length + 1)
            continue
        }

        break
    }

    return sanitizePathSpec(current)
}

async function pathExists(path: string): Promise<boolean> {
    try {
        await stat(path)
        return true
    } catch {
        return false
    }
}

async function repoPathLikelyExists(repoRoot: string, candidate: string): Promise<boolean> {
    const normalized = sanitizePathSpec(candidate)
    if (!normalized || normalized === '.') return true

    const filePath = join(repoRoot, ...normalized.split('/'))
    if (await pathExists(filePath)) return true

    const parent = dirname(filePath)
    return await pathExists(parent)
}

export async function getRepoContext(git: SimpleGit, projectPath: string): Promise<RepoContext> {
    const repoRootRaw = await git.raw(['rev-parse', '--show-toplevel']).catch(() => projectPath)
    const repoRoot = resolve(normalizeFsPath(repoRootRaw.trim() || projectPath))
    const projectAbsolute = resolve(normalizeFsPath(projectPath))
    const relativeToRepoRaw = sanitizePathSpec(relative(repoRoot, projectAbsolute))
    const projectRelativeToRepo = relativeToRepoRaw === '.' ? '' : relativeToRepoRaw

    return {
        repoRoot,
        projectRelativeToRepo
    }
}

export async function toPathSpec(
    git: SimpleGit,
    projectPath: string,
    filePath: string,
    repoContext?: RepoContext
): Promise<string> {
    const context = repoContext ?? await getRepoContext(git, projectPath)
    const normalizedInput = sanitizePathSpec(String(filePath || '').trim())
    if (!normalizedInput || normalizedInput === '.') return '.'
    const projectAbsolute = resolve(normalizeFsPath(projectPath))
    const normalizedAbsoluteInput = normalizeFsPath(filePath)

    const projectRelative = sanitizePathSpec(context.projectRelativeToRepo || '')
    const repoRootName = sanitizePathSpec(basename(context.repoRoot || '') || '')

    const candidates: string[] = []
    const pushCandidate = (value: string) => {
        const normalized = sanitizePathSpec(value)
        if (!normalized) return
        if (normalized !== '.' && (normalized.startsWith('..') || isWindowsLikePath(normalized))) return
        if (!candidates.includes(normalized)) {
            candidates.push(normalized)
        }
    }

    if (isAbsolute(normalizedAbsoluteInput)) {
        pushCandidate(sanitizePathSpec(relative(context.repoRoot, normalizedAbsoluteInput)))
    } else {
        const absoluteFromProject = resolve(projectAbsolute, filePath)
        pushCandidate(sanitizePathSpec(relative(context.repoRoot, absoluteFromProject)))

        if (repoRootName && normalizedInput === repoRootName) {
            pushCandidate('.')
        }
        if (repoRootName && normalizedInput.startsWith(`${repoRootName}/`)) {
            pushCandidate(normalizedInput.slice(repoRootName.length + 1))
        }

        pushCandidate(normalizedInput)

        if (projectRelative) {
            if (normalizedInput === projectRelative || normalizedInput.startsWith(`${projectRelative}/`)) {
                pushCandidate(normalizedInput)
            } else {
                pushCandidate(`${projectRelative}/${normalizedInput}`)
            }
        }
    }

    for (const candidate of candidates) {
        if (await repoPathLikelyExists(context.repoRoot, candidate)) {
            return candidate
        }
    }

    return candidates[0] || normalizedInput
}

export function toError(err: unknown, fallback: string): Error {
    if (err instanceof Error && err.message) return new Error(err.message)
    return new Error(fallback)
}

export function toErrorMessage(err: unknown, fallback: string): string {
    if (err instanceof Error && err.message) return err.message
    return fallback
}

function parseDiffBlocks(patch: string): string[][] {
    const lines = patch.split('\n')
    const blocks: string[][] = []
    let current: string[] = []

    for (const line of lines) {
        if (line.startsWith('diff --git ')) {
            if (current.length > 0) blocks.push(current)
            current = [line]
            continue
        }
        if (current.length > 0) {
            current.push(line)
        }
    }

    if (current.length > 0) blocks.push(current)
    return blocks
}

function extractDiffFilePath(headerLine: string): string {
    const match = headerLine.match(/^diff --git a\/(.+?) b\/.+$/)
    return match?.[1] || headerLine
}

export function compactPatchForAI(patch: string): CompactPatchResult {
    const blocks = parseDiffBlocks(patch)
    if (blocks.length === 0) {
        return {
            text: '',
            omittedFiles: [],
            totalFiles: 0,
            includedFiles: 0,
            wasTruncated: false
        }
    }

    const outputBlocks: string[] = []
    const omittedFiles: string[] = []
    let includedFiles = 0
    let usedLines = 0
    let wasTruncated = false

    for (const block of blocks) {
        if (block.length === 0) continue
        const filePath = extractDiffFilePath(block[0])

        if (AI_NOISY_PATCH_FILE_PATTERN.test(filePath)) {
            omittedFiles.push(`${filePath} (noisy/generated)`)
            continue
        }

        if (includedFiles >= AI_PATCH_MAX_FILES) {
            omittedFiles.push(`${filePath} (file limit reached)`)
            wasTruncated = true
            continue
        }

        const remainingLines = AI_PATCH_MAX_LINES_TOTAL - usedLines
        if (remainingLines <= 0) {
            omittedFiles.push(`${filePath} (global line budget reached)`)
            wasTruncated = true
            continue
        }

        const allowedForFile = Math.min(AI_PATCH_MAX_LINES_PER_FILE, remainingLines)
        let selected = block.slice(0, allowedForFile)

        if (block.length > allowedForFile) {
            selected = [
                ...selected,
                `... (${block.length - allowedForFile} more lines omitted for ${filePath})`
            ]
            wasTruncated = true
        }

        outputBlocks.push(selected.join('\n'))
        includedFiles += 1
        usedLines += selected.length
    }

    return {
        text: outputBlocks.join('\n\n').trim(),
        omittedFiles,
        totalFiles: blocks.length,
        includedFiles,
        wasTruncated
    }
}

export function countTrackedChanges(statusMap: GitStatusMap): number {
    const changed = new Set<string>()

    for (const [filePath, status] of Object.entries(statusMap)) {
        if (status === 'ignored' || status === 'unknown') continue
        changed.add(normalizeGitPath(filePath))
    }

    return changed.size
}

export function parseCommitLog(stdout: string, options?: { statsIncluded?: boolean }): GitCommit[] {
    const recordSep = '\x1e'
    const fieldSep = '\x1f'
    const commits: GitCommit[] = []
    const records = stdout
        .split(recordSep)
        .map((record) => record.replace(/^\s+/, '').replace(/\s+$/, ''))
        .filter(Boolean)

    for (const record of records) {
        const lines = record.split(/\r?\n/).map((line) => line.trimEnd())
        const header = lines[0] || ''
        const parts = header.split(fieldSep)
        if (parts.length < 5) continue
        const [hash, parentText, author, date, ...messageParts] = parts
        const message = messageParts.join(fieldSep)

        let additions = 0
        let deletions = 0
        let filesChanged = 0
        for (const statLine of lines.slice(1)) {
            const line = statLine.trim()
            if (!line) continue

            const columns = line.split('\t', 3)
            if (columns.length < 3) continue

            const added = columns[0] === '-' ? 0 : Number.parseInt(columns[0], 10)
            const deleted = columns[1] === '-' ? 0 : Number.parseInt(columns[1], 10)
            if (!Number.isNaN(added)) additions += added
            if (!Number.isNaN(deleted)) deletions += deleted
            filesChanged += 1
        }

        commits.push({
            hash,
            shortHash: hash.substring(0, 7),
            parents: parentText ? parentText.split(' ').filter(Boolean) : [],
            author,
            date,
            message,
            additions,
            deletions,
            filesChanged,
            statsLoaded: options?.statsIncluded !== false
        })
    }

    return commits
}

export function parseRepoOwner(remoteUrl: string): string | null {
    const trimmed = remoteUrl.trim()
    if (!trimmed) return null

    const sshScpMatch = trimmed.match(/^[^@]+@[^:]+:([^/]+)\/.+$/)
    if (sshScpMatch?.[1]) return sshScpMatch[1]

    try {
        const url = new URL(trimmed)
        const segments = url.pathname.split('/').filter(Boolean)
        return segments[0] || null
    } catch {
        return null
    }
}

export function assertNonEmpty(value: string, label: string): void {
    if (!value.trim()) {
        throw new Error(`${label} cannot be empty`)
    }
}

export function isCheckoutBlockedByLocalChanges(message: string): boolean {
    return /would be overwritten by (checkout|switch)/i.test(message)
}

export function isGitIndexLockConflict(message: string): boolean {
    return /index\.lock': File exists/i.test(message) || /Unable to create .*index\.lock/i.test(message)
}

export async function cleanupStaleIndexLock(projectPath: string, staleMs: number = 15_000): Promise<'removed' | 'active' | 'missing'> {
    const git = createGit(projectPath)
    const gitDirRaw = await git.raw(['rev-parse', '--path-format=absolute', '--git-dir']).catch(() => '')
    const gitDir = gitDirRaw.trim() || join(projectPath, '.git')
    const lockPath = join(gitDir, 'index.lock')

    try {
        const lockStat = await stat(lockPath)
        const ageMs = Date.now() - lockStat.mtimeMs

        if (ageMs < staleMs) {
            return 'active'
        }

        await unlink(lockPath)
        return 'removed'
    } catch (err: any) {
        if (err?.code === 'ENOENT') return 'missing'
        throw err
    }
}

export function stripPathPrefix(pathSpec: string, prefix: string): string {
    return stripPrefixedPath(pathSpec, prefix)
}
