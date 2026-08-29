import { access, readFile, readdir, realpath } from 'fs/promises'
import { homedir } from 'os'
import { basename, dirname, join, resolve, isAbsolute, relative } from 'path'
import { isGenericUserFolderPath } from '../../shared/projects/project-path-classification'

const COMMON_ICON_FILES = [
    'favicon.ico',
    'favicon.png',
    'favicon.svg',
    'icon.ico',
    'icon.png',
    'icon.svg',
    'logo.png',
    'logo.svg',
    'apple-touch-icon.png',
    'public/favicon.ico',
    'public/favicon.png',
    'public/favicon.svg',
    'public/icon.png',
    'public/icon.svg',
    'public/apple-touch-icon.png',
    'app/icon.png',
    'app/icon.jpg',
    'app/icon.jpeg',
    'app/icon.ico',
    'app/apple-icon.png',
    'resources/icon.ico',
    'resources/icon.png',
    'build/icon.ico',
    'build/icon.png'
]

const ROOT_PROJECT_EVIDENCE_FILES = new Set([
    '.git',
    'package.json',
    'pnpm-workspace.yaml',
    'turbo.json',
    'Cargo.toml',
    'go.mod',
    'pom.xml',
    'build.gradle',
    'build.gradle.kts',
    'requirements.txt',
    'pyproject.toml',
    'setup.py',
    'Gemfile',
    'composer.json',
    'pubspec.yaml',
    'mix.exs',
    'CMakeLists.txt'
])

const PREFERRED_APP_ROOT_NAMES = new Map<string, number>([
    ['desktop', 320],
    ['electron', 300],
    ['app', 280],
    ['web', 240],
    ['frontend', 220],
    ['client', 200],
    ['console', 180],
    ['marketing', 120]
])

function hasProjectRootEvidence(entries: string[], packageJson?: any): boolean {
    if (packageJson && typeof packageJson === 'object') return true
    return entries.some((entry) => (
        ROOT_PROJECT_EVIDENCE_FILES.has(entry)
        || /\.(?:csproj|fsproj|sln|xcodeproj|xcworkspace)$/i.test(entry)
    ))
}

function isLocalAssetReference(value: string): boolean {
    const trimmed = String(value || '').trim()
    if (!trimmed) return false
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|data:)/i.test(trimmed)) return false
    return true
}

async function pathExists(path: string): Promise<boolean> {
    try {
        await access(path)
        return true
    } catch {
        return false
    }
}

async function readJsonFile(path: string): Promise<any | null> {
    try {
        const content = await readFile(path, 'utf-8')
        return JSON.parse(content)
    } catch {
        return null
    }
}

async function isPathConfinedToProject(projectPath: string, candidatePath: string): Promise<boolean> {
    try {
        const [realProjectPath, realCandidatePath] = await Promise.all([
            realpath(projectPath),
            realpath(candidatePath)
        ])
        const relativePath = relative(realProjectPath, realCandidatePath)
        return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))
    } catch {
        return false
    }
}

async function resolveExistingAssetPath(
    projectPath: string,
    baseDir: string,
    assetPath: string,
    projectRootRelative = false
): Promise<string | null> {
    if (!isLocalAssetReference(assetPath)) return null

    const normalized = assetPath.replace(/\\/g, '/').trim()
    const stripped = normalized.split('?')[0]?.split('#')[0] || normalized
    if (!stripped) return null

    const candidates = new Set<string>()
    if (projectRootRelative && stripped.startsWith('/')) {
        candidates.add(resolve(projectPath, `.${stripped}`))
    } else if (isAbsolute(stripped)) {
        candidates.add(resolve(stripped))
    } else {
        candidates.add(resolve(baseDir, stripped))
        candidates.add(resolve(projectPath, stripped))
    }

    for (const candidate of candidates) {
        if (await pathExists(candidate) && await isPathConfinedToProject(projectPath, candidate)) {
            return candidate
        }
    }

    return null
}

