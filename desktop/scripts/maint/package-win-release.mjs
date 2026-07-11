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
