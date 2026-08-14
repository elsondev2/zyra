import { createHash } from 'node:crypto'
import { copyFile, lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const RELEASE_PLATFORM_KEYS = Object.freeze(['windows', 'macos', 'linux'])

export function normalizeReleasePlatform(value = process.platform) {
    const normalized = String(value).trim().toLowerCase()
    if (['win', 'win32', 'windows'].includes(normalized)) return 'windows'
    if (['darwin', 'mac', 'macos'].includes(normalized)) return 'macos'
    if (normalized === 'linux') return 'linux'
    throw new Error(`Unsupported release platform: ${value}`)
}

export function platformReleaseContract(version, platformInput) {
    const platform = normalizeReleasePlatform(platformInput)
    if (!/^\d+\.\d+\.\d+(?:-(?:alpha|beta)(?:[.-]?\d+)?)?$/.test(version)) {
        throw new Error(`Invalid release version: ${version}`)
    }

    if (platform === 'windows') {
        const installer = `Zyra-Desktop-${version}-Windows-x64.exe`
        return {
            platform,
            builderPlatform: 'win32',
            arch: 'x64',
            metadata: 'latest.yml',
            primaryUpdateArtifact: installer,
            assets: ['latest.yml', installer, `${installer}.blockmap`]
        }
    }
    if (platform === 'macos') {
        const artifact = `Zyra-Desktop-${version}-macOS-universal`
        return {
            platform,
            builderPlatform: 'darwin',
            arch: 'universal',
            metadata: 'latest-mac.yml',
            primaryUpdateArtifact: `${artifact}.zip`,
            assets: ['latest-mac.yml', `${artifact}.dmg`, `${artifact}.zip`, `${artifact}.zip.blockmap`]
        }
    }

    const artifact = `Zyra-Desktop-${version}-Linux-x64`
    return {
        platform,
        builderPlatform: 'linux',
        arch: 'x64',
        metadata: 'latest-linux.yml',
        primaryUpdateArtifact: `${artifact}.AppImage`,
        assets: ['latest-linux.yml', `${artifact}.AppImage`, `${artifact}.deb`]
    }
}

export function expectedReleaseAssetNames(version, options = {}) {
    const platforms = options.platform
        ? [normalizeReleasePlatform(options.platform)]
        : RELEASE_PLATFORM_KEYS
    const assets = platforms.flatMap((platform) => platformReleaseContract(version, platform).assets)
    if (!options.platform) assets.push(`zyra-v${version}.zip`)
    if (options.includeChecksums) assets.push('SHA256SUMS')
    return [...new Set(assets)].sort((left, right) => left.localeCompare(right))
}

async function walkFiles(root, relative = '') {
    const directory = path.join(root, relative)
    const entries = await readdir(directory, { withFileTypes: true })
    const files = []
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
        const childRelative = path.join(relative, entry.name)
        if (entry.isDirectory()) files.push(...await walkFiles(root, childRelative))
        else if (entry.isFile()) files.push(childRelative)
    }
    return files
}

function cleanYamlValue(value) {
    const trimmed = String(value).trim()
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return trimmed.slice(1, -1)
    }
    return trimmed
}

export function parseUpdaterMetadata(text) {
    const versionMatch = text.match(/^version:\s*(.+?)\s*$/m)
    const references = []
    for (const line of text.split(/\r?\n/)) {
        const match = line.match(/^\s*(?:-\s*)?(?:url|path):\s*(.+?)\s*$/)
        if (!match) continue
        const value = cleanYamlValue(match[1])
        if (value && !references.includes(value)) references.push(value)
    }
    return {
        version: versionMatch ? cleanYamlValue(versionMatch[1]) : null,
        references
    }
}

async function mapFilesByBasename(root) {
    const byName = new Map()
    for (const relativePath of await walkFiles(root)) {
        const name = path.basename(relativePath)
        const existing = byName.get(name) || []
        existing.push(relativePath)
        byName.set(name, existing)
    }
    return byName
}