function extractHtmlLinkHrefs(html: string): string[] {
    const hrefs: string[] = []
    const linkRegex = /<link\b[^>]*>/gi
    const relRegex = /\brel\s*=\s*["']([^"']+)["']/i
    const hrefRegex = /\bhref\s*=\s*["']([^"']+)["']/i

    let match: RegExpExecArray | null
    while ((match = linkRegex.exec(html)) !== null) {
        const tag = match[0]
        const rel = relRegex.exec(tag)?.[1]?.toLowerCase() || ''
        if (!rel || (!rel.includes('icon') && !rel.includes('manifest'))) continue

        const href = hrefRegex.exec(tag)?.[1]
        if (href) hrefs.push(href)
    }

    return hrefs
}

function scoreManifestIcon(icon: any): number {
    const src = String(icon?.src || '').toLowerCase()
    const sizes = String(icon?.sizes || '')
    const purpose = String(icon?.purpose || '')
    let sizeScore = 0

    for (const token of sizes.split(/\s+/)) {
        const match = token.match(/(\d+)x(\d+)/i)
        if (!match) continue
        sizeScore = Math.max(sizeScore, Number(match[1]) || 0, Number(match[2]) || 0)
    }

    if (src.endsWith('.svg')) sizeScore += 2048
    if (purpose.includes('maskable')) sizeScore += 128
    if (src.endsWith('.png')) sizeScore += 32
    if (src.endsWith('.ico')) sizeScore += 16
    return sizeScore
}

async function resolveManifestIcon(projectPath: string, manifestPath: string): Promise<string | null> {
    try {
        const manifestContent = await readFile(manifestPath, 'utf-8')
        const manifest = JSON.parse(manifestContent)
        const icons = Array.isArray(manifest?.icons) ? [...manifest.icons] : []
        icons.sort((left, right) => scoreManifestIcon(right) - scoreManifestIcon(left))

        for (const icon of icons) {
            const resolved = await resolveExistingAssetPath(projectPath, dirname(manifestPath), String(icon?.src || ''), true)
            if (resolved) return resolved
        }
    } catch {
        // Ignore malformed manifest files and continue fallback detection.
    }

    return null
}

async function resolveHtmlDeclaredIcon(projectPath: string, htmlPath: string): Promise<string | null> {
    try {
        const html = await readFile(htmlPath, 'utf-8')
        const hrefs = extractHtmlLinkHrefs(html)

        for (const href of hrefs) {
            const direct = await resolveExistingAssetPath(projectPath, dirname(htmlPath), href, true)
            if (direct) {
                if (/\.(?:webmanifest|json)$/i.test(direct)) {
                    const manifestIcon = await resolveManifestIcon(projectPath, direct)
                    if (manifestIcon) return manifestIcon
                    continue
                }
                return direct
            }

            if (/\.(?:webmanifest|json)$/i.test(href)) {
                const manifestPath = await resolveExistingAssetPath(projectPath, dirname(htmlPath), href, true)
                if (!manifestPath) continue
                const manifestIcon = await resolveManifestIcon(projectPath, manifestPath)
                if (manifestIcon) return manifestIcon
            }
        }
    } catch {
        // Ignore unreadable HTML files and continue fallback detection.
    }

    return null
}

async function resolvePackageDeclaredIcon(projectPath: string, packageJson: any): Promise<string | null> {
    const rawBuildIcon = packageJson?.build?.icon
    if (typeof rawBuildIcon === 'string' && rawBuildIcon.trim()) {
        const iconPath = rawBuildIcon.trim()
        const direct = await resolveExistingAssetPath(projectPath, projectPath, iconPath)
        if (direct) return direct

        if (!/\.[a-z0-9]+$/i.test(iconPath)) {
            for (const extension of ['.ico', '.png', '.icns']) {
                const withExtension = await resolveExistingAssetPath(projectPath, projectPath, `${iconPath}${extension}`)
                if (withExtension) return withExtension
            }
        }
    }

    return null
}

