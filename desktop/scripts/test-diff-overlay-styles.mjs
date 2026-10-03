import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const directory = await mkdtemp(join(tmpdir(), 'zyra-diff-overlay-'))
const screenshot = process.argv.find(argument => argument.startsWith('--screenshot='))?.slice('--screenshot='.length)

try {
    const bundle = await build({
        entryPoints: [join(desktop, 'scripts/fixtures/diff-overlay-styles.tsx')],
        bundle: true,
        write: false,
        format: 'iife',
        jsx: 'automatic',
        platform: 'browser'
    })
    const html = join(directory, 'index.html')
    await writeFile(html, `<!doctype html><div id="root"></div><script>${bundle.outputFiles[0].text}</script>`)
    const harness = join(directory, 'run.cjs')
    await writeFile(harness, `
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
app.setPath('userData', ${JSON.stringify(join(directory, 'profile'))})
let window
const timer = setTimeout(() => {
    console.error('Diff overlay test timed out')
    app.exit(1)
}, 20000)
app.whenReady().then(async () => {
    window = new BrowserWindow({
        show: false,
        width: 1000,
        height: 700,
        webPreferences: { backgroundThrottling: false, offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false }
    })
    await window.loadFile(${JSON.stringify(html)})
    const results = await window.webContents.executeJavaScript('window.diffOverlayChecks')
    for (const result of results) console.log('PASS: ' + result)
    if (${JSON.stringify(screenshot ?? null)}) fs.writeFileSync(${JSON.stringify(screenshot ?? null)}, (await window.capturePage()).toPNG())
    clearTimeout(timer)
    window.destroy()
    app.quit()
}).catch(error => {
    console.error(error)
    clearTimeout(timer)
    if (window && !window.isDestroyed()) window.destroy()
    app.exit(1)
})
`)
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    const virtual = process.platform === 'linux' && Boolean(process.env.CI) && !process.env.DISPLAY
    const args = [...(process.platform === 'linux' && process.env.CI ? ['--no-sandbox'] : []), harness]
    process.exitCode = await new Promise((done, reject) => {
        const child = spawn(virtual ? 'xvfb-run' : electronPath, virtual ? ['--auto-servernum', electronPath, ...args] : args, {
            cwd: desktop,
            env,
            stdio: 'inherit',
            windowsHide: true,
            shell: false
        })
        child.once('error', reject)
        child.once('exit', code => done(code ?? 1))
    })
} finally {
    if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith('zyra-diff-overlay-')) {
        throw new Error('Unexpected diff overlay test cleanup path')
    }
    await rm(directory, { recursive: true, force: true })
}