function requireUniqueFile(byName, name, root) {
    const matches = byName.get(name) || []
    if (matches.length === 0) throw new Error(`Missing release asset ${name} under ${root}`)
    if (matches.length > 1) throw new Error(`Release asset ${name} is ambiguous under ${root}: ${matches.join(', ')}`)
    return path.join(root, matches[0])
}

export async function validatePlatformReleaseAssets({ directory, version, platform }) {
    const root = path.resolve(directory)
    const contract = platformReleaseContract(version, platform)
    const byName = await mapFilesByBasename(root)
    const resolved = new Map()
    for (const assetName of contract.assets) {
        const assetPath = requireUniqueFile(byName, assetName, root)
        const stats = await lstat(assetPath)
        if (stats.size <= 0) throw new Error(`Release asset is empty: ${assetName}`)
        resolved.set(assetName, assetPath)
    }

    const metadata = parseUpdaterMetadata(await readFile(resolved.get(contract.metadata), 'utf8'))
    if (metadata.version !== version) {
        throw new Error(`${contract.metadata} version ${metadata.version || 'missing'} does not match ${version}`)
    }
    if (!metadata.references.includes(contract.primaryUpdateArtifact)) {
        throw new Error(`${contract.metadata} does not reference ${contract.primaryUpdateArtifact}`)
    }
    for (const reference of metadata.references) {
        const decodedReference = decodeURIComponent(reference.split('?')[0])
        const referencedName = path.basename(decodedReference)
        requireUniqueFile(byName, referencedName, root)
    }

    return { contract, resolved, metadata }
}

export async function collectPlatformReleaseAssets({ sourceDirectory, outputDirectory, version, platform }) {
    const validation = await validatePlatformReleaseAssets({ directory: sourceDirectory, version, platform })
    const output = path.resolve(outputDirectory)
    await rm(output, { recursive: true, force: true })
    await mkdir(output, { recursive: true })
    for (const assetName of validation.contract.assets) {
        await copyFile(validation.resolved.get(assetName), path.join(output, assetName))
    }
    await validatePlatformReleaseAssets({ directory: output, version, platform })
    return validation.contract.assets.map((name) => path.join(output, name))
}

async function sha256(file) {
    return createHash('sha256').update(await readFile(file)).digest('hex')
}

export async function writeSha256Sums(directory, version) {
    const root = path.resolve(directory)
    const expected = expectedReleaseAssetNames(version)
    const byName = await mapFilesByBasename(root)
    const lines = []
    for (const assetName of expected) {
        const file = requireUniqueFile(byName, assetName, root)
        lines.push(`${await sha256(file)}  ${assetName}`)
    }
    const output = path.join(root, 'SHA256SUMS')
    await writeFile(output, `${lines.join('\n')}\n`, 'utf8')
    return output
}

export async function validateSha256Sums(directory, version) {
    const root = path.resolve(directory)
    const checksumPath = path.join(root, 'SHA256SUMS')
    const lines = (await readFile(checksumPath, 'utf8')).trim().split(/\r?\n/).filter(Boolean)
    const expectedNames = expectedReleaseAssetNames(version)
    const actualNames = []
    for (const line of lines) {
        const match = line.match(/^([a-f0-9]{64})  (.+)$/)
        if (!match) throw new Error(`Invalid SHA256SUMS line: ${line}`)
        const [, expectedHash, name] = match
        actualNames.push(name)
        const actualHash = await sha256(path.join(root, name))
        if (actualHash !== expectedHash) throw new Error(`SHA256 mismatch for ${name}`)
    }
    assertExactNames(actualNames, expectedNames, 'SHA256SUMS')
}

export function assertExactNames(actualNames, expectedNames, label = 'assets') {
    const actual = [...new Set(actualNames)].sort((left, right) => left.localeCompare(right))
    const expected = [...new Set(expectedNames)].sort((left, right) => left.localeCompare(right))
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        const missing = expected.filter((name) => !actual.includes(name))
        const extra = actual.filter((name) => !expected.includes(name))
        throw new Error(`${label} mismatch; missing: ${missing.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'}`)
    }
}
