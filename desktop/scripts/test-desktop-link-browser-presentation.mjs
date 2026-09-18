import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import electronPath from 'electron'

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const directory = await mkdtemp(join(tmpdir(), 'zyra-desktop-link-browser-'))
try {
    const fixture = await build({
        stdin: {
            contents: `
                import { StrictMode } from 'react'
                import { createRoot } from 'react-dom/client'
                import { DesktopLinkBrowser } from './src/renderer/src/components/ui/DesktopLinkBrowser'

                const results: string[] = []
                const pause = (ms = 20) => new Promise(resolve => setTimeout(resolve, ms))
                function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }
                async function waitFor<T>(read: () => Promise<T>, accept: (value: T) => boolean, message: string): Promise<T> {
                    let value = await read()
                    for (let count = 0; count < 100 && !accept(value); count++) { await pause(); value = await read() }
                    check(accept(value), message)
                    return value
                }

                const id = 'browser:desktop-link:strict-mode-repro'
                const url = 'https://github.com/justelson/zyra/issues/14'
                const ready: unknown[] = []
                const root = createRoot(document.getElementById('root')!)
                root.render(<StrictMode><DesktopLinkBrowser id={id} url={url} visible={true} onReady={result => ready.push(result)} onClose={() => undefined} /></StrictMode>)

                ;(window as any).desktopLinkBrowserPresentationCheck = (async () => {
                    const before = await waitFor(
                        () => (window as any).fixture.presentation(),
                        (value: any) => value.ensureCount >= 2 && value.attached && value.visible && value.bodyText === 'desktop link content',
                        'the second StrictMode mount must attach and present its native page before the stale ensure resolves'
                    ) as any
                    const shell = document.querySelector('section[aria-label="Link in Zyra Browser"]')
                    check(shell?.textContent?.includes(url), 'the DesktopLinkBrowser toolbar must show the requested URL')
                    check(ready.length === 1, 'only the live mount reports ready')
                    results.push('reproduced toolbar plus attached native content before the stale ensure reply')

                    await (window as any).fixture.releaseFirstEnsure()
                    const after = await waitFor(
                        () => (window as any).fixture.presentation(),
                        (value: any) => value.firstEnsureReleased && value.closeCount >= 1,
                        'the deferred first ensure reply must complete'
                    ) as any
                    await pause(80)
                    const settled = await (window as any).fixture.presentation()
                    check(settled.attached && settled.visible && settled.bodyText === 'desktop link content',
                        'a stale StrictMode ensure completion must not close the live native page behind the URL toolbar')
                    check(settled.generation === before.generation, 'the live native presentation generation must survive the stale reply')
                    results.push('stale ensure completion preserves the live native presentation')

                    root.unmount()
                    const cleaned = await waitFor(
                        () => (window as any).fixture.presentation(),
                        (value: any) => !value.attached,
                        'unmount must close the owned native page and clear its presentation'
                    ) as any
                    check(cleaned.closeCount > after.closeCount, 'unmount issues the final owned close')
                    results.push('unmount still clears native visibility and ownership')
                    return results
                })()
            `,
            resolveDir: desktop,
            sourcefile: 'desktop-link-browser-presentation-fixture.tsx',
            loader: 'tsx'
        },
        absWorkingDir: desktop,
        bundle: true,
        write: false,
        format: 'iife',
        jsx: 'automatic',
        platform: 'browser',
        alias: { '@': join(desktop, 'src/renderer/src') }
    })

    const html = join(directory, 'index.html')
    await writeFile(html, `<!doctype html><html><head><meta charset="utf-8"><style>
        html,body,#root{width:100%;height:100%;margin:0}
        section[aria-label="Link in Zyra Browser"]{position:fixed;inset:34px 0 0;display:flex;flex-direction:column}
        section[aria-label="Link in Zyra Browser"]>header{display:flex;flex:0 0 48px}
        section[aria-label="Link in Zyra Browser"]>div:last-child{position:relative;min-height:0;flex:1}
    </style></head><body><div id="root"></div><script>${fixture.outputFiles[0].text}</script></body></html>`)

    const preload = join(directory, 'preload.cjs')
    await writeFile(preload, `
        const { contextBridge, ipcRenderer } = require('electron')
        contextBridge.exposeInMainWorld('devscope', {
            browserView: {
                ensure: input => ipcRenderer.invoke('fixture:ensure', input),
                command: command => ipcRenderer.invoke('fixture:command', command),
                close: tabId => ipcRenderer.invoke('fixture:close', tabId),
                release: tabId => ipcRenderer.send('fixture:release', tabId),
                reportSlot: input => ipcRenderer.send('fixture:slot', input),
                onEvent: callback => { const listener = (_event, value) => callback(value); ipcRenderer.on('fixture:event', listener); return () => ipcRenderer.removeListener('fixture:event', listener) }
            },
            onBrowserThreatBlocked: () => () => undefined,
            proceedBrowserThreatWarning: async () => ({ success: true }),
            dismissBrowserThreatWarning: async () => ({ success: true }),
            openBrowserPreviewExternal: async () => ({ success: true })
        })
        contextBridge.exposeInMainWorld('fixture', {
            presentation: () => ipcRenderer.invoke('fixture:presentation'),
            releaseFirstEnsure: () => ipcRenderer.invoke('fixture:release-first-ensure')
        })
    `)

    const harness = join(directory, 'run.cjs')
    await writeFile(harness, `
        const { app, BrowserWindow, WebContentsView, ipcMain } = require('electron')
        const assert = require('node:assert/strict')
        app.setPath('userData', ${JSON.stringify(join(directory, 'profile'))})
        const deadline = setTimeout(() => { console.error('DesktopLinkBrowser presentation test timed out'); app.exit(1) }, 20000)
        let owner
        let current = null
        let generation = 0
        let ensureCount = 0
        let closeCount = 0
        let firstEnsureReleased = false
        let releaseFirstEnsure

        const stateFor = record => ({
            version: 1, revision: 1, tabId: record.tabId, sessionMode: 'normal', guestWebContentsId: record.view.webContents.id,
            url: record.url, displayAddress: record.url, title: 'Issue 14', status: 'ready', error: null,
            canGoBack: false, canGoForward: false, faviconUrl: null, audible: false, fullscreen: false
        })
        const closeCurrent = () => {
            const record = current
            if (!record) return
            current = null
            record.visible = false
            try { owner.contentView.removeChildView(record.view) } catch {}
            if (!record.view.webContents.isDestroyed()) record.view.webContents.close({ waitForBeforeUnload: false })
        }
        const createCurrent = input => {
            const view = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } })
            const record = current = { generation: ++generation, tabId: input.tabId, url: input.initialUrl, view, visible: false }
            owner.contentView.addChildView(view)
            view.setBounds({ x: 0, y: 0, width: 1, height: 1 })
            view.setVisible(false)
            void view.webContents.loadURL('data:text/html;charset=utf-8,%3Cbody%3Edesktop%20link%20content%3C%2Fbody%3E').catch(() => undefined)
            return record
        }

        ipcMain.handle('fixture:ensure', (_event, input) => {
            ensureCount++
            const call = ensureCount
            const record = current || createCurrent(input)
            const result = { success: true, created: true, state: stateFor(record) }
            if (call !== 1) return result
            return new Promise(resolve => { releaseFirstEnsure = () => { firstEnsureReleased = true; resolve(result) } })
        })
        ipcMain.handle('fixture:close', (_event, tabId) => {
            closeCount++
            if (current?.tabId === tabId) closeCurrent()
            return { success: true, closed: true }
        })
        ipcMain.handle('fixture:command', (_event, command) => ({ success: true, accepted: true, state: stateFor(current) }))
        ipcMain.on('fixture:release', () => undefined)
        ipcMain.on('fixture:slot', (_event, input) => {
            if (!current || input.tabId !== current.tabId) return
            if (input.bounds) current.view.setBounds({
                x: Math.round(input.bounds.x), y: Math.round(input.bounds.y),
                width: Math.max(1, Math.round(input.bounds.width)), height: Math.max(1, Math.round(input.bounds.height))
            })
            current.visible = Boolean(input.active && input.visible && input.bounds)
            current.view.setVisible(current.visible)
        })
        ipcMain.handle('fixture:release-first-ensure', () => {
            assert.equal(typeof releaseFirstEnsure, 'function', 'first ensure must be pending before release')
            releaseFirstEnsure()
            releaseFirstEnsure = null
            return true
        })
        ipcMain.handle('fixture:presentation', async () => {
            const record = current
            let bodyText = null
            if (record && !record.view.webContents.isDestroyed()) {
                bodyText = await record.view.webContents.executeJavaScript('document.body.textContent.trim()').catch(() => null)
            }
            return {
                ensureCount, closeCount, firstEnsureReleased,
                attached: Boolean(record && owner.contentView.children.includes(record.view)),
                visible: Boolean(record?.visible), generation: record?.generation || null, bodyText
            }
        })

        app.whenReady().then(async () => {
            owner = new BrowserWindow({ show: false, width: 900, height: 650, webPreferences: {
                preload: ${JSON.stringify(preload)}, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false
            } })
            await owner.loadFile(${JSON.stringify(html)})
            const results = await owner.webContents.executeJavaScript('window.desktopLinkBrowserPresentationCheck')
            for (const result of results) console.log('PASS: ' + result)
            closeCurrent()
            owner.destroy()
            clearTimeout(deadline)
            app.quit()
        }).catch(error => { console.error(error); closeCurrent(); clearTimeout(deadline); app.exit(1) })
    `)

    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    const useDisplay = process.platform === 'linux' && Boolean(process.env.CI) && !process.env.DISPLAY
    const args = [...(process.platform === 'linux' && process.env.CI ? ['--no-sandbox'] : []), harness]
    const exitCode = await new Promise((resolveExit, reject) => {
        const child = spawn(useDisplay ? 'xvfb-run' : electronPath, useDisplay ? ['--auto-servernum', electronPath, ...args] : args, {
            cwd: desktop, env, stdio: 'inherit', windowsHide: true, shell: false
        })
        child.once('error', reject)
        child.once('exit', code => resolveExit(code ?? 1))
    })
    if (exitCode !== 0) process.exitCode = exitCode
} finally {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()))
    assert.ok(basename(directory).startsWith('zyra-desktop-link-browser-'))
    await rm(directory, { recursive: true, force: true })
}
