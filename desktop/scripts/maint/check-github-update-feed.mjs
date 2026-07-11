import https from 'node:https'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
    compareReleaseVersionStrings,
    resolveGitHubReleaseFeed,
    resolveReleaseChannelForVersion
} from '../../src/main/update/github-release-feed.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function parseArgs(argv) {
    const parsed = {}
    for (let index = 0; index < argv.length; index += 1) {
        const entry = argv[index]
        if (!entry.startsWith('--')) continue
        const key = entry.slice(2)
        const next = argv[index + 1]
        if (!next || next.startsWith('--')) {
            parsed[key] = 'true'
            continue
        }
        parsed[key] = next
        index += 1
    }
    return parsed
}

function parseRepository(repository) {
    const [owner, repo] = String(repository || '').split('/', 2).map((value) => value.trim())
    if (!owner || !repo) {
        throw new Error(`Invalid repository "${repository}". Expected owner/repo.`)
    }
    return { owner, repo }
}

function requestJson(hostname, requestPath) {
    const token = process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim() || ''

    return new Promise((resolve, reject) => {
        const request = https.request({
            protocol: 'https:',
            hostname,
            path: requestPath,
            method: 'GET',
            headers: {
                Accept: 'application/vnd.github+json',
                'User-Agent': 'zyra-update-feed-test',
                ...(token ? {
                    Authorization: `Bearer ${token}`,
                    'X-GitHub-Api-Version': '2022-11-28'
                } : {})
            }
        }, (response) => {
            const chunks = []
            response.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
            response.on('end', () => {
                const raw = Buffer.concat(chunks).toString('utf8')
                const statusCode = response.statusCode ?? 0
                if (statusCode < 200 || statusCode >= 300) {
                    reject(new Error(raw || `GitHub API request failed with status ${statusCode}`))
                    return
                }

                try {
                    resolve(JSON.parse(raw))
                } catch (error) {
                    reject(error)
                }
            })
        })

        request.on('error', reject)
        request.end()
    })
}

function printSection(title, lines) {
    console.log(`\n${title}`)
    for (const line of lines) {
        console.log(line)
    }
}

async function main() {
    const argv = parseArgs(process.argv.slice(2))
    const packageJson = JSON.parse(await readFile(path.join(rootDir, 'package.json'), 'utf8'))
    const publishConfig = Array.isArray(packageJson.build?.publish) ? packageJson.build.publish[0] : packageJson.build?.publish
    const defaultRepository = publishConfig?.provider === 'github'
        ? `${publishConfig.owner}/${publishConfig.repo}`
        : ''

    const currentVersion = argv['current-version'] || packageJson.version
    const repository = argv.repository || process.env.DEVSCOPE_DESKTOP_UPDATE_REPOSITORY || defaultRepository
    const allowPrerelease = argv['allow-prerelease']
        ? argv['allow-prerelease'] === 'true'
        : resolveReleaseChannelForVersion(currentVersion) !== 'stable'

    if (!repository) {
        throw new Error('No repository available. Pass --repository owner/repo or configure package.json build.publish.')
    }

    const { owner, repo } = parseRepository(repository)
    const resolvedFeed = await resolveGitHubReleaseFeed({
        repository,
        currentVersion,
        allowPrerelease
    })
    const selectedTag = resolvedFeed?.tagName || null
    const selectedVersion = selectedTag ? selectedTag.replace(/^v/, '') : null
    const updateAvailable = selectedVersion
        ? compareReleaseVersionStrings(selectedVersion, currentVersion) > 0
        : false

    const selectedRelease = selectedTag
        ? await requestJson('api.github.com', `/repos/${owner}/${repo}/releases/tags/${selectedTag}`)
        : null

    printSection('Update Feed Test', [
        `repository: ${repository}`,
        `currentVersion: ${currentVersion}`,
        `channel: ${resolveReleaseChannelForVersion(currentVersion)}`,
        `allowPrerelease: ${allowPrerelease}`
    ])

    if (!resolvedFeed || !selectedVersion || !selectedRelease) {
        printSection('Result', [
            'No valid GitHub release feed was found.',
            'Expected a non-draft release with latest.yml, a Windows installer .exe, and a .blockmap.'
        ])
        process.exitCode = 1
        return
    }

    printSection('Selected Release', [
        `tag: ${resolvedFeed.tagName}`,
        `prerelease: ${Boolean(selectedRelease.prerelease)}`,
        `publishedAt: ${selectedRelease.published_at || 'unknown'}`,
        `releaseUrl: ${resolvedFeed.releasePageUrl}`,
        `feedUrl: ${resolvedFeed.feedUrl}`
    ])

    printSection('Comparison', [
        `selectedVersion: ${selectedVersion}`,
        `updateAvailable: ${updateAvailable}`,
        updateAvailable
            ? 'Result: the packaged app should see an update for this version/channel.'
            : 'Result: this version/channel is already at or above the selected release.'
    ])
}

main().catch((error) => {
    console.error('\nUpdate Feed Test Failed')
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
})
