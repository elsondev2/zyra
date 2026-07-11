import { createReadStream } from 'node:fs'
import { access, readFile, stat } from 'node:fs/promises'
import https from 'node:https'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { buildReleaseNotes } from './release-notes.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

const packageJson = JSON.parse(
    await readFile(path.join(rootDir, 'package.json'), 'utf8')
)

const buildConfig = packageJson.build || {}
const publishConfig = Array.isArray(buildConfig.publish) ? buildConfig.publish[0] : buildConfig.publish

if (!publishConfig || publishConfig.provider !== 'github') {
    throw new Error('package.json build.publish must contain a GitHub provider configuration')
}

const owner = publishConfig.owner
const repo = publishConfig.repo
const version = packageJson.version
const tagName = `v${version}`
const releaseDir = path.join(rootDir, 'dist', 'releases', `v${version}`)
const installerName = `Zyra-Setup-${version}.exe`
const blockmapName = `${installerName}.blockmap`
const requiredAssetNames = [installerName, blockmapName, 'latest.yml']

const args = new Set(process.argv.slice(2))
const shouldSkipPush = args.has('--skip-push')
const shouldSkipTag = args.has('--skip-tag')
const shouldSkipAssetUpload = args.has('--skip-assets')

function log(message) {
    console.log(`[publish-local-release] ${message}`)
}

function formatReleaseTitle(versionString) {
    const match = String(versionString).trim().match(/^(\d+)\.(\d+)\.(\d+)(?:-([a-z]+)\.?(\d+)?)?$/i)
    if (!match) {
        return `Zyra ${versionString}`
    }

    const [, major, minor, patch, channel] = match
    const displayVersion = `v${major}.${minor}.${patch}`
    if (!channel) {
        return `Zyra ${displayVersion}`
    }

    return `Zyra ${displayVersion} ${channel.toLowerCase()}`
}

const releaseName = formatReleaseTitle(version)

function runCommand(command, commandArgs, options = {}) {
    return new Promise((resolve, reject) => {
        const { input, quiet = false, ...spawnOptions } = options
        const child = spawn(command, commandArgs, {
            cwd: rootDir,
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: process.platform === 'win32',
            ...spawnOptions
        })

        let stdout = ''
        let stderr = ''

        child.stdout?.on('data', (chunk) => {
            const text = String(chunk)
            stdout += text
            if (!quiet) process.stdout.write(text)
        })

        child.stderr?.on('data', (chunk) => {
            const text = String(chunk)
            stderr += text
            if (!quiet) process.stderr.write(text)
        })

        child.on('error', reject)
        if (typeof input === 'string') {
            child.stdin?.write(input)
            child.stdin?.end()
        }
        child.on('exit', (code) => {
            if (code === 0) {
                resolve({ stdout, stderr })
                return
            }

            reject(new Error(`${command} ${commandArgs.join(' ')} exited with code ${code ?? 'unknown'}`))
        })
    })
}

async function runGit(argsList, options) {
    return runCommand('git', argsList, options)
}

async function fileExists(targetPath) {
    try {
        await access(targetPath)
        return true
    } catch {
        return false
    }
}

async function ensureRequiredAssetsExist() {
    for (const assetName of requiredAssetNames) {
        const assetPath = path.join(releaseDir, assetName)
        if (!(await fileExists(assetPath))) {
            throw new Error(`Missing required release asset: ${assetPath}`)
        }
    }
}

async function ensureLatestYmlMatchesInstaller() {
    const latestYmlPath = path.join(releaseDir, 'latest.yml')
    const latestYml = await readFile(latestYmlPath, 'utf8')
    const expectedPathLine = `path: ${installerName}`
    const expectedUrlLine = `  - url: ${installerName}`

    if (!latestYml.includes(expectedPathLine) || !latestYml.includes(expectedUrlLine)) {
        throw new Error(`latest.yml does not point at ${installerName}`)
    }
}

async function ensureCleanGitState() {
    const { stdout } = await runGit(['status', '--porcelain'])
    if (stdout.trim().length > 0) {
        throw new Error('Git worktree is not clean. Commit or stash changes before publishing a local release.')
    }
}

