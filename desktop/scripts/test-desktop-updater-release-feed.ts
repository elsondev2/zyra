import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
    buildPreviousBlockmapBaseUrl,
    compareReleaseVersionStrings,
    resolvePlatformReleaseContract,
    selectGitHubReleaseFeed,
    type GitHubRelease
} from '../src/main/update/github-release-feed'
import { getAutoUpdateDisabledReason } from '../src/main/update/update-state'

assert.match(getAutoUpdateDisabledReason({ isPackaged: true, disabledByEnv: false, platform: 'linux', appImagePath: null }) || '', /AppImage/)
assert.equal(getAutoUpdateDisabledReason({ isPackaged: true, disabledByEnv: false, platform: 'linux', appImagePath: '/tmp/Zyra.AppImage' }), null)

function release(
    version: string,
    platform: 'win32' | 'darwin' | 'linux',
    arch: string,
    options: { incomplete?: boolean; prerelease?: boolean; publishedAt?: string } = {}
): GitHubRelease {
    const tagName = version.startsWith('v') ? version : `v${version}`
    const contract = resolvePlatformReleaseContract(version, platform, arch)
    assert(contract, `fixture contract must exist for ${platform}/${arch}`)
    const requiredNames = options.incomplete
        ? contract.requiredAssetNames.filter((name) => !name.endsWith('.blockmap'))
        : contract.requiredAssetNames
    return {
        tag_name: tagName,
        html_url: `https://github.com/justelson/zyra/releases/tag/${tagName}`,
        prerelease: options.prerelease ?? version.includes('-'),
        draft: false,
        published_at: options.publishedAt || '2026-08-14T00:00:00.000Z',
        assets: requiredNames.map((name) => ({
            name,
            browser_download_url: `https://github.com/justelson/zyra/releases/download/${tagName}/${name}`
        }))
    }
}

assert(compareReleaseVersionStrings('0.7.0-alpha.1', '0.6.99') > 0, 'core semver must sort before channel rank')
assert(compareReleaseVersionStrings('0.6.0', '0.6.0-beta.99') > 0, 'stable must beat beta for equal core')
assert(compareReleaseVersionStrings('0.6.0-beta.1', '0.6.0-alpha.99') > 0, 'beta must beat alpha for equal core')
assert(compareReleaseVersionStrings('0.6.0-alpha.2', '0.6.0-alpha.1') > 0, 'preview steps must sort within a channel')
assert.throws(() => compareReleaseVersionStrings('0.6.0-rc.1', '0.6.0'), /invalid release versions/)
assert.throws(() => compareReleaseVersionStrings('0.6.0-beta', '0.6.0'), /invalid release versions/)
assert.throws(() => compareReleaseVersionStrings('0.6.0-alpha-1', '0.6.0'), /invalid release versions/)

const windowsFeed = selectGitHubReleaseFeed({
    repository: 'justelson/zyra',
    currentVersion: '0.5.0',
    allowPrerelease: false,
    platform: 'win32',
    arch: 'x64',
    releases: [
        release('0.6.1', 'win32', 'x64', { incomplete: true, publishedAt: '2026-08-15T00:00:00.000Z' }),
        release('0.6.0', 'win32', 'x64')
    ]
})
assert(windowsFeed)
assert.equal(windowsFeed.tagName, 'v0.6.0', 'an incomplete newer release must not hide the latest complete release')
assert.equal(windowsFeed.metadataFile, 'latest.yml')
assert.equal(windowsFeed.feedUrl, 'https://github.com/justelson/zyra/releases/download/v0.6.0/')
assert.equal(windowsFeed.previousBlockmapBaseUrlOverride, 'https://github.com/justelson/zyra/releases/download/v0.5.0/')

