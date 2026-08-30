import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { tuiReleaseAssetName } from '../../../scripts/tui-release-contract.mjs'

function arg(name, fallback = null) {
    const inline = process.argv.slice(2).find((value) => value.startsWith(`--${name}=`))
    if (inline) return inline.slice(name.length + 3)
    const index = process.argv.indexOf(`--${name}`)
    return index >= 0 ? process.argv[index + 1] : fallback
}

const directory = path.resolve(arg('dir', '.'))
const assetsDirectory = path.resolve(arg('assets-dir', '.'))
const releaseVersion = arg('version', '')
const expectedWindowsThumbprint = normalizeHex(arg('windows-thumbprint', ''))
const expectedMacosTeamId = String(arg('macos-team-id', '') || '').trim().toUpperCase()
const requireSigning = arg('require-signing', 'false') === 'true'
const markers = new Map()
for (const platform of ['windows', 'macos', 'linux']) {
    const marker = JSON.parse(await readFile(path.join(directory, `${platform}.json`), 'utf8'))
    if (marker.schemaVersion !== 1 || marker.platform !== platform || !Array.isArray(marker.checks)) {
        throw new Error(`Invalid ${platform} signature verification marker`)
    }
    markers.set(platform, marker)
}

if (requireSigning) {
    if (!/^\d+\.\d+\.\d+(?:-(?:alpha|beta)(?:[.-]?\d+)?)?$/.test(releaseVersion)) throw new Error('Tagged publication requires an exact release version for signature evidence')
    if (!/^[A-F0-9]{40}$/.test(expectedWindowsThumbprint)) throw new Error('Tagged publication requires the pinned Windows certificate thumbprint')
    if (!/^[A-Z0-9]{10}$/.test(expectedMacosTeamId)) throw new Error('Tagged publication requires the pinned macOS Team ID')
    const windows = markers.get('windows')
    const macos = markers.get('macos')
    if (windows.signed !== true || !windows.checks.some((check) => check.name === 'authenticode')) {
        throw new Error('Tagged publication requires a verified Windows Authenticode signature')
    }
    if (!windows.checks.some((check) => check.name === 'widevine-vmp')) {
        throw new Error('Tagged publication requires verified Windows Widevine VMP signing')
    }
    if (macos.signed !== true || macos.notarized !== true) {
        throw new Error('Tagged publication requires verified macOS signing and notarization')
    }
    for (const requiredCheck of ['widevine-vmp', 'codesign', 'gatekeeper', 'notarization-staple']) {
        if (!macos.checks.some((check) => check.name === requiredCheck)) {
            throw new Error(`Tagged publication is missing macOS verification: ${requiredCheck}`)
        }
    }
    await validateStandaloneTuiEvidence(windows, 'windows', ['windows-x64'])
    await validateStandaloneTuiEvidence(macos, 'macos', ['macos-arm64', 'macos-x64'])
}

console.log(`Validated native signature markers (signing required: ${requireSigning}).`)

async function validateStandaloneTuiEvidence(marker, platform, targets) {
    const evidence = marker.standaloneTui
    if (evidence?.schemaVersion !== 1 || evidence.version !== releaseVersion || evidence.signed !== true || !Array.isArray(evidence.artifacts)) {
        throw new Error(`Tagged publication requires signed standalone TUI evidence for ${platform}`)
    }
    if (platform === 'macos' && (
        evidence.notarized !== true
        || evidence.notarization?.status !== 'Accepted'
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(evidence.notarization?.id || '')
    )) {
        throw new Error('Tagged publication requires accepted standalone macOS TUI notarization evidence')
    }
    const expectedTargets = [...targets].sort()
    const actualTargets = evidence.artifacts.map((artifact) => artifact.target).sort()
    if (JSON.stringify(actualTargets) !== JSON.stringify(expectedTargets)) {
        throw new Error(`Standalone ${platform} TUI signature targets do not match the release contract`)
    }
    for (const artifact of evidence.artifacts) {
        if (artifact.name !== tuiReleaseAssetName(evidence.version, artifact.target)) {
            throw new Error(`Standalone ${platform} TUI signature evidence has the wrong filename`)
        }
        if (!Number.isInteger(artifact.size) || artifact.size <= 0 || !/^[a-f0-9]{64}$/.test(artifact.sha256 || '')) {
            throw new Error(`Standalone ${platform} TUI signature evidence has invalid artifact integrity data`)
        }
        const thumbprint = normalizeHex(artifact.signatureThumbprint)
        if (!String(artifact.signatureIdentity || '').trim() || !/^[A-F0-9]{40}$/.test(thumbprint)) {
            throw new Error(`Standalone ${platform} TUI signature evidence is missing its signing identity`)
        }
        if (platform === 'windows' && thumbprint !== expectedWindowsThumbprint) {
            throw new Error('Standalone Windows TUI was signed by an unexpected certificate')
        }
        if (platform === 'macos' && (
            String(artifact.teamId || '').toUpperCase() !== expectedMacosTeamId
            || artifact.gatekeeperAssessed !== true
            || !/^[a-f0-9]{64}$/.test(artifact.entitlementsSha256 || '')
        )) {
            throw new Error('Standalone macOS TUI signing identity, entitlements, or Gatekeeper evidence is invalid')
        }
        const target = path.join(assetsDirectory, artifact.name)
        const details = await stat(target)
        if (!details.isFile() || details.size !== artifact.size || await sha256File(target) !== artifact.sha256) {
            throw new Error(`Standalone ${platform} TUI signature evidence does not match released bytes: ${artifact.name}`)
        }
    }
}

function normalizeHex(value) {
    return String(value || '').replace(/[^a-f0-9]/gi, '').toUpperCase()
}

function sha256File(file) {
    return new Promise((resolve, reject) => {
        const hash = createHash('sha256')
        const stream = createReadStream(file)
        stream.on('data', (chunk) => hash.update(chunk))
        stream.once('error', reject)
        stream.once('end', () => resolve(hash.digest('hex')))
    })
}
