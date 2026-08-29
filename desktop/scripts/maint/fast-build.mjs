/**
 * Fast structural build for local iteration.
 *
 * The renderer contains Monaco, Shiki languages/themes, Mermaid, and document
 * preview chunks. Rollup must transform all of them even when they are lazy,
 * so an "unminified full build" was slower in measurement than production.
 * This lane instead runs the cached renderer typecheck, then asks
 * electron.vite.config.ts to bundle main and preload only.
 *
 * It proves renderer type consistency plus Electron main/preload bundling. It
 * does not prove renderer chunk generation, worker bundling, minification, or
 * copied runtime assets. Use `bun run build` for that authoritative gate.
 */
import { spawn } from 'node:child_process'
import { availableParallelism, freemem } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const electronViteCli = resolve(desktopRoot, 'node_modules/electron-vite/bin/electron-vite.js')
const tscCli = resolve(desktopRoot, 'node_modules/typescript/bin/tsc')
const freeMemoryGb = freemem() / (1024 ** 3)
const startedAt = performance.now()

console.log(`[build:fast] free memory ${freeMemoryGb.toFixed(1)} GB; logical CPUs ${availableParallelism()}`)
if (freeMemoryGb < 2) {
    console.warn('[build:fast] low free memory may force Windows to page; close unused browsers or dev builds first')
}
console.log('[build:fast] renderer typecheck + main/preload bundles; full renderer bundling is deferred')

function runStep(label, command, args, env = process.env) {
    return new Promise((resolveStep, rejectStep) => {
        const stepStartedAt = performance.now()
        const child = spawn(command, args, {
            cwd: desktopRoot,
            env,
            stdio: 'inherit',
            windowsHide: true
        })
        child.once('error', (error) => rejectStep(new Error(`${label} could not start: ${error.message}`)))
        child.once('exit', (code, signal) => {
            const duration = ((performance.now() - stepStartedAt) / 1000).toFixed(1)
            if (code === 0) {
                console.log(`[build:fast] ${label} passed (${duration}s)`)
                resolveStep()
                return
            }
            rejectStep(new Error(`${label} failed (${signal || `exit ${code}`})`))
        })
    })
}

try {
    await runStep('renderer typecheck', process.execPath, [
        tscCli,
        '--noEmit',
        '-p',
        'tsconfig.renderer.json'
    ])
    await runStep('main/preload build', process.execPath, [
        electronViteCli,
        'build',
        '--logLevel',
        'warn',
        '--ignoreConfigWarning'
    ], {
        ...process.env,
        BROWSERSLIST_IGNORE_OLD_DATA: 'true',
        ZYRA_FAST_BUILD: '1'
    })
    const duration = ((performance.now() - startedAt) / 1000).toFixed(1)
    console.log(`[build:fast] complete (${duration}s)`)
} catch (error) {
    console.error(`[build:fast] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
}
