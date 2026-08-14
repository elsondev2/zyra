import { access, lstat, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { normalizeReleasePlatform } from './release-contract.mjs'
import { validateRuntimeStage } from './runtime-contract.mjs'

function arg(name, fallback = null) {
    const inline = process.argv.slice(2).find((value) => value.startsWith(`--${name}=`))
    if (inline) return inline.slice(name.length + 3)
    const index = process.argv.indexOf(`--${name}`)
    return index >= 0 ? process.argv[index + 1] : fallback
}

async function exists(target) {
    try {
        await access(target)
        return true
    } catch {
        return false
    }
}

async function findResourcesDirectory(root, depth = 0) {
    if (depth > 5) return null
    if (await exists(path.join(root, 'app.asar'))) return root
    const entries = await readdir(root, { withFileTypes: true })
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
        if (!entry.isDirectory()) continue
        const found = await findResourcesDirectory(path.join(root, entry.name), depth + 1)
        if (found) return found
    }
    return null
}

async function requireNonempty(file, label) {
    const stats = await lstat(file).catch(() => null)
    if (!stats?.isFile() || stats.size <= 0) throw new Error(`${label} is missing or empty: ${file}`)
}

async function requireOne(files, label) {
    for (const file of files) {
        const stats = await lstat(file).catch(() => null)
        if (stats?.isFile() && stats.size > 0) return
    }
    throw new Error(`${label} is missing; checked ${files.join(', ')}`)
}

const rawDirectory = path.resolve(arg('raw-dir', '.'))
const platform = normalizeReleasePlatform(arg('platform', process.platform))
const version = arg('version')
if (!version) throw new Error('validate-packaged-app requires --version')
const resources = await findResourcesDirectory(rawDirectory)
if (!resources) throw new Error(`Could not find a packaged app resources directory under ${rawDirectory}`)

const runtimeRoot = path.join(resources, 'zyra-runtime')
await validateRuntimeStage(runtimeRoot, { expectedVersion: version, requireDependencies: true })
await requireNonempty(path.join(resources, 'zyra-browser-control-extension', 'manifest.json'), 'Packaged browser extension')

const sidecar = path.join(resources, 'zyra-computer-use')
if (platform === 'windows') {
    for (const fileName of ['Zyra.ComputerUse.exe', 'coreclr.dll', 'hostfxr.dll']) {
        await requireNonempty(path.join(sidecar, fileName), 'Self-contained packaged Windows sidecar')
    }
} else if (await exists(sidecar)) {
    throw new Error(`Windows computer-use sidecar leaked into the ${platform} package`)
}

const packagedNodePty = path.join(resources, 'app.asar.unpacked', 'node_modules', 'node-pty')
const nodePtyPackage = JSON.parse(await readFile(path.join(packagedNodePty, 'package.json'), 'utf8'))
if (nodePtyPackage.version !== '1.1.0') throw new Error(`Packaged node-pty version is ${nodePtyPackage.version}`)
if (platform === 'windows') {
    await requireNonempty(path.join(packagedNodePty, 'prebuilds', 'win32-x64', 'pty.node'), 'Packaged Windows node-pty binding')
} else if (platform === 'macos') {
    await requireNonempty(path.join(packagedNodePty, 'prebuilds', 'darwin-x64', 'pty.node'), 'Packaged macOS x64 node-pty binding')
    await requireNonempty(path.join(packagedNodePty, 'prebuilds', 'darwin-arm64', 'pty.node'), 'Packaged macOS arm64 node-pty binding')
} else {
    await requireOne([
        path.join(packagedNodePty, 'build', 'Release', 'pty.node'),
        path.join(packagedNodePty, 'prebuilds', 'linux-x64', 'pty.node')
    ], 'Packaged Linux node-pty binding')
}

console.log(`Validated packaged ${platform} app resources at ${resources}`)
