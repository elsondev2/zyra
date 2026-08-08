import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { app, BrowserWindow, type WebContents } from 'electron'
import {
    BROWSER_PREVIEW_ANNOTATION_CANCEL_SOURCE,
    BROWSER_PREVIEW_ANNOTATION_CAPTURED_SOURCE,
    browserPreviewAnnotationSource
} from '../src/main/ipc/handlers/browser-preview-annotation-script'

const WORLD_ID = 1_004
const userData = mkdtempSync(join(tmpdir(), 'zyra-annotation-test-'))
app.setPath('userData', userData)

const theme = {
    colorScheme: 'dark' as const,
    background: '#101216',
    foreground: '#f5f7fa',
    popover: '#181b21',
    mutedForeground: '#9ba3b0',
    border: 'rgba(255,255,255,.14)',
    primary: '#7c3aed',
    primaryForeground: '#ffffff',
    fontFamily: 'system-ui, sans-serif'
}

const wait = (duration = 35) => new Promise((resolve) => setTimeout(resolve, duration))
const mouse = async (contents: WebContents, type: 'mouseMove' | 'mouseDown' | 'mouseUp', x: number, y: number) => {
    contents.sendInputEvent({ type, x, y, button: 'left', clickCount: type === 'mouseMove' ? undefined : 1 })
    await wait()
}
const key = async (contents: WebContents, keyCode: string, modifiers?: Array<'control'>) => {
    contents.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
    contents.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
    await wait()
}
type SessionSnapshot = {
    elements: number
    regions: number
    strokes: number
    tools: Record<string, { x: number; y: number; width: number; height: number }>
    clear: { x: number; y: number; width: number; height: number }
}

const start = (contents: WebContents) => contents.executeJavaScriptInIsolatedWorld(
    WORLD_ID,
    [{ code: browserPreviewAnnotationSource(theme) }],
    true
) as Promise<{
    status: 'attached' | 'cancelled'
    annotation?: { elements: unknown[]; regions: unknown[]; strokes: Array<{ points: unknown[] }> }
}>
const snapshot = (contents: WebContents) => contents.executeJavaScriptInIsolatedWorld(
    WORLD_ID,
    [{ code: 'globalThis.__zyraBrowserAnnotationSessionV1?.snapshot?.()' }]
) as Promise<SessionSnapshot>
const clickRect = async (contents: WebContents, rect: { x: number; y: number; width: number; height: number }) => {
    const x = Math.round(rect.x + rect.width / 2)
    const y = Math.round(rect.y + rect.height / 2)
    await mouse(contents, 'mouseMove', x, y)
    await mouse(contents, 'mouseDown', x, y)
    await mouse(contents, 'mouseUp', x, y)
}
const finishCapture = (contents: WebContents) => contents.executeJavaScriptInIsolatedWorld(
    WORLD_ID,
    [{ code: BROWSER_PREVIEW_ANNOTATION_CAPTURED_SOURCE }]
)

