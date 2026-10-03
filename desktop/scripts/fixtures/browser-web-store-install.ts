import { app, BrowserWindow } from 'electron'
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { BrowserWebStoreInstall } from '../../src/main/browser-web-store-install'
import { renderWebStoreInstall } from '../../src/main/browser-web-store-page'
import { chromeWebStoreIdFromUrl } from '../../src/shared/browser-web-store'
import type { BrowserExtensionRecord } from '../../src/shared/browser-extensions'

app.setPath('userData', process.env.ZYRA_STORE_TEST_PROFILE!)
let window: BrowserWindow | undefined
const timer = setTimeout(() => { console.error('Web Store fixture timed out'); app.exit(1) }, 20000)
const pause = () => new Promise(resolve => setTimeout(resolve, 50))
async function waitFor(check: () => Promise<boolean>) {
    for (let i = 0; i < 80; i++) { if (await check()) return; await pause() }
    throw new Error('Web Store fixture condition did not settle')
}
app.whenReady().then(async () => {
    window = new BrowserWindow({ show: false, width: 900, height: 560, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, partition: 'web-store-fixture' } })
    const page = window.webContents
    const id = 'a'.repeat(32), other = 'b'.repeat(32)
    const calls: string[] = []
    const theme = { accent: '#ed5145', background: '#002b36', foreground: '#eeeeee', fontFamily: 'system-ui', colorScheme: 'dark' }
    let document = 0
    let installRequestUrl: string | undefined
    page.session.protocol.handle('https', request => {
        assert.equal(new URL(request.url).hostname, 'chromewebstore.google.com', 'fixture never contacts an external site')
        return new Response('<!doctype html><html><head><meta charset="utf-8"></head><body style="background:#131414;color:white;font:16px system-ui;padding:48px"><h1>Example extension</h1><p>Synthetic Chrome Web Store listing</p><div style="margin-top:45px"><button disabled style="border:0;border-radius:24px;padding:12px 24px">Add to Chrome</button></div></body></html>', { headers: { 'content-type': 'text/html' } })
    })
    // Test-only closed-shadow access, installed inside the isolated world before injection.
    const inspectShadow = async () => page.executeJavaScriptInIsolatedWorld(998, [{ code: `if(!globalThis.__testAttach){globalThis.__testAttach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(options){const shadow=globalThis.__testAttach.call(this,options);globalThis.__testShadow=shadow;return shadow}};void 0` }])
    const flow = new BrowserWebStoreInstall({
        current: () => ({ url: page.getURL(), document, available: !page.isDestroyed() }),
        installer: {
            inspectWebStore: async requested => { calls.push('download:' + requested); await pause(); return { id: requested, name: 'Example extension', version: '1', permissions: ['storage'], hostPermissions: [], warnings: [] } as unknown as BrowserExtensionRecord },
            approveWebStore: async requested => { calls.push('install:' + requested); return {} as BrowserExtensionRecord },
            discardWebStore: async requested => { calls.push('discard:' + requested) }
        },
        present: async value => {
            if (value) installRequestUrl = value.requestUrl
            await page.executeJavaScriptInIsolatedWorld(998, [{ code: `(${renderWebStoreInstall.toString()})(${JSON.stringify(value)},(${chromeWebStoreIdFromUrl.toString()}),${JSON.stringify(theme)})` }])
        },
        confirm: async review => { calls.push('review:' + review.id); await pause(); return true },
        reportError: async message => { throw new Error(message) }
    })
    page.on('did-start-navigation', (_event, url, inPlace, mainFrame) => { if (mainFrame && !inPlace && !url.startsWith('zyra-extension:')) document++ })
    page.on('did-navigate-in-page', () => { void flow.refresh() })
    await page.loadURL(`https://chromewebstore.google.com/detail/example/${id}`)
    await inspectShadow(); await flow.refresh()
    const read = (code: string) => page.executeJavaScriptInIsolatedWorld(998, [{ code }])
    const label = () => read('globalThis.__testShadow?.querySelector("button")?.textContent')
    assert.equal(await label(), 'Add to Zyra')
    assert.equal(await read('getComputedStyle(globalThis.__testShadow.querySelector("button")).color'), 'rgb(237, 81, 69)', 'button uses the app accent, not a fixed purple')
    const buttonStyle = await read('(() => {const s=getComputedStyle(globalThis.__testShadow.querySelector("button"));return {border:s.borderStyle,width:parseFloat(s.borderWidth),shadow:s.boxShadow}})()')
    assert.equal(buttonStyle.border, 'solid', 'button has a visible outline')
    assert.ok(buttonStyle.width >= 0.75, 'button outline remains visible at scaled display sizes')
    assert.notEqual(buttonStyle.shadow, 'none', 'button edge has subtle depth')
    assert.equal(await page.executeJavaScript('document.querySelector("button").nextElementSibling?.hasAttribute("data-zyra-web-store-install")'), true, 'button is beside Add to Chrome')
    theme.accent = '#24bfdd'; await flow.refresh()
    assert.equal(await read('getComputedStyle(globalThis.__testShadow.querySelector("button")).color'), 'rgb(36, 191, 221)', 'theme refresh updates the existing button')
    theme.accent = '#ed5145'; await flow.refresh()
    assert.equal(await page.executeJavaScript('document.querySelector("[data-zyra-web-store-install]").shadowRoot'), null)
    assert.equal(await page.executeJavaScript('typeof window.require + ":" + typeof window.devscope'), 'undefined:undefined')
    await read('globalThis.__testShadow.querySelector("button").click()')
    await pause(); assert.deepEqual(calls, [], 'synthetic clicks cannot request downloads')
    if (process.env.ZYRA_STORE_TEST_SCREENSHOT) writeFileSync(process.env.ZYRA_STORE_TEST_SCREENSHOT, (await page.capturePage()).toPNG())
    assert.ok(installRequestUrl?.startsWith(`zyra-extension://install/${id}?request=`), 'button receives a scoped, single-use install URL')
    await flow.request(installRequestUrl!)
    assert.equal(await label(), 'Added to Zyra')
    assert.deepEqual(calls, ['download:' + id, 'review:' + id, 'install:' + id], 'request downloads, reviews and installs in order')
    console.log('PASS: isolated button beside the store action, live theme updates, blocked synthetic click, install feedback')

    await page.executeJavaScript(`history.pushState({}, '', '/detail/second/${other}')`)
    await waitFor(async () => await label() === 'Add to Zyra')
    await page.executeJavaScript('document.querySelector("[data-zyra-web-store-install]").remove()')
    await waitFor(async () => await page.executeJavaScript('!!document.querySelector("[data-zyra-web-store-install]")'))
    assert.equal(await page.executeJavaScript('document.querySelectorAll("[data-zyra-web-store-install]").length'), 1)
    await page.executeJavaScript("history.pushState({}, '', '/category/extensions')")
    await waitFor(async () => !(await page.executeJavaScript('!!document.querySelector("[data-zyra-web-store-install]")')))
    console.log('PASS: SPA listing change, DOM replacement, no duplicate buttons and removal off listings')
    clearTimeout(timer); window.destroy(); app.quit()
}).catch(error => { console.error(error); clearTimeout(timer); window?.destroy(); app.exit(1) })