async function resolveExpoIcon(projectPath: string, configPath: string): Promise<string | null> {
    try {
        const content = await readFile(configPath, 'utf-8')
        const parsed = JSON.parse(content)
        const candidate = parsed?.expo?.icon || parsed?.icon
        if (typeof candidate === 'string') {
            return await resolveExistingAssetPath(projectPath, dirname(configPath), candidate, true)
        }
    } catch {
        // Ignore malformed config files.
    }

    return null
}

async function resolveRootDeclaredIcon(
    projectPath: string,
    entries: string[],
    packageJson?: any
): Promise<string | null> {
    const directPackageIcon = await resolvePackageDeclaredIcon(projectPath, packageJson)
    if (directPackageIcon) return directPackageIcon

    for (const htmlCandidate of ['index.html', 'public/index.html']) {
        if (!entries.includes(htmlCandidate.split('/').pop() || htmlCandidate) && !(await pathExists(join(projectPath, htmlCandidate)))) {
            continue
        }
        const resolved = await resolveHtmlDeclaredIcon(projectPath, join(projectPath, htmlCandidate))
        if (resolved) return resolved
    }

    for (const manifestCandidate of ['manifest.webmanifest', 'manifest.json', 'public/manifest.webmanifest', 'public/manifest.json', 'public/site.webmanifest']) {
        const manifestPath = join(projectPath, manifestCandidate)
        if (!(await pathExists(manifestPath))) continue
        const resolved = await resolveManifestIcon(projectPath, manifestPath)
        if (resolved) return resolved
    }

    for (const expoCandidate of ['app.json', 'app.config.json']) {
        const configPath = join(projectPath, expoCandidate)
        if (!(await pathExists(configPath))) continue
        const resolved = await resolveExpoIcon(projectPath, configPath)
        if (resolved) return resolved
    }

    for (const candidate of COMMON_ICON_FILES) {
        const resolved = await resolveExistingAssetPath(projectPath, projectPath, candidate)
        if (resolved) return resolved
    }

    return null
}

function getWorkspacePatterns(packageJson: any): string[] {
    const raw = packageJson?.workspaces
    if (Array.isArray(raw)) {
        return raw.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    }
    if (raw && typeof raw === 'object' && Array.isArray(raw.packages)) {
        return raw.packages.filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
    }
    return []
}

async function expandWorkspacePattern(projectPath: string, pattern: string): Promise<string[]> {
    const normalized = String(pattern || '').replace(/\\/g, '/').trim().replace(/\/+$/, '')
    if (!normalized) return []

    if (!normalized.includes('*')) {
        const candidate = join(projectPath, normalized)
        return (await pathExists(candidate)) && (await isPathConfinedToProject(projectPath, candidate)) ? [candidate] : []
    }

    const starIndex = normalized.indexOf('*')
    const basePart = normalized.slice(0, starIndex).replace(/\/+$/, '')
    const baseDir = basePart ? join(projectPath, basePart) : projectPath

    try {
        if (!(await isPathConfinedToProject(projectPath, baseDir))) return []
        const entries = await readdir(baseDir, { withFileTypes: true })
        const candidates: string[] = []
        for (const entry of entries) {
            if (!entry.isDirectory()) continue
            const candidate = join(baseDir, entry.name)
            if (await isPathConfinedToProject(projectPath, candidate)) candidates.push(candidate)
        }
        return candidates
    } catch {
        return []
    }
}

async function addConfinedAppRoot(candidateRoots: Set<string>, projectPath: string, candidate: string): Promise<void> {
    if ((await pathExists(candidate)) && (await isPathConfinedToProject(projectPath, candidate))) {
        candidateRoots.add(candidate)
    }
}

