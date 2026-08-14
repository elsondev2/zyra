import https from 'node:https'

type GitHubReleaseAsset = {
    name?: string
    browser_download_url?: string
}

export type GitHubRelease = {
    tag_name?: string
    html_url?: string
    prerelease?: boolean
    draft?: boolean
    published_at?: string
    assets?: GitHubReleaseAsset[]
}

export type ParsedVersion = {
    major: number
    minor: number
    patch: number
    channel: 'alpha' | 'beta' | 'stable'
    previewStep: number
}

export type ReleasePlatform = 'win32' | 'darwin' | 'linux'

export type GitHubReleaseFeed = {
    feedUrl: string
    metadataFile: 'latest.yml' | 'latest-mac.yml' | 'latest-linux.yml'
    tagName: string
    releasePageUrl: string
    previousBlockmapBaseUrlOverride: string
    platform: ReleasePlatform
    arch: string
}

type PlatformReleaseContract = {
    platform: ReleasePlatform
    arch: string
    metadataFile: GitHubReleaseFeed['metadataFile']
    requiredAssetNames: string[]
}

function parseRepository(repository: string): { owner: string; repo: string } {
    const [owner, repo] = repository.split('/', 2).map((value) => value.trim())
    if (!owner || !repo) {
        throw new Error(`Invalid GitHub repository "${repository}". Expected "owner/repo".`)
    }
    return { owner, repo }
}

function getGitHubAuthHeaders(): Record<string, string> {
    const token = process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim() || ''
    return token
        ? {
            Authorization: `Bearer ${token}`,
            'X-GitHub-Api-Version': '2022-11-28'
        }
        : {}
}

function requestJson<T>(hostname: string, requestPath: string): Promise<T> {
    return new Promise((resolve, reject) => {
        const request = https.request({
            protocol: 'https:',
            hostname,
            path: requestPath,
            method: 'GET',
            headers: {
                Accept: 'application/vnd.github+json',
                'User-Agent': 'zyra-update-feed',
                ...getGitHubAuthHeaders()
            }
        }, (response) => {
            const chunks: Buffer[] = []
            response.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
            response.on('end', () => {
                const raw = Buffer.concat(chunks).toString('utf8')
                const statusCode = response.statusCode ?? 0
                if (statusCode < 200 || statusCode >= 300) {
                    reject(new Error(raw || `GitHub API request failed with status ${statusCode}`))
                    return
                }

                try {
                    resolve(JSON.parse(raw) as T)
                } catch (error) {
                    reject(error)
                }
            })
        })

        request.on('error', reject)
        request.end()
    })
}

export function parseVersion(version: string): ParsedVersion | null {
    const match = version.trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta)\.(\d+))?$/i)
    if (!match) return null

    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
        channel: (String(match[4] || 'stable').toLowerCase() as ParsedVersion['channel']),
        previewStep: Number(match[5] || 0)
    }
}

function getChannelRank(channel: ParsedVersion['channel']): number {
    switch (channel) {
        case 'stable':
            return 3
        case 'beta':
            return 2
        case 'alpha':
            return 1
    }
}

function compareVersions(left: ParsedVersion, right: ParsedVersion): number {
    if (left.major !== right.major) return left.major - right.major
    if (left.minor !== right.minor) return left.minor - right.minor
    if (left.patch !== right.patch) return left.patch - right.patch

    const channelRankDiff = getChannelRank(left.channel) - getChannelRank(right.channel)
    if (channelRankDiff !== 0) return channelRankDiff
    return left.previewStep - right.previewStep
}

export function compareReleaseVersionStrings(leftVersion: string, rightVersion: string): number {
    const left = parseVersion(leftVersion)
    const right = parseVersion(rightVersion)
    if (!left || !right) {
        throw new Error(`Cannot compare invalid release versions "${leftVersion}" and "${rightVersion}".`)
    }

    return compareVersions(left, right)
}

export function resolveReleaseChannelForVersion(version: string): ParsedVersion['channel'] {
    return parseVersion(version)?.channel || 'stable'
}

export function resolvePlatformReleaseContract(
    version: string,
    platform: NodeJS.Platform | string,
    arch: string
): PlatformReleaseContract | null {
    const normalizedVersion = version.replace(/^v/, '')
    if (!parseVersion(normalizedVersion)) return null

    if (platform === 'win32' && arch === 'x64') {
        const installer = `Zyra-${normalizedVersion}-windows-x64-setup.exe`
        return {
            platform: 'win32',
            arch,
            metadataFile: 'latest.yml',
            requiredAssetNames: ['latest.yml', installer, `${installer}.blockmap`]
        }
    }

    if (platform === 'darwin' && ['x64', 'arm64', 'universal'].includes(arch)) {
        const artifact = `Zyra-${normalizedVersion}-macos-universal`
        return {
            platform: 'darwin',
            arch,
            metadataFile: 'latest-mac.yml',
            requiredAssetNames: ['latest-mac.yml', `${artifact}.dmg`, `${artifact}.zip`, `${artifact}.zip.blockmap`]
        }
    }

    if (platform === 'linux' && arch === 'x64') {
        const artifact = `Zyra-${normalizedVersion}-linux-x64`
        return {
            platform: 'linux',
            arch,
            metadataFile: 'latest-linux.yml',
            requiredAssetNames: ['latest-linux.yml', `${artifact}.AppImage`, `${artifact}.deb`]
        }
    }

    return null
}

