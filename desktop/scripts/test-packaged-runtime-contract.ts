import assert from 'node:assert/strict'
import { closeSync, mkdtempSync, openSync, readFileSync, readSync, readdirSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { minimatch } from 'minimatch'
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

const macUniversalRuntimePattern = buildConfig.mac.x64ArchFiles
assert.equal(typeof macUniversalRuntimePattern, 'string')
const stagedNodeModules = path.join(runtimeRoot, 'node_modules')
const stagedMachOFiles: Array<{ architecture: 'arm64' | 'x64' | 'universal'; relativePath: string }> = []
const pendingDirectories = [stagedNodeModules]
while (pendingDirectories.length > 0) {
    const directory = pendingDirectories.pop()!
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name)
        if (entry.isDirectory()) {
            pendingDirectories.push(file)
            continue
        }
        if (!entry.isFile()) continue
        const descriptor = openSync(file, 'r')
        const header = Buffer.alloc(8)
        let bytesRead = 0
        try {
            bytesRead = readSync(descriptor, header, 0, header.length, 0)
        } finally {
            closeSync(descriptor)
        }
        if (bytesRead < 8) continue
        const magic = header.subarray(0, 4).toString('hex')
        if (['cafebabe', 'bebafeca', 'cafebabf', 'bfbafeca'].includes(magic)) {
            stagedMachOFiles.push({ architecture: 'universal', relativePath: path.relative(stagedNodeModules, file).split(path.sep).join('/') })
            continue
        }
        const littleEndian = magic === 'cffaedfe' || magic === 'cefaedfe'
        const bigEndian = magic === 'feedfacf' || magic === 'feedface'
        if (!littleEndian && !bigEndian) continue
        const cpuType = littleEndian ? header.readUInt32LE(4) : header.readUInt32BE(4)
        const architecture = cpuType === 0x0100000c
            ? 'arm64'
            : cpuType === 0x01000007
                ? 'x64'
                : null
        assert(architecture, `unsupported thin Mach-O CPU type 0x${cpuType.toString(16)} in ${file}`)
        stagedMachOFiles.push({ architecture, relativePath: path.relative(stagedNodeModules, file).split(path.sep).join('/') })
    }
}
const thinMachOFiles = stagedMachOFiles.filter((file) => file.architecture !== 'universal')
assert(thinMachOFiles.length > 0, 'the staged runtime fixture must exercise architecture-qualified thin Mach-O prebuilds')
for (const file of thinMachOFiles) {
    assert(
        file.relativePath.includes(`darwin-${file.architecture}`),
        `thin Mach-O runtime dependency must be explicitly architecture-qualified: ${file.relativePath}`
    )
    assert(
        minimatch(`Contents/Resources/zyra-runtime/node_modules/${file.relativePath}`, macUniversalRuntimePattern, { matchBase: true }),
        `macOS universal skip-lipo rule does not cover ${file.relativePath}`
    )
}
for (const file of stagedMachOFiles.filter((entry) => entry.architecture === 'universal')) {
    assert(
        !minimatch(`Contents/Resources/zyra-runtime/node_modules/${file.relativePath}`, macUniversalRuntimePattern, { matchBase: true }),
        `macOS skip-lipo rule is too broad and matches an already-universal dependency: ${file.relativePath}`
    )
}

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
