import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expectedReleaseAssetNames, platformReleaseContract } from './release/release-contract.mjs'
import { resolvePlatformReleaseContract } from '../src/main/update/github-release-feed'

const desktopRoot = path.resolve(import.meta.dirname, '..')
const repositoryRoot = path.resolve(desktopRoot, '..')
const readJson = (file: string) => JSON.parse(readFileSync(file, 'utf8'))
const rootPackage = readJson(path.join(repositoryRoot, 'package.json'))
const rootLock = readJson(path.join(repositoryRoot, 'package-lock.json'))
const desktopPackage = readJson(path.join(desktopRoot, 'package.json'))
const desktopLock = readJson(path.join(desktopRoot, 'package-lock.json'))
const build = desktopPackage.build

assert.equal(rootPackage.version, '0.6.0')
assert.equal(desktopPackage.version, rootPackage.version, 'root and Desktop versions must be lockstep')
assert.equal(rootLock.version, rootPackage.version)
assert.equal(rootLock.packages[''].version, rootPackage.version)
assert.equal(desktopLock.version, desktopPackage.version)
assert.equal(desktopLock.packages[''].version, desktopPackage.version)
assert.equal(desktopPackage.name, 'zyra-desktop')
assert.equal(desktopPackage.private, true)
assert.equal(desktopLock.name, 'zyra-desktop')
assert.equal(desktopLock.packages[''].name, 'zyra-desktop')
assert.equal(rootPackage.license, 'Apache-2.0')
assert.equal(desktopPackage.license, 'Apache-2.0')

assert.equal(build.appId, 'app.zyra.desktop')
assert.equal(build.productName, 'Zyra')
assert.equal(desktopPackage.devDependencies.electron, '43.4.0', 'Electron must remain deliberately pinned')
assert.equal(desktopLock.packages['node_modules/electron'].version, '43.4.0')
assert.equal(desktopPackage.devDependencies['electron-builder'], '26.15.3')
assert.equal(desktopLock.packages['node_modules/electron-builder'].version, '26.15.3')
assert.equal(desktopPackage.dependencies['node-pty'], '1.1.0', 'node-pty ABI input must be pinned')
assert.equal(build.npmRebuild, false, 'Node-API node-pty binaries must not be forced through Electron ABI rebuilds')
assert(build.asarUnpack.includes('node_modules/node-pty/**'))
assert(desktopPackage.scripts.postinstall.includes('verify-node-pty-install.mjs'))
assert(desktopPackage.scripts['native:prepare'].includes('verify-node-pty-install.mjs'))
assert(desktopPackage.scripts['test:native-abi'].includes('test-node-pty-electron.mjs'))
const packageScript = readFileSync(path.join(desktopRoot, 'scripts', 'release', 'package-desktop.mjs'), 'utf8')
assert(packageScript.includes('validate-packaged-app.mjs'), 'every native package must validate its installed resource layout')

const globalResources = build.extraResources
assert(globalResources.some((entry: { from: string; to: string }) => entry.from === '.release/zyra-runtime' && entry.to === 'zyra-runtime'))
assert(globalResources.some((entry: { to: string }) => entry.to === 'zyra-browser-control-extension'))
assert(!globalResources.some((entry: { to: string }) => entry.to === 'zyra-computer-use'), 'Windows sidecar cannot be a global resource')
assert(build.win.extraResources.some((entry: { to: string }) => entry.to === 'zyra-computer-use'))

assert.deepEqual(build.win.target, [{ target: 'nsis', arch: ['x64'] }])
assert.equal(build.win.artifactName, 'Zyra-${version}-windows-${arch}-setup.${ext}')
assert.equal(build.nsis.oneClick, false)
assert.equal(build.nsis.allowToChangeInstallationDirectory, true)
assert.equal(build.nsis.include, 'build/installer.nsh')
assert.deepEqual(build.mac.target, [
    { target: 'dmg', arch: ['universal'] },
    { target: 'zip', arch: ['universal'] }
])
assert.equal(build.mac.artifactName, 'Zyra-${version}-macos-${arch}.${ext}')
assert.equal(build.mac.hardenedRuntime, true)
assert.equal(build.mac.category, 'public.app-category.developer-tools')
assert.match(build.mac.extendInfo.NSMicrophoneUsageDescription, /microphone/i)
assert.equal(build.mac.entitlements, 'build/entitlements.mac.plist')
assert.equal(build.mac.entitlementsInherit, 'build/entitlements.mac.inherit.plist')
assert.deepEqual(build.linux.target, [
    { target: 'AppImage', arch: ['x64'] },
    { target: 'deb', arch: ['x64'] }
])
assert.equal(build.linux.artifactName, 'Zyra-${version}-linux-${arch}.${ext}')
assert.equal(build.linux.icon, 'resources/icons')
assert.equal(build.fileAssociations[0].icon, 'resources/icon')
assert.equal(build.generateUpdatesFilesForAllChannels, true)

