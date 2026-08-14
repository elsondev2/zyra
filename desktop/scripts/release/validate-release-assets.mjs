import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
    assertExactNames,
    expectedReleaseAssetNames,
    normalizeReleasePlatform,
    RELEASE_PLATFORM_KEYS,
    validatePlatformReleaseAssets,
    validateSha256Sums,
    writeSha256Sums
} from './release-contract.mjs'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(scriptDirectory, '..', '..')

function arg(name, fallback = null) {
    const inline = process.argv.slice(2).find((value) => value.startsWith(`--${name}=`))
    if (inline) return inline.slice(name.length + 3)
    const index = process.argv.indexOf(`--${name}`)
    return index >= 0 ? process.argv[index + 1] : fallback
}

const desktopPackage = JSON.parse(await readFile(path.join(desktopRoot, 'package.json'), 'utf8'))
const version = arg('version', desktopPackage.version)
const platformArg = arg('platform', process.platform)
const directory = path.resolve(desktopRoot, arg('dir', 'dist/release-assets'))
const platforms = platformArg === 'all'
    ? RELEASE_PLATFORM_KEYS
    : [normalizeReleasePlatform(platformArg)]

for (const platform of platforms) {
    const result = await validatePlatformReleaseAssets({ directory, version, platform })
    console.log(`Validated ${platform} updater assets: ${result.contract.assets.join(', ')}`)
}

if (arg('write-checksums') === 'true') {
    await writeSha256Sums(directory, version)
}
if (arg('checksums') === 'true' || arg('write-checksums') === 'true') {
    await validateSha256Sums(directory, version)
    console.log('Validated SHA256SUMS')
}
if (arg('exact') === 'true') {
    const actualNames = (await readdir(directory, { withFileTypes: true }))
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
    assertExactNames(
        actualNames,
        expectedReleaseAssetNames(version, { includeChecksums: arg('checksums') === 'true' || arg('write-checksums') === 'true' }),
        'assembled release assets'
    )
}
