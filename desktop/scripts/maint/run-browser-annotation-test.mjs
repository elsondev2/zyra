import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import electronPath from 'electron'
import { build } from 'esbuild'

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
        child.once('error', reject)
        child.once('exit', (code) => resolve(code ?? 1))
    })
    if (exitCode !== 0) process.exitCode = exitCode
} finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined)
}
