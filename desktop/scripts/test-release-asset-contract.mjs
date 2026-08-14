import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile, appendFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
    expectedReleaseAssetNames,
    platformReleaseContract,
    validatePlatformReleaseAssets,
    validateSha256Sums,
    writeSha256Sums
} from './release/release-contract.mjs'

const version = '0.6.0'
const directory = await mkdtemp(path.join(os.tmpdir(), 'zyra-release-assets-'))
try {
    for (const platform of ['windows', 'macos', 'linux']) {
        const contract = platformReleaseContract(version, platform)
        for (const assetName of contract.assets) {
            if (assetName === contract.metadata) continue
            await writeFile(path.join(directory, assetName), `fixture:${assetName}\n`, 'utf8')
        }
        await writeFile(path.join(directory, contract.metadata), [
            `version: ${version}`,
            'files:',
            `  - url: ${contract.primaryUpdateArtifact}`,
            '    sha512: Zml4dHVyZQ==',
            `path: ${contract.primaryUpdateArtifact}`,
            'sha512: Zml4dHVyZQ==',
            'releaseDate: 2026-08-14T00:00:00.000Z',
            ''
        ].join('\n'), 'utf8')
        await validatePlatformReleaseAssets({ directory, version, platform })
    }

    assert.equal(expectedReleaseAssetNames(version).length, 10)
    await writeSha256Sums(directory, version)
    await validateSha256Sums(directory, version)

    const linux = platformReleaseContract(version, 'linux')
    await appendFile(path.join(directory, linux.primaryUpdateArtifact), 'tamper')
    await assert.rejects(
        validateSha256Sums(directory, version),
        /SHA256 mismatch/,
        'checksum validation must reject a changed Linux artifact'
    )
} finally {
    await rm(directory, { recursive: true, force: true })
}

console.log('Zyra assembled release asset contract: ok')
