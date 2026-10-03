import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { dirname, join, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cache = join(desktop, 'node_modules', '.cache')
await mkdir(cache, { recursive: true })
const directory = await mkdtemp(join(cache, 'zyra-request-persistence-'))
try {
    const file = join(directory, 'test.mjs')
    await build({ entryPoints: [join(desktop, 'scripts/test-assistant-request-persistence.ts')], outfile: file,
        bundle: true, packages: 'external', platform: 'node', format: 'esm', logLevel: 'silent' })
    process.exitCode = await new Promise((resolveExit, reject) => {
        const child = spawn(process.execPath, [file], { cwd: desktop, windowsHide: true, shell: false, stdio: 'inherit' })
        child.once('error', reject); child.once('exit', code => resolveExit(code ?? 1))
    })
} finally {
    if (dirname(resolve(directory)) !== resolve(cache) || !basename(directory).startsWith('zyra-request-persistence-')) throw new Error('Unexpected cleanup path')
    await rm(directory, { recursive: true, force: true })
}
