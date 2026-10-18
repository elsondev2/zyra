import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { renderAuthCallbackPage } from '../../src/auth-callback-page.mjs'

if (!process.versions.electron) {
    const profile = await mkdtemp(join(tmpdir(), 'zyra-callback-renderer-'))
    const executable = createRequire(import.meta.url)('electron')
    try {
        const env = { ...process.env, ZYRA_CALLBACK_TEST_PROFILE: profile }
        delete env.ELECTRON_RUN_AS_NODE
        const ciLinux = process.platform === 'linux' && Boolean(process.env.CI)
        const args = [...(ciLinux ? ['--no-sandbox'] : []), fileURLToPath(import.meta.url)]
        const virtual = ciLinux && !process.env.DISPLAY
        const child = spawn(virtual ? 'xvfb-run' : executable, virtual ? ['--auto-servernum', executable, ...args] : args, { env, stdio: 'inherit', windowsHide: true })
        process.exitCode = await new Promise((accept, reject) => { child.once('error', reject); child.once('exit', code => accept(code ?? 1)) })
    } finally { await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) }
} else {
    void runElectronTest().catch(error => { console.error(error); process.exit(1) })
}
async function runElectronTest() {
    const { app, BrowserWindow, nativeTheme } = await import('electron')
    app.setPath('userData', process.env.ZYRA_CALLBACK_TEST_PROFILE)
    const timeout = setTimeout(() => app.exit(1), 60000)
    try {
        await app.whenReady()
        nativeTheme.themeSource = 'light'
        const window = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false, sandbox: true, offscreen: true } })
        const output = process.env.ZYRA_CALLBACK_SCREENSHOTS && resolve(process.env.ZYRA_CALLBACK_SCREENSHOTS)
        if (output) await mkdir(output, { recursive: true })
        for (const width of [1040, 320]) {
            for (const failed of [false, true]) {
                window.setContentSize(width, 520)
                await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(renderAuthCallbackPage({ serviceName: 'ChatGPT', failed })))
                await window.webContents.executeJavaScript('document.fonts.ready.then(() => true)')
                const state = await window.webContents.executeJavaScript(`({background:getComputedStyle(document.body).backgroundColor,scheme:getComputedStyle(document.documentElement).colorScheme,title:document.querySelector('h1').textContent,paragraphs:document.querySelectorAll('p').length,decorations:document.querySelectorAll('script,form,a,button').length,marks:document.querySelectorAll('.marks img').length,font:document.fonts.check('14px "Bricolage Grotesque"'),overflow:document.documentElement.scrollWidth>innerWidth})`)
                assert.equal(state.background, 'rgb(0, 0, 0)', 'callback stays black even with the OS forced to light mode')
                assert.equal(state.scheme, 'dark')
                assert.equal(state.title, failed ? 'Sign-in not completed' : 'Return to Zyra')
                assert.equal(state.paragraphs, 1)
                assert.equal(state.decorations, 0)
                assert.equal(state.marks, 2)
                assert.equal(state.font, true)
                assert.equal(state.overflow, false)
                if (output && !failed) {
                    try { await writeFile(join(output, `callback-${width}.png`), (await window.webContents.capturePage()).toPNG()) }
                    catch (error) { throw new Error(`Callback screenshot failed at ${width}px`, { cause: error }) }
                }
            }
        }
        console.log('PASS: minimal branded callback with the app font renders at desktop/mobile widths and stays monochrome in light OS mode')
        clearTimeout(timeout)
        app.exit(0)
    } catch (error) { console.error(error); app.exit(1) }
}