const stableFeed = selectGitHubReleaseFeed({
    repository: 'justelson/zyra',
    currentVersion: '0.5.0',
    allowPrerelease: false,
    platform: 'win32',
    arch: 'x64',
    releases: [release('0.7.0-beta.1', 'win32', 'x64'), release('0.6.0', 'win32', 'x64')]
})
assert.equal(stableFeed?.tagName, 'v0.6.0', 'stable installs must ignore prereleases')

const betaFeed = selectGitHubReleaseFeed({
    repository: 'justelson/zyra',
    currentVersion: '0.6.0-beta.1',
    allowPrerelease: true,
    platform: 'win32',
    arch: 'x64',
    releases: [
        release('0.8.0-alpha.1', 'win32', 'x64'),
        release('0.7.0-beta.2', 'win32', 'x64'),
        release('0.6.0', 'win32', 'x64')
    ]
})
assert.equal(betaFeed?.tagName, 'v0.7.0-beta.2', 'beta installs must not cross onto the alpha channel')

const alphaFeed = selectGitHubReleaseFeed({
    repository: 'justelson/zyra',
    currentVersion: '0.6.0-alpha.1',
    allowPrerelease: true,
    platform: 'win32',
    arch: 'x64',
    releases: [release('0.8.0-alpha.1', 'win32', 'x64'), release('0.7.0', 'win32', 'x64')]
})
assert.equal(alphaFeed?.tagName, 'v0.8.0-alpha.1', 'alpha installs may follow the newest semver core')

const macFeed = selectGitHubReleaseFeed({
    repository: 'justelson/zyra',
    currentVersion: '0.5.0',
    allowPrerelease: false,
    platform: 'darwin',
    arch: 'arm64',
    releases: [release('0.6.0', 'darwin', 'arm64')]
})
assert.equal(macFeed?.metadataFile, 'latest-mac.yml')
assert.equal(macFeed?.tagName, 'v0.6.0')
assert.equal(selectGitHubReleaseFeed({
    repository: 'justelson/zyra',
    currentVersion: '0.5.0',
    allowPrerelease: false,
    platform: 'darwin',
    arch: 'x64',
    releases: [release('0.6.0', 'win32', 'x64')]
}), null, 'a Windows-only release cannot become the macOS feed')

const linuxFeed = selectGitHubReleaseFeed({
    repository: 'justelson/zyra',
    currentVersion: '0.5.0',
    allowPrerelease: false,
    platform: 'linux',
    arch: 'x64',
    releases: [release('0.6.0', 'linux', 'x64')]
})
assert.equal(linuxFeed?.metadataFile, 'latest-linux.yml')
assert.equal(linuxFeed?.tagName, 'v0.6.0')
const incompleteLinux = release('0.6.1', 'linux', 'x64')
incompleteLinux.assets = incompleteLinux.assets?.filter((asset) => !asset.name?.endsWith('.deb'))
assert.equal(selectGitHubReleaseFeed({
    repository: 'justelson/zyra',
    currentVersion: '0.5.0',
    allowPrerelease: false,
    platform: 'linux',
    arch: 'x64',
    releases: [incompleteLinux]
}), null, 'Linux feed selection requires both AppImage and deb release artifacts')

assert.equal(resolvePlatformReleaseContract('0.6.0', 'win32', 'arm64'), null, 'Windows ARM64 is not a published v0.6 target')
assert.equal(resolvePlatformReleaseContract('0.6.0', 'linux', 'arm64'), null, 'Linux ARM64 is not a published v0.6 target')
assert.equal(
    buildPreviousBlockmapBaseUrl('justelson/zyra', 'v0.6.0-beta.2'),
    'https://github.com/justelson/zyra/releases/download/v0.6.0-beta.2/'
)

const managerSource = readFileSync(new URL('../src/main/update/manager.ts', import.meta.url), 'utf8')
assert.equal(
    managerSource.match(/disableDifferentialDownload = false/g)?.length,
    2,
    'checks and downloads must keep differential updates enabled after feed resolution'
)

console.log('Zyra cross-platform updater release feed contract: ok')
