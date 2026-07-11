import type { DevScopeFileTreeNode } from '@shared/contracts/devscope-api'

export type MentionCandidate = {
    path: string
    name: string
    relativePath: string
    type: 'file' | 'directory'
}

type MentionIndexCacheEntry = {
    projectPath: string
    entries: MentionCandidate[]
    loadedAt: number
}

type MentionCandidateCategory = 'asset' | 'code' | 'config' | 'doc' | 'directory' | 'other'

const mentionIndexCache = new Map<string, MentionIndexCacheEntry>()
const ASSET_EXTENSIONS = new Set([
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'avif', 'apng', 'mp4', 'webm', 'mp3', 'wav', 'woff', 'woff2', 'ttf', 'otf'
])
const CODE_EXTENSIONS = new Set([
    'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'go', 'rs', 'java', 'kt', 'cs', 'cpp', 'c', 'h', 'css', 'scss', 'sass', 'html', 'xml', 'sql', 'sh', 'ps1'
])
const DOC_EXTENSIONS = new Set(['md', 'mdx', 'txt', 'rst'])
const CONFIG_EXTENSIONS = new Set(['json', 'yaml', 'yml', 'toml', 'ini', 'env', 'conf'])
const CONFIG_FILE_BASENAMES = new Set([
    'package.json', 'tsconfig.json', 'vite.config.ts', 'vite.config.js', 'next.config.js', 'next.config.ts', 'tailwind.config.js', 'tailwind.config.ts', '.gitignore', '.env', '.env.local'
])

function normalizeProjectPath(projectPath: string): string {
    return projectPath.replace(/[\\/]+$/, '')
}

