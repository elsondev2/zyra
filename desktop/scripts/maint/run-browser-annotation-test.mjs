import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import electronPath from 'electron'
import { build } from 'esbuild'

const ANNOTATION_RUNNER_TIMEOUT_MS = 90_000
const directory = await mkdtemp(join(tmpdir(), 'zyra-browser-annotation-runner-'))
const outfile = join(directory, 'test-browser-annotation-electron.cjs')

try {
    await build({
        entryPoints: [new URL('../test-browser-annotation-electron.ts', import.meta.url).pathname.replace(/^\/(.:)/, '$1')],
        outfile,
        bundle: true,
        platform: 'node',
        format: 'cjs',
        external: ['electron'],
        logLevel: 'silent'
    })
    const exitCode = await new Promise((resolve, reject) => {
        const child = spawn(electronPath, [outfile], { stdio: 'inherit', windowsHide: true })
        const timeout = setTimeout(() => {
            console.error(`Browser annotation runner timed out after ${ANNOTATION_RUNNER_TIMEOUT_MS} ms.`)
            if (process.platform === 'win32' && child.pid) {
                const terminator = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
                    stdio: 'ignore',
                    windowsHide: true
                })
                terminator.once('error', () => child.kill('SIGKILL'))
            } else {
                child.kill('SIGKILL')
            }
        }, ANNOTATION_RUNNER_TIMEOUT_MS)
        child.once('error', (error) => {
            clearTimeout(timeout)
            reject(error)
        })
        child.once('exit', (code) => {
            clearTimeout(timeout)
            resolve(code ?? 1)
        })
    })
    if (exitCode !== 0) process.exitCode = exitCode
} finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined)
}
