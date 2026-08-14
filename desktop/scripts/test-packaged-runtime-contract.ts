import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { resolveZyraRoot } from '../src/main/zyra/zyra-root'
import { validateRuntimeStage } from './release/runtime-contract.mjs'

const desktopRoot = path.resolve(import.meta.dirname, '..')
const repositoryRoot = path.resolve(desktopRoot, '..')
const rootPackage = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'))
const desktopPackage = JSON.parse(readFileSync(path.join(desktopRoot, 'package.json'), 'utf8'))
const runtimeRoot = path.join(desktopRoot, '.release', 'zyra-runtime')

assert.equal(rootPackage.version, desktopPackage.version, 'Desktop and root versions must be lockstep')
await validateRuntimeStage(runtimeRoot, { expectedVersion: rootPackage.version, requireDependencies: true })

const resourcesPath = path.dirname(runtimeRoot)
const processWithResources = process as NodeJS.Process & { resourcesPath?: string }
const originalDescriptor = Object.getOwnPropertyDescriptor(processWithResources, 'resourcesPath')
try {
    Object.defineProperty(processWithResources, 'resourcesPath', {
        configurable: true,
        value: resourcesPath
    })
    assert.equal(
        resolveZyraRoot(),
        runtimeRoot,
        'a packaged resources/zyra-runtime must win over the source tree that loaded the resolver'
    )
} finally {
    if (originalDescriptor) Object.defineProperty(processWithResources, 'resourcesPath', originalDescriptor)
    else delete processWithResources.resourcesPath
}

const buildConfig = desktopPackage.build
const runtimeResource = (buildConfig.extraResources || []).find((entry: { to?: string }) => entry.to === 'zyra-runtime')
assert(runtimeResource, 'electron-builder must copy the staged runtime to resources/zyra-runtime')
assert.equal(runtimeResource.from, '.release/zyra-runtime')
const runtimeDependencyResource = (buildConfig.extraResources || []).find(
    (entry: { to?: string }) => entry.to === 'zyra-runtime/node_modules'
)
assert(runtimeDependencyResource, 'electron-builder must copy staged dependencies through a non-node_modules matcher root')
assert.equal(runtimeDependencyResource.from, '.release/zyra-runtime/node_modules')
assert.deepEqual(runtimeDependencyResource.filter, ['**/*'])

const outsideCheckout = mkdtempSync(path.join(os.tmpdir(), 'zyra-packaged-runtime-contract-'))
try {
    const sdkUrl = pathToFileURL(path.join(runtimeRoot, 'src', 'zyra-sdk.mjs')).href
    const result = spawnSync(process.execPath, [
        '--input-type=module',
        '--eval',
        `const sdk = await import(${JSON.stringify(sdkUrl)}); if (sdk.defaults.root !== ${JSON.stringify(runtimeRoot)}) process.exit(17);`
    ], {
        cwd: outsideCheckout,
        env: { ...process.env, ZYRA_ROOT: runtimeRoot },
        encoding: 'utf8'
    })
    assert.equal(
        result.status,
        0,
        `staged SDK must import without a neighboring source checkout\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
    )
} finally {
    rmSync(outsideCheckout, { recursive: true, force: true })
}

console.log('Zyra packaged runtime resource contract: ok')
