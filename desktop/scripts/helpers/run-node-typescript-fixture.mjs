import { build } from 'esbuild'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const [entry, ...args] = process.argv.slice(2)
if (!entry) throw Error('Supply a TypeScript fixture path')
const directory = await mkdtemp(join(tmpdir(), 'zyra-perf-node-'))
try {
    const modulePath = join(directory, 'fixture.mjs')
    await build({ absWorkingDir: desktopRoot, entryPoints: [entry], outfile: modulePath, bundle: true, platform: 'node', format: 'esm', target: 'node22', banner: { js: "import { createRequire as fixtureCreateRequire } from 'node:module'; import { fileURLToPath as fixtureFilePath } from 'node:url'; import { dirname as fixtureDirname } from 'node:path'; const require = fixtureCreateRequire(import.meta.url); const __filename = fixtureFilePath(import.meta.url); const __dirname = fixtureDirname(__filename);" } })
    const run = await promisify(execFile)(process.execPath, ['--expose-gc', modulePath, ...args], { cwd: desktopRoot, windowsHide: true, timeout: 60000, maxBuffer: 4 * 1024 * 1024 })
    process.stdout.write(run.stdout)
    process.stderr.write(run.stderr)
} catch (error) {
    if (error.stdout) process.stdout.write(error.stdout)
    if (error.stderr) process.stderr.write(error.stderr)
    throw error
} finally {
    if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith('zyra-perf-node-')) throw Error('Unexpected cleanup path')
    await rm(directory, { recursive: true, force: true })
}