for (const platform of ['windows', 'macos', 'linux'] as const) {
    const contract = platformReleaseContract(rootPackage.version, platform)
    assert(contract.assets.every((name) => name.includes(rootPackage.version) || name.startsWith('latest')))
    const updaterContract = resolvePlatformReleaseContract(
        rootPackage.version,
        platform === 'windows' ? 'win32' : platform === 'macos' ? 'darwin' : 'linux',
        platform === 'macos' ? 'arm64' : 'x64'
    )
    assert.deepEqual(updaterContract?.requiredAssetNames, contract.assets, `${platform} build and updater asset contracts must match`)
}
assert.equal(expectedReleaseAssetNames(rootPackage.version).length, 10)

const electronConfig = readFileSync(path.join(desktopRoot, 'electron.vite.config.ts'), 'utf8')
const browserConfig = readFileSync(path.join(desktopRoot, 'vite.browser.config.ts'), 'utf8')
const updatesSource = readFileSync(path.join(desktopRoot, 'src', 'renderer', 'src', 'lib', 'app-updates.tsx'), 'utf8')
const buildMetadataSource = readFileSync(path.join(desktopRoot, 'src', 'renderer', 'src', 'lib', 'release-build-metadata.ts'), 'utf8')
assert(electronConfig.includes('__ZYRA_DESKTOP_VERSION__: JSON.stringify(desktopVersion)'))
assert(browserConfig.includes('__ZYRA_DESKTOP_VERSION__: JSON.stringify(desktopVersion)'))
assert(updatesSource.includes('reportHostDesktopVersion'), 'Desktop and Browser update surfaces must report the host package version')
assert(buildMetadataSource.includes('__ZYRA_DESKTOP_VERSION__'))

const ciWorkflow = readFileSync(path.join(repositoryRoot, '.github', 'workflows', 'desktop-ci.yml'), 'utf8')
const releaseWorkflow = readFileSync(path.join(repositoryRoot, '.github', 'workflows', 'desktop-release.yml'), 'utf8')
assert(ciWorkflow.includes('windows-2025') && ciWorkflow.includes('macos-15') && ciWorkflow.includes('ubuntu-24.04'))
assert(releaseWorkflow.includes('workflow_dispatch:') && releaseWorkflow.includes('tags:'))
assert(releaseWorkflow.includes('Create or verify the private draft'))
assert(releaseWorkflow.includes('validate-github-draft.mjs'))
assert(releaseWorkflow.includes('--sha="${RELEASE_SHA}" --branch=master'))
assert(releaseWorkflow.includes('RELEASE_SHA: ${{ needs.preflight.outputs.head }}'))
assert(releaseWorkflow.indexOf('Create or verify the private draft') < releaseWorkflow.indexOf('Publish only the signed and notarized tagged candidate'))
assert(releaseWorkflow.includes('Keep unsigned workflow-dispatch builds unpublished'))
assert(releaseWorkflow.includes("needs.preflight.outputs.publish != 'true'"))
assert(releaseWorkflow.includes("needs.preflight.outputs.publish == 'true'"))
assert(releaseWorkflow.includes('gh release upload "${RELEASE_TAG}" release-assets/* --repo "${GITHUB_REPOSITORY}" --clobber'))
assert(!releaseWorkflow.includes('origin/main') && !releaseWorkflow.includes('refs/remotes/origin/main'))
for (const secret of [
    'ZYRA_WINDOWS_CERTIFICATE',
    'ZYRA_WINDOWS_CERTIFICATE_PASSWORD',
    'ZYRA_MACOS_CERTIFICATE',
    'ZYRA_MACOS_CERTIFICATE_PASSWORD',
    'ZYRA_MACOS_NOTARIZATION_API_KEY',
    'ZYRA_MACOS_NOTARIZATION_KEY_ID',
    'ZYRA_MACOS_NOTARIZATION_ISSUER_ID'
]) {
    assert(releaseWorkflow.includes(secret), `release workflow must gate ${secret}`)
}

console.log('Zyra Desktop v0.6.0 release infrastructure contract: ok')