async function ensureOnMainBranch() {
    const { stdout } = await runGit(['branch', '--show-current'])
    const branch = stdout.trim()
    if (branch !== 'main') {
        throw new Error(`Releases must be published from main. Current branch: ${branch || 'unknown'}`)
    }
}

async function ensureLocalTag() {
    const { stdout } = await runGit(['tag', '--list', tagName])
    if (stdout.trim() === tagName) {
        return
    }

    if (shouldSkipTag) {
        throw new Error(`Missing local tag ${tagName} and --skip-tag was provided`)
    }

    log(`Creating local tag ${tagName}`)
    await runGit(['tag', '-a', tagName, '-m', tagName])
}

function getTokenFromEnv() {
    for (const key of ['GITHUB_TOKEN', 'GH_TOKEN']) {
        const value = process.env[key]
        if (value && value.trim()) return value.trim()
    }
    return null
}

async function getTokenFromGitCredential() {
    const helperInput = 'protocol=https\nhost=github.com\n\n'
    const { stdout } = await runCommand('git', ['credential', 'fill'], {
        input: helperInput,
        quiet: true
    })
    const fields = new Map()
    for (const line of stdout.split(/\r?\n/)) {
        if (!line) continue
        const [key, ...rest] = line.split('=')
        if (!key || rest.length === 0) continue
        fields.set(key, rest.join('='))
    }
    const token = fields.get('password')
    return token?.trim() || null
}

async function getGitHubToken() {
    const envToken = getTokenFromEnv()
    if (envToken) return envToken

    const credentialToken = await getTokenFromGitCredential()
    if (credentialToken) return credentialToken

    throw new Error('No GitHub token available. Set GITHUB_TOKEN/GH_TOKEN or configure git credential helper access for github.com.')
}

function githubRequest({ method = 'GET', hostname = 'api.github.com', requestPath, token, headers = {}, body = null }) {
    return new Promise((resolve, reject) => {
        const request = https.request({
            protocol: 'https:',
            hostname,
            path: requestPath,
            method,
            headers: {
                'User-Agent': 'zyra-local-release',
                Accept: 'application/vnd.github+json',
                Authorization: `Bearer ${token}`,
                'X-GitHub-Api-Version': '2022-11-28',
                ...headers
            }
        }, (response) => {
            const chunks = []
            response.on('data', (chunk) => chunks.push(chunk))
            response.on('end', () => {
                const raw = Buffer.concat(chunks).toString('utf8')
                const isJson = String(response.headers['content-type'] || '').includes('application/json')
                const parsed = isJson && raw ? JSON.parse(raw) : raw
                const statusCode = response.statusCode ?? 0

                if (statusCode >= 200 && statusCode < 300) {
                    resolve(parsed)
                    return
                }

                const errorMessage = typeof parsed === 'object' && parsed && 'message' in parsed
                    ? parsed.message
                    : raw || `GitHub request failed with status ${statusCode}`
                reject(new Error(errorMessage))
            })
        })

        request.on('error', reject)

        if (body) {
            request.write(body)
        }

        request.end()
    })
}

async function uploadAsset({ token, releaseId, assetName }) {
    const assetPath = path.join(releaseDir, assetName)
    const assetStat = await stat(assetPath)
    const uploadPath = `/repos/${owner}/${repo}/releases/${releaseId}/assets?name=${encodeURIComponent(assetName)}`

    return new Promise((resolve, reject) => {
        const request = https.request({
            protocol: 'https:',
            hostname: 'uploads.github.com',
            path: uploadPath,
            method: 'POST',
            headers: {
                'User-Agent': 'zyra-local-release',
                Accept: 'application/vnd.github+json',
                Authorization: `Bearer ${token}`,
                'X-GitHub-Api-Version': '2022-11-28',
                'Content-Type': 'application/octet-stream',
                'Content-Length': assetStat.size
            }
        }, (response) => {
            const chunks = []
            response.on('data', (chunk) => chunks.push(chunk))
            response.on('end', () => {
                const raw = Buffer.concat(chunks).toString('utf8')
                const parsed = raw ? JSON.parse(raw) : {}
                const statusCode = response.statusCode ?? 0

                if (statusCode >= 200 && statusCode < 300) {
                    resolve(parsed)
                    return
                }

                const errorMessage = parsed?.message || raw || `GitHub asset upload failed with status ${statusCode}`
                reject(new Error(errorMessage))
            })
        })

        request.on('error', reject)

        const fileStream = createReadStream(assetPath)
        fileStream.on('error', reject)
        fileStream.pipe(request)
    })
}

