import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
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
const releaseValidator = path.join(import.meta.dirname, 'release', 'validate-release-assets.mjs')

async function writePlatformFixture(directory, platform) {
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

for (const platform of ['windows', 'macos', 'linux']) {
    const platformDirectory = await mkdtemp(path.join(os.tmpdir(), `zyra-${platform}-release-assets-`))
    try {
        await writePlatformFixture(platformDirectory, platform)
        const exactValidation = spawnSync(process.execPath, [
            releaseValidator,
            `--platform=${platform}`,
            `--version=${version}`,
            `--dir=${platformDirectory}`,
            '--exact=true'
        ], { encoding: 'utf8' })
        assert.equal(
            exactValidation.status,
            0,
            `${platform} isolated asset validation failed:\n${exactValidation.stdout}\n${exactValidation.stderr}`
        )
        const cwdRelativeValidation = spawnSync(process.execPath, [
            releaseValidator,
            `--platform=${platform}`,
            `--version=${version}`,
            '--dir=.',
            '--exact=true'
        ], { cwd: platformDirectory, encoding: 'utf8' })
        assert.equal(
            cwdRelativeValidation.status,
            0,
            `${platform} cwd-relative asset validation failed:\n${cwdRelativeValidation.stdout}\n${cwdRelativeValidation.stderr}`
        )
    } finally {
        await rm(platformDirectory, { recursive: true, force: true })
    }
}

const directory = await mkdtemp(path.join(os.tmpdir(), 'zyra-release-assets-'))
try {
    for (const platform of ['windows', 'macos', 'linux']) {
        await writePlatformFixture(directory, platform)
    }

    for (const assetName of expectedReleaseAssetNames(version).filter((name) => name.startsWith('Zyra-TUI-'))) {
        await writeFile(path.join(directory, assetName), `standalone fixture:${assetName}\n`, 'utf8')
    }
    assert.equal(expectedReleaseAssetNames(version).length, 14)
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
