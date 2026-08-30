import { access, chmod, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const packageRoot = path.join(desktopRoot, 'node_modules', 'node-pty')
const packageJson = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'))
const binding = await readFile(path.join(packageRoot, 'binding.gyp'), 'utf8')

if (packageJson.version !== '1.1.0') throw new Error(`Expected node-pty 1.1.0, got ${packageJson.version}`)
if (!packageJson.dependencies?.['node-addon-api'] || !binding.includes('node_addon_api_except')) {
    throw new Error('node-pty no longer exposes the reviewed Node-API binding strategy')
}

for (const target of ['win32-x64', 'darwin-x64', 'darwin-arm64']) {
    await access(path.join(packageRoot, 'prebuilds', target, 'pty.node')).catch(() => {
        throw new Error(`node-pty is missing the packaged ${target} Node-API prebuild required by the release matrix`)
    })
}
for (const target of ['darwin-x64', 'darwin-arm64']) {
    const helper = path.join(packageRoot, 'prebuilds', target, 'spawn-helper')
    await access(helper).catch(() => {
        throw new Error(`node-pty is missing the packaged ${target} spawn-helper`)
    })
}

// node-pty 1.1.0's published macOS prebuilds omit the executable bit on
// spawn-helper. Restore it after every install so both CI and packaged apps can
// create a PTY instead of failing with the opaque "posix_spawnp failed" error.
if (process.platform === 'darwin') {
    const helper = path.join(packageRoot, 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper')
    await chmod(helper, 0o755)
    const helperMode = (await stat(helper)).mode
    if ((helperMode & 0o111) === 0) {
        throw new Error(`node-pty spawn-helper is not executable: ${path.relative(desktopRoot, helper)}`)
    }
}

const prebuildRoot = path.join(packageRoot, 'prebuilds', `${process.platform}-${process.arch}`)
const sourceBuild = path.join(packageRoot, 'build', 'Release', 'pty.node')
let selected
try {
    await access(path.join(prebuildRoot, 'pty.node'))
    selected = path.join(prebuildRoot, 'pty.node')
} catch {
    await access(sourceBuild).catch(() => {
        throw new Error(`node-pty has neither a ${process.platform}-${process.arch} prebuild nor a source-built pty.node`)
    })
    selected = sourceBuild
}

console.log(`node-pty Node-API binary ready: ${path.relative(desktopRoot, selected)}`)