async function run() {
    await app.whenReady()
    const window = new BrowserWindow({
        show: false,
        width: 800,
        height: 600,
        webPreferences: {
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false
        }
    })
    const contents = window.webContents
    await contents.loadURL(`data:text/html,${encodeURIComponent(`<!doctype html>
        <html><body style="margin:0;font-family:system-ui;background:#fafafa">
            <main style="padding:80px">
                <button id="target" data-testid="get-started" style="width:220px;height:72px">Get started</button>
                <section style="margin-top:30px;width:420px;height:180px;background:#ddd">Test surface</section>
            </main>
        </body></html>`)} `)

    const selectResultPromise = start(contents)
    await wait(80)
    await mouse(contents, 'mouseMove', 150, 115)
    await mouse(contents, 'mouseDown', 150, 115)
    await mouse(contents, 'mouseUp', 150, 115)
    await wait(80)
    await key(contents, 'Enter', ['control'])
    const selectResult = await selectResultPromise
    assert.equal(selectResult.status, 'attached')
    assert.equal(selectResult.annotation?.elements.length, 1)
    const capture = await contents.capturePage()
    assert.equal(capture.isEmpty(), false)
    await finishCapture(contents)

    const regionResultPromise = start(contents)
    await wait(80)
    await key(contents, 'R')
    await mouse(contents, 'mouseDown', 100, 260)
    await mouse(contents, 'mouseMove', 290, 390)
    await mouse(contents, 'mouseUp', 290, 390)
    await wait(80)
    await key(contents, 'Enter', ['control'])
    const regionResult = await regionResultPromise
    assert.equal(regionResult.status, 'attached')
    assert.equal(regionResult.annotation?.regions.length, 1)
    await finishCapture(contents)

    const drawResultPromise = start(contents)
    await wait(80)
    await key(contents, 'D')
    await mouse(contents, 'mouseDown', 110, 300)
    for (const [x, y] of [[140, 320], [175, 305], [205, 350], [245, 325]] as const) {
        await mouse(contents, 'mouseMove', x, y)
    }
    await mouse(contents, 'mouseUp', 245, 325)
    await wait(80)
    await key(contents, 'Enter', ['control'])
    const drawResult = await drawResultPromise
    assert.equal(drawResult.status, 'attached')
    assert.equal(drawResult.annotation?.strokes.length, 1)
    assert.ok((drawResult.annotation?.strokes[0]?.points.length || 0) >= 2)
    await finishCapture(contents)

    const eraseResultPromise = start(contents)
    await wait(80)
    await key(contents, 'R')
    await mouse(contents, 'mouseDown', 100, 260)
    await mouse(contents, 'mouseMove', 290, 390)
    await mouse(contents, 'mouseUp', 290, 390)
    await wait(80)
    assert.equal((await snapshot(contents)).regions, 1)
    await clickRect(contents, (await snapshot(contents)).tools.erase)
    await mouse(contents, 'mouseDown', 180, 320)
    await mouse(contents, 'mouseUp', 180, 320)
    assert.equal((await snapshot(contents)).regions, 0)
    await contents.executeJavaScriptInIsolatedWorld(WORLD_ID, [{ code: BROWSER_PREVIEW_ANNOTATION_CANCEL_SOURCE }])
    assert.equal((await eraseResultPromise).status, 'cancelled')

    const clearResultPromise = start(contents)
    await wait(80)
    await mouse(contents, 'mouseDown', 150, 115)
    await mouse(contents, 'mouseUp', 150, 115)
    await wait(80)
    assert.equal((await snapshot(contents)).elements, 1)
    await clickRect(contents, (await snapshot(contents)).clear)
    assert.equal((await snapshot(contents)).elements, 0)
    await contents.executeJavaScriptInIsolatedWorld(WORLD_ID, [{ code: BROWSER_PREVIEW_ANNOTATION_CANCEL_SOURCE }])
    assert.equal((await clearResultPromise).status, 'cancelled')

    const escapeResultPromise = start(contents)
    await wait(80)
    await key(contents, 'Escape')
    assert.equal((await escapeResultPromise).status, 'cancelled')

    const explicitCancelPromise = start(contents)
    await wait(80)
    await contents.executeJavaScriptInIsolatedWorld(WORLD_ID, [{ code: BROWSER_PREVIEW_ANNOTATION_CANCEL_SOURCE }])
    assert.equal((await explicitCancelPromise).status, 'cancelled')

    window.destroy()
    console.log('Browser annotation Electron smoke test: ok')
}

void run().catch((error) => {
    console.error(error)
    process.exitCode = 1
}).finally(() => app.quit())

app.once('quit', () => {
    try {
        rmSync(userData, { recursive: true, force: true })
    } catch {
        // Chromium can keep its GPU cache open for a few milliseconds on Windows.
    }
})
