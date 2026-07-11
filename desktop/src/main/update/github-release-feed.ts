import https from 'node:https'

type GitHubReleaseAsset = {
    name?: string
    browser_download_url?: string
}

type GitHubRelease = {
    tag_name?: string
    html_url?: string
    prerelease?: boolean
    draft?: boolean
    published_at?: string
    assets?: GitHubReleaseAsset[]
}

type ParsedVersion = {
    major: number
    minor: number
    patch: number
    channel: 'alpha' | 'beta' | 'stable'
    previewStep: number
}

export type GitHubReleaseFeed = {
    feedUrl: string
    tagName: string
    releasePageUrl: string
    previousBlockmapBaseUrlOverride: string
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
    const match = version.trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([a-z]+)\.?(\d+)?)?$/i)
    if (!match) return null

    const prerelease = String(match[4] || '').toLowerCase()
    const channel = prerelease.startsWith('alpha')
        ? 'alpha'
        : prerelease.startsWith('beta')
            ? 'beta'
            : 'stable'

    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
        channel,
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
        default:
            return 0
    }
}

function compareVersions(left: ParsedVersion, right: ParsedVersion): number {
    const channelRankDiff = getChannelRank(left.channel) - getChannelRank(right.channel)
    if (channelRankDiff !== 0) return channelRankDiff
    if (left.previewStep !== right.previewStep) return left.previewStep - right.previewStep
    if (left.major !== right.major) return left.major - right.major
    if (left.minor !== right.minor) return left.minor - right.minor
    return left.patch - right.patch
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

function getLatestYmlAsset(release: GitHubRelease): GitHubReleaseAsset | null {
    const assets = Array.isArray(release.assets) ? release.assets : []
    return assets.find((asset) => String(asset.name || '').toLowerCase() === 'latest.yml') || null
}

function hasRequiredWindowsAssets(release: GitHubRelease): boolean {
    const assets = Array.isArray(release.assets) ? release.assets : []
    let hasInstaller = false
    let hasBlockmap = false
    let hasLatestYml = false

    for (const asset of assets) {
        const name = String(asset.name || '').toLowerCase()
        if (name === 'latest.yml') hasLatestYml = true
        if (name.endsWith('.exe')) hasInstaller = true
        if (name.endsWith('.exe.blockmap')) hasBlockmap = true
    }

    return hasInstaller && hasBlockmap && hasLatestYml
}

function compareReleaseFeeds(left: GitHubRelease, right: GitHubRelease): number {
    const leftVersion = parseVersion(String(left.tag_name || ''))
    const rightVersion = parseVersion(String(right.tag_name || ''))

    if (leftVersion && rightVersion) {
        const versionComparison = compareVersions(leftVersion, rightVersion)
        if (versionComparison !== 0) return versionComparison
    }

    const leftPublishedAt = Date.parse(String(left.published_at || ''))
    const rightPublishedAt = Date.parse(String(right.published_at || ''))
    return leftPublishedAt - rightPublishedAt
}

function getFeedUrlFromLatestYml(asset: GitHubReleaseAsset): string | null {
    const downloadUrl = String(asset.browser_download_url || '').trim()
    if (!downloadUrl) return null
    if (!downloadUrl.toLowerCase().endsWith('/latest.yml')) return null
    return downloadUrl.slice(0, -'/latest.yml'.length)
}

export async function resolveGitHubReleaseFeed(args: {
    repository: string
    currentVersion: string
    allowPrerelease: boolean
}): Promise<GitHubReleaseFeed | null> {
    const { owner, repo } = parseRepository(args.repository)
    const releases = await requestJson<GitHubRelease[]>(
        'api.github.com',
        `/repos/${owner}/${repo}/releases?per_page=50`
    )

    const candidates = releases
        .filter((release) => !release.draft)
        .filter((release) => args.allowPrerelease || !release.prerelease)
        .filter(hasRequiredWindowsAssets)
        .sort((left, right) => compareReleaseFeeds(right, left))

    const selectedRelease = candidates[0]
    if (!selectedRelease) return null

    const latestYmlAsset = getLatestYmlAsset(selectedRelease)
    if (!latestYmlAsset) return null

    const feedUrl = getFeedUrlFromLatestYml(latestYmlAsset)
    const tagName = String(selectedRelease.tag_name || '').trim()
    if (!feedUrl || !tagName) return null

    return {
        feedUrl,
        tagName,
        releasePageUrl: String(selectedRelease.html_url || '').trim() || `https://github.com/${owner}/${repo}/releases/tag/${tagName}`,
        previousBlockmapBaseUrlOverride: `https://github.com/${owner}/${repo}/releases/download/v${args.currentVersion}`
    }
}
