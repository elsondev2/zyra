import assert from 'node:assert/strict'
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, readSync, readdirSync, rmSync } from 'node:fs'
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
const stagedSdkSource = readFileSync(path.join(runtimeRoot, 'src', 'zyra-sdk.mjs'), 'utf8')
assert.equal(
    /(?:ensureZyraMemory|runZyraMemoryStartup|injectLayeredMemory|markZyraThreadMemoryPolluted|buildRecommendedPrompts)\(defaults\.root/.test(stagedSdkSource),
    false,
    'packaged memory operations must use the writable data root'
)
assert.equal(stagedSdkSource.includes('memoryRunner(root = defaults.root)'), false)
assert.equal(stagedSdkSource.includes('buildConsolidationPrompt({ ...runtime, root: defaults.root }'), false)

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
type MachOFile = { architecture: 'arm64' | 'x64' | 'universal'; packagedPath: string }
function collectMachOFiles(sourceRoot: string, packagedRoot: string): MachOFile[] {
    const result: MachOFile[] = []
    const pendingDirectories = [sourceRoot]
    while (pendingDirectories.length > 0) {
        const directory = pendingDirectories.pop()!
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
            const file = path.join(directory, entry.name)
            if (entry.isDirectory()) {
                pendingDirectories.push(file)
                continue
            }
            if (!entry.isFile()) continue
            const relativePath = path.relative(sourceRoot, file).split(path.sep).join('/')
            const normalizedPath = relativePath.toLowerCase()
            const plausibleNativeBinary = normalizedPath.includes('darwin')
                || normalizedPath.endsWith('.node')
                || normalizedPath.includes('/native/')
                || normalizedPath.includes('/prebuild')
                || normalizedPath.includes('/bin/')
                || path.posix.extname(normalizedPath) === ''
            if (!plausibleNativeBinary) continue
            const descriptor = openSync(file, 'r')
            const header = Buffer.alloc(8)
            let bytesRead = 0
            try {
                bytesRead = readSync(descriptor, header, 0, header.length, 0)
            } finally {
                closeSync(descriptor)
            }
            if (bytesRead < 8) continue
            const packagedPath = `${packagedRoot}/${relativePath}`
            const magic = header.subarray(0, 4).toString('hex')
            if (['cafebabe', 'bebafeca', 'cafebabf', 'bfbafeca'].includes(magic)) {
                result.push({ architecture: 'universal', packagedPath })
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
            result.push({ architecture, packagedPath })
        }
    }
    return result
}
const runtimeMachOFiles = collectMachOFiles(
    path.join(runtimeRoot, 'node_modules'),
    'Contents/Resources/zyra-runtime/node_modules'
)
const nodePtyMachOFiles = collectMachOFiles(
    path.join(desktopRoot, 'node_modules', 'node-pty'),
    'Contents/Resources/app.asar.unpacked/node_modules/node-pty'
)
const thinRuntimeMachOFiles = runtimeMachOFiles.filter((file) => file.architecture !== 'universal')
assert(thinRuntimeMachOFiles.length > 0, 'the staged runtime fixture must exercise architecture-qualified thin Mach-O prebuilds')
const thinNodePtyMachOFiles = nodePtyMachOFiles.filter((file) => file.architecture !== 'universal')
assert.deepEqual(
    [...new Set(thinNodePtyMachOFiles.map((file) => file.architecture))].sort(),
    ['arm64', 'x64'],
    'unpacked node-pty must exercise both Darwin prebuild architectures'
)
const packagedMachOFiles = [...runtimeMachOFiles, ...nodePtyMachOFiles]
for (const file of packagedMachOFiles.filter((entry) => entry.architecture !== 'universal')) {
    assert(
        file.packagedPath.includes(`darwin-${file.architecture}`),
        `thin Mach-O dependency must be explicitly architecture-qualified: ${file.packagedPath}`
    )
    assert(
        minimatch(file.packagedPath, macUniversalRuntimePattern, { matchBase: true }),
        `macOS universal skip-lipo rule does not cover ${file.packagedPath}`
    )
}
for (const file of packagedMachOFiles.filter((entry) => entry.architecture === 'universal')) {
    assert(
        !minimatch(file.packagedPath, macUniversalRuntimePattern, { matchBase: true }),
        `macOS skip-lipo rule is too broad and matches an already-universal dependency: ${file.packagedPath}`
    )
}

const outsideCheckout = mkdtempSync(path.join(os.tmpdir(), 'zyra-packaged-runtime-contract-'))
try {
    const sdkUrl = pathToFileURL(path.join(runtimeRoot, 'src', 'zyra-sdk.mjs')).href
    const memoryUrl = pathToFileURL(path.join(runtimeRoot, 'src', 'zyra-memory.mjs')).href
    const dataRoot = path.join(outsideCheckout, 'writable-data')
    const result = spawnSync(process.execPath, [
        '--input-type=module',
        '--eval',
        `const fs = await import('node:fs'); const sdk = await import(${JSON.stringify(sdkUrl)}); const memory = await import(${JSON.stringify(memoryUrl)}); if (sdk.defaults.root !== ${JSON.stringify(runtimeRoot)}) process.exit(17); if (sdk.defaults.dataRoot !== ${JSON.stringify(dataRoot)}) process.exit(18); memory.ensureZyraMemory(sdk.defaults.dataRoot); if (!fs.existsSync(${JSON.stringify(path.join(dataRoot, '.zyra', 'memory'))})) process.exit(19);`
    ], {
        cwd: outsideCheckout,
        env: { ...process.env, ZYRA_ROOT: runtimeRoot, ZYRA_DATA_ROOT: dataRoot },
        encoding: 'utf8'
    })
    assert.equal(
        result.status,
        0,
        `staged SDK must import without a neighboring source checkout\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
    )

    if (process.platform === 'win32') {
        assert.equal(existsSync(path.join(resourcesPath, 'zyra-node', 'node.exe')), true, 'Windows resources include a pinned Node executable')
    } else {
        assert.equal(existsSync(path.join(resourcesPath, 'zyra-node', 'electron-run-as-node.txt')), true, 'Unix resources declare the signed Electron Node runtime')
    }
    const agentState = path.join(outsideCheckout, 'agent-state')
    const clientUrl = pathToFileURL(path.join(runtimeRoot, 'src', 'agent-server', 'client.mjs')).href
    const agentSmoke = spawnSync(process.execPath, [
        '--input-type=module',
        '--eval',
        `Object.defineProperty(process.versions, 'electron', { value: 'packaged-test', configurable: true }); Object.defineProperty(process, 'resourcesPath', { value: ${JSON.stringify(resourcesPath)}, configurable: true }); const { ZyraAgentServerClient } = await import(${JSON.stringify(clientUrl)}); const client = new ZyraAgentServerClient({ root: ${JSON.stringify(runtimeRoot)}, stateDirectory: ${JSON.stringify(agentState)}, channel: 'packaged-smoke' }); await client.connect(); const status = await client.request('server.status'); if (!status.pid) process.exit(21); client.close();`
    ], {
        cwd: outsideCheckout,
        env: { ...process.env, PATH: '', ZYRA_DATA_ROOT: dataRoot },
        encoding: 'utf8',
        timeout: 45_000
    })
    assert.equal(
        agentSmoke.status,
        0,
        `packaged agent server must start without system Node on PATH\nstdout: ${agentSmoke.stdout}\nstderr: ${agentSmoke.stderr}`
    )
    const descriptor = JSON.parse(readFileSync(path.join(agentState, 'agent-server-packaged-smoke.json'), 'utf8'))
    try { process.kill(Number(descriptor.pid)) } catch {}
} finally {
    rmSync(outsideCheckout, { recursive: true, force: true })
}

console.log('Zyra packaged runtime resource contract: ok')