function isChannelEligible(
    releaseChannel: ParsedVersion['channel'],
    currentChannel: ParsedVersion['channel'],
    allowPrerelease: boolean
): boolean {
    if (releaseChannel === 'stable') return true
    if (!allowPrerelease) return false
    if (currentChannel === 'beta') return releaseChannel === 'beta'
    if (currentChannel === 'alpha') return true
    return true
}

function hasPlatformAssets(release: GitHubRelease, contract: PlatformReleaseContract): boolean {
    const assetNames = new Set((release.assets || []).map((asset) => String(asset.name || '')))
    return contract.requiredAssetNames.every((assetName) => assetNames.has(assetName))
}

function compareReleaseFeeds(left: GitHubRelease, right: GitHubRelease): number {
    const leftVersion = parseVersion(String(left.tag_name || ''))
    const rightVersion = parseVersion(String(right.tag_name || ''))
    if (!leftVersion || !rightVersion) return 0

    const versionComparison = compareVersions(leftVersion, rightVersion)
    if (versionComparison !== 0) return versionComparison

    const leftPublishedAt = Date.parse(String(left.published_at || ''))
    const rightPublishedAt = Date.parse(String(right.published_at || ''))
    return (Number.isFinite(leftPublishedAt) ? leftPublishedAt : 0)
        - (Number.isFinite(rightPublishedAt) ? rightPublishedAt : 0)
}

function getMetadataAsset(release: GitHubRelease, metadataFile: string): GitHubReleaseAsset | null {
    return (release.assets || []).find((asset) => String(asset.name || '') === metadataFile) || null
}

function getFeedUrl(metadataAsset: GitHubReleaseAsset, metadataFile: string): string | null {
    const downloadUrl = String(metadataAsset.browser_download_url || '').trim()
    if (!downloadUrl) return null

    try {
        const parsed = new URL(downloadUrl)
        if (parsed.protocol !== 'https:' || decodeURIComponent(parsed.pathname).split('/').pop() !== metadataFile) return null
        return new URL('.', parsed).toString()
    } catch {
        return null
    }
}

export function buildPreviousBlockmapBaseUrl(repository: string, currentVersion: string): string {
    const { owner, repo } = parseRepository(repository)
    const parsedVersion = parseVersion(currentVersion)
    if (!parsedVersion) throw new Error(`Invalid current release version "${currentVersion}".`)
    const normalizedVersion = currentVersion.trim().replace(/^v/, '')
    const tagName = `v${normalizedVersion}`
    return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/download/${encodeURIComponent(tagName)}/`
}

export function selectGitHubReleaseFeed(args: {
    repository: string
    currentVersion: string
    allowPrerelease: boolean
    platform: NodeJS.Platform | string
    arch: string
    releases: GitHubRelease[]
}): GitHubReleaseFeed | null {
    const { owner, repo } = parseRepository(args.repository)
    const current = parseVersion(args.currentVersion)
    if (!current) throw new Error(`Invalid current release version "${args.currentVersion}".`)

    const candidates = args.releases
        .flatMap((release) => {
            const tagName = String(release.tag_name || '').trim()
            const version = parseVersion(tagName)
            if (!version || release.draft) return []
            if (Boolean(release.prerelease) !== (version.channel !== 'stable')) return []
            if (!isChannelEligible(version.channel, current.channel, args.allowPrerelease)) return []
            const contract = resolvePlatformReleaseContract(tagName, args.platform, args.arch)
            if (!contract || !hasPlatformAssets(release, contract)) return []
            return [{ release, contract, tagName }]
        })
        .sort((left, right) => compareReleaseFeeds(right.release, left.release))

    for (const candidate of candidates) {
        const metadataAsset = getMetadataAsset(candidate.release, candidate.contract.metadataFile)
        if (!metadataAsset) continue
        const feedUrl = getFeedUrl(metadataAsset, candidate.contract.metadataFile)
        if (!feedUrl) continue

        return {
            feedUrl,
            metadataFile: candidate.contract.metadataFile,
            tagName: candidate.tagName,
            releasePageUrl: String(candidate.release.html_url || '').trim()
                || `https://github.com/${owner}/${repo}/releases/tag/${encodeURIComponent(candidate.tagName)}`,
            previousBlockmapBaseUrlOverride: buildPreviousBlockmapBaseUrl(args.repository, args.currentVersion),
            platform: candidate.contract.platform,
            arch: args.arch
        }
    }

    return null
}

export async function resolveGitHubReleaseFeed(args: {
    repository: string
    currentVersion: string
    allowPrerelease: boolean
    platform?: NodeJS.Platform | string
    arch?: string
}): Promise<GitHubReleaseFeed | null> {
    const { owner, repo } = parseRepository(args.repository)
    const releases = await requestJson<GitHubRelease[]>(
        'api.github.com',
        `/repos/${owner}/${repo}/releases?per_page=50`
    )

    return selectGitHubReleaseFeed({
        ...args,
        platform: args.platform || process.platform,
        arch: args.arch || process.arch,
        releases
    })
}
