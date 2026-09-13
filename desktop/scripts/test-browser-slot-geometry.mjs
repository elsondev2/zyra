import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'

const directory = dirname(fileURLToPath(import.meta.url))
const userData = await mkdtemp(join(tmpdir(), 'zyra-browser-geometry-'))
try {
    const geometryModule = join(userData, 'geometry.js')
    await build({
        entryPoints: [join(directory, '../src/renderer/src/pages/assistant/assistant-browser-slot-geometry.ts')],
        outfile: geometryModule, bundle: true, platform: 'browser', format: 'iife', globalName: 'BrowserSlotGeometry'
    })
    const exitCode = await new Promise((resolve, reject) => {
        const useDisplay = process.platform === 'linux' && process.env.CI && !process.env.DISPLAY
        const args = [
            ...(process.platform === 'linux' && process.env.CI ? ['--no-sandbox'] : []),
            join(directory, 'browser-slot-geometry-smoke.cjs')
        ]
        const child = spawn(useDisplay ? 'xvfb-run' : electronPath, useDisplay ? ['--auto-servernum', electronPath, ...args] : args, {
            env: { ...process.env, ZYRA_GEOMETRY_USER_DATA: userData, ZYRA_GEOMETRY_MODULE: geometryModule },
            stdio: 'inherit', shell: false, windowsHide: true
        })
        child.once('error', reject)
        child.once('exit', code => resolve(code ?? 1))
    })
    if (exitCode !== 0) process.exitCode = exitCode
} finally {
    await rm(userData, { recursive: true, force: true }).catch(() => undefined)
}
