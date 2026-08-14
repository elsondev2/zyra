import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { assertExactNames, expectedReleaseAssetNames } from './release-contract.mjs'

function arg(name, fallback = null) {
    const inline = process.argv.slice(2).find((value) => value.startsWith(`--${name}=`))
    if (inline) return inline.slice(name.length + 3)
    const index = process.argv.indexOf(`--${name}`)
    return index >= 0 ? process.argv[index + 1] : fallback
}

const file = arg('file')
const version = arg('version')
const tag = arg('tag', `v${version}`)
const localDirectory = arg('local-dir')
const expectedSha = arg('sha', process.env.RELEASE_SHA || '')
const expectedBranch = arg('branch', 'master')
if (!file || !version) throw new Error('validate-github-draft requires --file and --version')
const release = JSON.parse(await readFile(file, 'utf8'))
if (release.tagName !== tag) throw new Error(`Draft tag ${release.tagName} does not match ${tag}`)
if (release.isDraft !== true) throw new Error(`Release ${tag} must remain draft until verification completes`)
if (expectedSha && ![expectedSha, expectedBranch].includes(release.targetCommitish)) {
    throw new Error(`Draft target ${release.targetCommitish} is neither release SHA ${expectedSha} nor ${expectedBranch}`)
}
const assets = Array.isArray(release.assets) ? release.assets : []
for (const asset of assets) {
    if (!asset?.name || Number(asset.size) <= 0) throw new Error(`Draft contains an invalid or empty asset: ${asset?.name || 'unknown'}`)
    if (localDirectory) {
        const local = await stat(path.join(localDirectory, asset.name))
        if (local.size !== Number(asset.size)) {
            throw new Error(`Draft asset size mismatch for ${asset.name}: GitHub=${asset.size}, local=${local.size}`)
        }
    }
}
assertExactNames(
    assets.map((asset) => asset.name),
    expectedReleaseAssetNames(version, { includeChecksums: true }),
    `GitHub draft ${tag}`
)
console.log(`Validated GitHub draft ${tag}: ${assets.length} assets.`)
