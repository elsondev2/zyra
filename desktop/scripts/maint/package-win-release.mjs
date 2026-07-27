import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

const packageJson = JSON.parse(
    await readFile(path.join(rootDir, 'package.json'), 'utf8')
)

const version = packageJson.version
const mode = process.argv[2] === 'unpacked' ? 'unpacked' : 'release'
const outputDir = mode === 'unpacked'
    ? path.join('dist', 'unpacked', `v${version}`)
    : path.join('dist', 'releases', `v${version}`)
const builderArgs = mode === 'unpacked'
    ? ['electron-builder', '--dir', `--config.directories.output=${outputDir}`]
    : ['electron-builder', '--win', `--config.directories.output=${outputDir}`]

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const repositoryRoot = path.resolve(rootDir, '..')
const extensionPackage = path.join(repositoryRoot, 'extensions', 'zyra-browser-control')
const sidecarProject = path.join(repositoryRoot, 'native', 'zyra-computer-use', 'src', 'Zyra.ComputerUse', 'Zyra.ComputerUse.csproj')
const sidecarOutput = path.join(repositoryRoot, 'native', 'zyra-computer-use', 'publish')

await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--prefix', extensionPackage, 'run', 'package'], repositoryRoot)
await run('dotnet', ['publish', sidecarProject, '-c', 'Release', '-r', 'win-x64', '--self-contained', 'false', '-o', sidecarOutput], repositoryRoot)

await new Promise((resolve, reject) => {
    const child = spawn(command, builderArgs, {
        cwd: rootDir,
        stdio: 'inherit',
        shell: process.platform === 'win32'
    })

    child.on('exit', (code) => {
        if (code === 0) {
            resolve()
            return
        }

        reject(new Error(`electron-builder exited with code ${code ?? 'unknown'}`))
    })

    child.on('error', reject)
})

function run(executable, args, cwd) {
    return new Promise((resolve, reject) => {
        const requiresCommandShell = process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(executable)
        const child = spawn(executable, args, { cwd, stdio: 'inherit', shell: requiresCommandShell })
        child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${executable} exited with code ${code ?? 'unknown'}`)))
        child.on('error', reject)
    })
}