async function collectNestedAppRoots(projectPath: string, entries: string[], packageJson?: any): Promise<string[]> {
    const candidateRoots = new Set<string>()

    for (const pattern of getWorkspacePatterns(packageJson)) {
        const expanded = await expandWorkspacePattern(projectPath, pattern)
        for (const candidate of expanded) {
            await addConfinedAppRoot(candidateRoots, projectPath, candidate)
        }
    }

    for (const relative of [
        'desktop',
        'electron',
        'app',
        'web',
        'frontend',
        'client',
        'console',
        'marketing',
        'apps/desktop',
        'apps/web',
        'apps/app',
        'apps/console',
        'apps/marketing',
        'packages/desktop',
        'packages/app',
        'packages/web',
        'packages/console/app'
    ]) {
        const candidate = join(projectPath, relative)
        await addConfinedAppRoot(candidateRoots, projectPath, candidate)
    }

    for (const topLevelDir of ['apps', 'packages']) {
        if (!entries.includes(topLevelDir)) continue
        const baseDir = join(projectPath, topLevelDir)
        try {
            if (!(await isPathConfinedToProject(projectPath, baseDir))) continue
            const subdirs = await readdir(baseDir, { withFileTypes: true })
            for (const entry of subdirs) {
                if (!entry.isDirectory()) continue
                const candidate = join(baseDir, entry.name)
                await addConfinedAppRoot(candidateRoots, projectPath, candidate)
            }
        } catch {
            // Ignore unreadable workspace directories.
        }
    }

    return Array.from(candidateRoots)
}

function scoreNestedAppRoot(rootPath: string, iconPath: string, packageJson: any, entries: string[]): number {
    const normalizedRoot = rootPath.replace(/\\/g, '/').toLowerCase()
    const normalizedIcon = iconPath.replace(/\\/g, '/').toLowerCase()
    const rootName = basename(rootPath).toLowerCase()
    let score = 0

    score += PREFERRED_APP_ROOT_NAMES.get(rootName) || 0
    if (normalizedRoot.includes('/desktop')) score += 160
    if (normalizedRoot.includes('/app')) score += 120
    if (normalizedRoot.includes('/web')) score += 100
    if (normalizedRoot.includes('/console/app')) score += 90
    if (normalizedRoot.includes('/marketing')) score -= 30

    if (typeof packageJson?.build?.icon === 'string') score += 220
    if (entries.includes('index.html')) score += 60
    if (entries.includes('public')) score += 40
    if (normalizedIcon.endsWith('.svg')) score += 24
    if (normalizedIcon.endsWith('.png')) score += 18
    if (normalizedIcon.endsWith('.ico')) score += 12
    if (normalizedIcon.includes('/site.webmanifest') || normalizedIcon.includes('/manifest')) score -= 20

    return score
}

export async function resolveProjectIconPath(
    projectPath: string,
    entries: string[],
    packageJson?: any
): Promise<string | null> {
    if (isGenericUserFolderPath(projectPath, homedir())) return null

    const directRootIcon = await resolveRootDeclaredIcon(projectPath, entries, packageJson)
    const nestedRoots = hasProjectRootEvidence(entries, packageJson)
        ? await collectNestedAppRoots(projectPath, entries, packageJson)
        : []
    let bestNestedIcon: { path: string; score: number } | null = null

    for (const nestedRoot of nestedRoots) {
        const nestedEntries = await readdir(nestedRoot).catch(() => [])
        const nestedPackageJson = await readJsonFile(join(nestedRoot, 'package.json'))
        const nestedIconPath = await resolveRootDeclaredIcon(nestedRoot, nestedEntries, nestedPackageJson)
        if (!nestedIconPath) continue

        const score = scoreNestedAppRoot(nestedRoot, nestedIconPath, nestedPackageJson, nestedEntries)
        if (!bestNestedIcon || score > bestNestedIcon.score) {
            bestNestedIcon = { path: nestedIconPath, score }
        }
    }

    if (bestNestedIcon) {
        return bestNestedIcon.path
    }

    if (directRootIcon) {
        return directRootIcon
    }

    return null
}