function normalizeRelativePath(pathValue: string): string {
    return String(pathValue || '').replace(/\\/g, '/').replace(/^\//, '')
}

function flattenFileTree(nodes: DevScopeFileTreeNode[], projectPath: string, bucket: MentionCandidate[] = []): MentionCandidate[] {
    const normalizedProjectPath = normalizeProjectPath(projectPath)
    for (const node of nodes) {
        const normalizedPath = String(node.path || '').trim()
        const relativePath = normalizedPath.startsWith(normalizedProjectPath)
            ? normalizedPath.slice(normalizedProjectPath.length).replace(/^[\\/]+/, '')
            : normalizedPath
        bucket.push({
            path: normalizedPath,
            name: node.name,
            relativePath: normalizeRelativePath(relativePath || node.name),
            type: node.type
        })
        if (node.children?.length) flattenFileTree(node.children, normalizedProjectPath, bucket)
    }
    return bucket
}

function stableHash(value: string): number {
    let hash = 0
    for (let index = 0; index < value.length; index += 1) {
        hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
    }
    return Math.abs(hash)
}

function pathSegments(candidate: MentionCandidate): string[] {
    return normalizeRelativePath(candidate.relativePath).split('/').filter(Boolean)
}

function pathDepth(candidate: MentionCandidate): number {
    return Math.max(0, pathSegments(candidate).length - 1)
}

function topLevelBucket(candidate: MentionCandidate): string {
    const segments = pathSegments(candidate)
    return segments[0]?.toLowerCase() || candidate.name.toLowerCase()
}

function fileExtension(candidate: MentionCandidate): string {
    const normalizedName = candidate.name.toLowerCase()
    const dotIndex = normalizedName.lastIndexOf('.')
    if (dotIndex <= 0) return ''
    return normalizedName.slice(dotIndex + 1)
}

function categorizeMentionCandidate(candidate: MentionCandidate): MentionCandidateCategory {
    if (candidate.type === 'directory') return 'directory'

    const extension = fileExtension(candidate)
    const basename = candidate.name.toLowerCase()
    const relativePath = candidate.relativePath.toLowerCase()

    if (ASSET_EXTENSIONS.has(extension) || /(^|\/)(assets?|images?|icons?|public|static)(\/|$)/.test(relativePath)) {
        return 'asset'
    }
    if (CONFIG_EXTENSIONS.has(extension) || CONFIG_FILE_BASENAMES.has(basename) || basename.startsWith('.env')) {
        return 'config'
    }
    if (DOC_EXTENSIONS.has(extension) || basename === 'readme' || basename.startsWith('readme.')) {
        return 'doc'
    }
    if (CODE_EXTENSIONS.has(extension)) {
        return 'code'
    }
    return 'other'
}

function defaultSuggestionScore(candidate: MentionCandidate): number {
    const depth = pathDepth(candidate)
    const category = categorizeMentionCandidate(candidate)
    let score = 0

    if (candidate.type === 'file') score += 60
    else score += 8

    if (depth >= 1 && depth <= 3) score += 26
    else if (depth === 0) score += 4
    else if (depth <= 5) score += 14

    if (category === 'code') score += 14
    if (category === 'asset') score += 12
    if (category === 'config') score += 10
    if (category === 'doc') score += 8
    if (category === 'other') score += 5

    score -= Math.min(candidate.relativePath.length, 140) * 0.04
    score += (stableHash(candidate.relativePath.toLowerCase()) % 17) / 100
    return score
}

function buildDefaultMentionSuggestions(entries: MentionCandidate[], limit: number): MentionCandidate[] {
    const files = entries.filter((entry) => entry.type === 'file')
    const preferredFiles = files.filter((entry) => {
        const depth = pathDepth(entry)
        return depth >= 1 && depth <= 3
    })
    const source = preferredFiles.length >= Math.max(6, limit) ? preferredFiles : files

    const ranked = [...source].sort((left, right) => {
        const scoreDifference = defaultSuggestionScore(right) - defaultSuggestionScore(left)
        if (scoreDifference !== 0) return scoreDifference
        return left.relativePath.localeCompare(right.relativePath)
    })

    const selected: MentionCandidate[] = []
    const selectedPaths = new Set<string>()
    const selectedBuckets = new Set<string>()

    const tryPick = (candidate: MentionCandidate | undefined, options?: { keepBucketFlexible?: boolean }) => {
        if (!candidate || selectedPaths.has(candidate.path)) return false
        const bucket = topLevelBucket(candidate)
        if (!options?.keepBucketFlexible && selectedBuckets.has(bucket) && selected.length < Math.min(limit, 5)) {
            return false
        }
        selected.push(candidate)
        selectedPaths.add(candidate.path)
        selectedBuckets.add(bucket)
        return true
    }

    const seedCategories: MentionCandidateCategory[] = ['code', 'asset', 'config', 'doc']
    for (const category of seedCategories) {
        const match = ranked.find((candidate) => categorizeMentionCandidate(candidate) === category && !selectedPaths.has(candidate.path))
        tryPick(match)
        if (selected.length >= limit) return selected.slice(0, limit)
    }

    const bucketMap = new Map<string, MentionCandidate[]>()
    for (const candidate of ranked) {
        const bucket = topLevelBucket(candidate)
        const existing = bucketMap.get(bucket)
        if (existing) existing.push(candidate)
        else bucketMap.set(bucket, [candidate])
    }

    const orderedBuckets = [...bucketMap.entries()]
        .sort((left, right) => {
            const hashDifference = stableHash(left[0]) - stableHash(right[0])
            if (hashDifference !== 0) return hashDifference
            return left[0].localeCompare(right[0])
        })
        .map(([, candidates]) => candidates)

    let bucketIndex = 0
    while (selected.length < limit && orderedBuckets.length > 0 && bucketIndex < orderedBuckets.length * 6) {
        const bucketCandidates = orderedBuckets[bucketIndex % orderedBuckets.length]
        const nextCandidate = bucketCandidates.find((candidate) => !selectedPaths.has(candidate.path))
        if (nextCandidate) {
            tryPick(nextCandidate, { keepBucketFlexible: true })
        }
        bucketIndex += 1
    }

    if (selected.length < limit) {
        for (const candidate of ranked) {
            if (tryPick(candidate, { keepBucketFlexible: true }) && selected.length >= limit) break
        }
    }

    return selected.slice(0, limit)
}

export async function getOrCreateMentionIndex(projectPath: string): Promise<MentionCandidate[]> {
    const normalizedProjectPath = normalizeProjectPath(String(projectPath || '').trim())
    if (!normalizedProjectPath) return []

    const cached = mentionIndexCache.get(normalizedProjectPath)
    if (cached) return cached.entries

    const result = await window.devscope.getFileTree(normalizedProjectPath, { maxDepth: 5, showHidden: false })
    const entries = result.success ? flattenFileTree(result.tree || [], normalizedProjectPath) : []
    mentionIndexCache.set(normalizedProjectPath, {
        projectPath: normalizedProjectPath,
        entries,
        loadedAt: Date.now()
    })
    return entries
}

export function primeMentionIndex(projectPath: string): void {
    const normalizedProjectPath = normalizeProjectPath(String(projectPath || '').trim())
    if (!normalizedProjectPath || mentionIndexCache.has(normalizedProjectPath)) return
    void getOrCreateMentionIndex(normalizedProjectPath)
}

function scoreMentionCandidate(candidate: MentionCandidate, query: string): number {
    if (!query) return defaultSuggestionScore(candidate)

    const normalizedQuery = query.toLowerCase()
    const lowerName = candidate.name.toLowerCase()
    const lowerPath = candidate.relativePath.toLowerCase()

    let score = 0
    if (lowerName === normalizedQuery) score += 120
    if (lowerName.startsWith(normalizedQuery)) score += 80
    if (lowerPath.startsWith(normalizedQuery)) score += 56
    if (lowerName.includes(normalizedQuery)) score += 32
    if (lowerPath.includes(normalizedQuery)) score += 18
    if (candidate.type === 'file') score += 6
    score -= Math.min(lowerPath.length, 120) * 0.05
    return score
}

export function searchMentionIndex(entries: MentionCandidate[], query: string, limit = 8): MentionCandidate[] {
    const normalizedQuery = String(query || '').trim().toLowerCase()
    if (!normalizedQuery) {
        return buildDefaultMentionSuggestions(entries, limit)
    }

    return entries
        .filter((entry) => entry.name.toLowerCase().includes(normalizedQuery) || entry.relativePath.toLowerCase().includes(normalizedQuery))
        .map((entry) => ({ entry, score: scoreMentionCandidate(entry, normalizedQuery) }))
        .sort((left, right) => right.score - left.score || left.entry.relativePath.localeCompare(right.entry.relativePath))
        .slice(0, limit)
        .map((item) => item.entry)
}

export function clearMentionIndex(projectPath?: string): void {
    const normalizedProjectPath = normalizeProjectPath(String(projectPath || '').trim())
    if (!normalizedProjectPath) {
        mentionIndexCache.clear()
        return
    }
    mentionIndexCache.delete(normalizedProjectPath)
}
