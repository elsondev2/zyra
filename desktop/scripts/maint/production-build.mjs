/**
 * Authoritative Electron production build.
 *
 * Always remove the local fast-build selector so inherited shell/CI variables
 * cannot omit the renderer from a production or release build. Extra CLI
 * arguments are forwarded to electron-vite for existing debugging workflows.
 */
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const electronViteCli = resolve(desktopRoot, 'node_modules/electron-vite/bin/electron-vite.js')
const env = { ...process.env }
delete env.ZYRA_FAST_BUILD

const child = spawn(process.execPath, [electronViteCli, 'build', ...process.argv.slice(2)], {
    cwd: desktopRoot,
    env,
    stdio: 'inherit',
    windowsHide: true
})

child.once('error', (error) => {
    console.error(`[build] could not start electron-vite: ${error.message}`)
    process.exitCode = 1
})
child.once('exit', (code, signal) => {
    if (code === 0) return
    console.error(`[build] failed (${signal || `exit ${code}`})`)
    process.exitCode = code || 1
})