async function pushMainAndTag() {
    if (shouldSkipPush) {
        log('Skipping git push (--skip-push)')
        return
    }

    log(`Pushing main and ${tagName} to origin`)
    await runGit(['push', 'origin', 'main', tagName], {
        stdio: 'inherit'
    })
}

async function getReleaseByTag(token) {
    try {
        return await githubRequest({
            requestPath: `/repos/${owner}/${repo}/releases/tags/${tagName}`,
            token
        })
    } catch (error) {
        if (error instanceof Error && error.message.includes('Not Found')) {
            return null
        }
        throw error
    }
}

async function ensureRelease(token) {
    const existing = await getReleaseByTag(token)
    const releaseNotes = await buildReleaseNotes({
        rootDir,
        owner,
        repo,
        version,
        currentTag: tagName
    })
    const previousReleaseLabel = releaseNotes.previousTag || 'no previous release tag'
    log(`Release notes compare: ${previousReleaseLabel} -> ${tagName} (${releaseNotes.commitCount} commits)`)

    const releasePayload = JSON.stringify({
        tag_name: tagName,
        target_commitish: 'main',
        name: releaseName,
        prerelease: version.includes('-alpha.') || version.includes('-beta.'),
        draft: false,
        body: releaseNotes.body,
        generate_release_notes: false
    })

    if (existing) {
        log(`Updating existing release ${existing.id}`)
        return githubRequest({
            method: 'PATCH',
            requestPath: `/repos/${owner}/${repo}/releases/${existing.id}`,
            token,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(releasePayload)
            },
            body: releasePayload
        })
    }

    log(`Creating release ${releaseName}`)
    return githubRequest({
        method: 'POST',
        requestPath: `/repos/${owner}/${repo}/releases`,
        token,
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(releasePayload)
        },
        body: releasePayload
    })
}

async function deleteConflictingAssets(token, release) {
    const assets = Array.isArray(release.assets) ? release.assets : []
    for (const asset of assets) {
        if (!requiredAssetNames.includes(asset.name)) continue

        log(`Deleting existing release asset ${asset.name}`)
        await githubRequest({
            method: 'DELETE',
            requestPath: `/repos/${owner}/${repo}/releases/assets/${asset.id}`,
            token
        })
    }
}

async function verifyUploadedAssets(token) {
    const release = await getReleaseByTag(token)
    if (!release) {
        throw new Error(`Release ${tagName} was not found after upload`)
    }

    const assets = new Map((release.assets || []).map((asset) => [asset.name, asset]))
    for (const assetName of requiredAssetNames) {
        const asset = assets.get(assetName)
        if (!asset || asset.state !== 'uploaded') {
            throw new Error(`Release asset verification failed for ${assetName}`)
        }
    }

    return release
}

await ensureRequiredAssetsExist()
await ensureLatestYmlMatchesInstaller()
await ensureCleanGitState()
await ensureOnMainBranch()
await ensureLocalTag()

const token = await getGitHubToken()

await pushMainAndTag()

let release = await ensureRelease(token)

if (!shouldSkipAssetUpload) {
    await deleteConflictingAssets(token, release)

    for (const assetName of requiredAssetNames) {
        log(`Uploading ${assetName}`)
        await uploadAsset({
            token,
            releaseId: release.id,
            assetName
        })
    }
}

release = await verifyUploadedAssets(token)

log(`Release ready: ${release.html_url}`)
for (const asset of release.assets) {
    if (!requiredAssetNames.includes(asset.name)) continue
    log(`Asset uploaded: ${asset.name}`)
}
