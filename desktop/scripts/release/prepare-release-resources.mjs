import { spawn } from 'node:child_process'
import { access, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeReleasePlatform } from './release-contract.mjs'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(scriptDirectory, '..', '..')
const repositoryRoot = path.resolve(desktopRoot, '..')

function arg(name, fallback = null) {
    const inline = process.argv.slice(2).find((value) => value.startsWith(`--${name}=`))
    if (inline) return inline.slice(name.length + 3)
    const index = process.argv.indexOf(`--${name}`)
    return index >= 0 ? process.argv[index + 1] : fallback
}

function run(executable, args, cwd) {
    return new Promise((resolve, reject) => {
        const useShell = process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(executable)
        const child = spawn(executable, args, { cwd, stdio: 'inherit', shell: useShell })
        child.on('error', reject)
        child.on('exit', (code) => {
            if (code === 0) resolve()
            else reject(new Error(`${executable} ${args.join(' ')} exited with code ${code ?? 'unknown'}`))
        })
    })
}

async function requireFile(file, label) {
    await access(file).catch(() => {
        throw new Error(`${label} is missing: ${file}`)
    })
}

const platform = normalizeReleasePlatform(arg('platform', process.platform))
const hostPlatform = normalizeReleasePlatform(process.platform)
if (platform !== hostPlatform) {
    throw new Error(`Release resources for ${platform} must be prepared on a native ${platform} host (current: ${hostPlatform}).`)
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const extensionRoot = path.join(repositoryRoot, 'extensions', 'zyra-browser-control')
await run(npm, ['--prefix', extensionRoot, 'run', 'package'], repositoryRoot)
await requireFile(path.join(extensionRoot, 'dist', 'unpacked', 'manifest.json'), 'Packaged browser extension')
await requireFile(path.join(extensionRoot, 'dist', 'zyra-browser-control.zip'), 'Browser extension ZIP')

await run(process.execPath, [path.join(scriptDirectory, 'stage-zyra-runtime.mjs')], desktopRoot)

const sidecarOutput = path.join(desktopRoot, '.release', 'zyra-computer-use', 'win-x64')
await rm(path.join(desktopRoot, '.release', 'zyra-computer-use'), { recursive: true, force: true })
if (platform === 'windows') {
    const sidecarProject = path.join(
        repositoryRoot,
        'native',
        'zyra-computer-use',
        'src',
        'Zyra.ComputerUse',
        'Zyra.ComputerUse.csproj'
    )
    await run('dotnet', [
        'publish',
        sidecarProject,
        '-c', 'Release',
        '-r', 'win-x64',
        '--self-contained', 'true',
        '-p:PublishSingleFile=false',
        '-p:DebugType=None',
        '-p:DebugSymbols=false',
        '-o', sidecarOutput
    ], repositoryRoot)
    for (const fileName of ['Zyra.ComputerUse.exe', 'Zyra.ComputerUse.runtimeconfig.json', 'coreclr.dll', 'hostfxr.dll']) {
        await requireFile(path.join(sidecarOutput, fileName), 'Self-contained Windows computer-use sidecar')
    }
}

const rootPackage = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'))
console.log(`Prepared Zyra ${rootPackage.version} release resources for ${platform}.`)
