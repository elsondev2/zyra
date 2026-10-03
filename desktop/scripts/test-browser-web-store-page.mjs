import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { build } from 'esbuild'
const require = createRequire(import.meta.url)
const root = fileURLToPath(new URL('../', import.meta.url))
const directory = await mkdtemp(path.join(tmpdir(), 'zyra-web-store-'))
try {
    const outfile = path.join(directory, 'fixture.cjs')
    await build({ absWorkingDir: root, entryPoints: ['scripts/fixtures/browser-web-store-install.ts'], outfile, bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron'] })
    const env = { ...process.env, ZYRA_STORE_TEST_PROFILE: path.join(directory, 'profile') }
    delete env.ELECTRON_RUN_AS_NODE
    if (process.argv[2]) env.ZYRA_STORE_TEST_SCREENSHOT = path.resolve(process.argv[2])
    try {
        const result = await promisify(execFile)(require('electron'), [outfile], { env, windowsHide: true, timeout: 30000, maxBuffer: 2 * 1024 * 1024 })
        console.log(result.stdout.trim())
    } catch (error) { console.error(error.stdout || '', error.stderr || ''); throw error }
} finally { await rm(directory, { recursive: true, force: true, maxRetries: 3 }) }
