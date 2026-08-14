import { spawn } from 'node:child_process'
import electronPath from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const smokeScript = path.join(scriptDirectory, 'node-pty-electron-smoke.cjs')

const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(electronPath, [smokeScript], {
        cwd: path.resolve(scriptDirectory, '..', '..'),
        env: {
            ...process.env,
            ELECTRON_RUN_AS_NODE: '1'
        },
        stdio: 'inherit',
        shell: false
    })
    child.on('error', reject)
    child.on('exit', (code) => resolve(code ?? 1))
})

if (exitCode !== 0) process.exit(exitCode)
console.log('Zyra node-pty Electron ABI smoke: ok')
