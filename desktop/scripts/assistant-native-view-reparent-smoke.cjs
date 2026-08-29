const assert = require('node:assert/strict')
const { app, BrowserWindow, WebContentsView, session } = require('electron')

const failTimer = setTimeout(() => {
    console.error('Assistant native view reparent smoke timed out.')
    app.exit(1)
}, 20_000)

app.commandLine.appendSwitch('disable-gpu')
if (process.env.ZYRA_REPARENT_SMOKE_USER_DATA) app.setPath('userData', process.env.ZYRA_REPARENT_SMOKE_USER_DATA)

app.whenReady().then(async () => {
    const browserSession = session.fromPartition('persist:zyra-browser-reparent-smoke', { cache: true })
    const shellPreferences = { sandbox: true, contextIsolation: true, nodeIntegration: false, webviewTag: false }
    const source = new BrowserWindow({ width: 640, height: 480, show: false, webPreferences: shellPreferences })
    const destination = new BrowserWindow({ width: 640, height: 480, show: false, webPreferences: shellPreferences })
    const view = new WebContentsView({
        webPreferences: {
            session: browserSession,
            preload: undefined,
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            nodeIntegrationInSubFrames: false,
            nodeIntegrationInWorker: false,
            backgroundThrottling: false
        }
    })
    source.contentView.addChildView(view)
    view.setBounds({ x: 0, y: 34, width: 640, height: 446 })
    const firstUrl = `data:text/html;charset=utf-8,${encodeURIComponent('<!doctype html><title>First</title><p>history entry</p>')}`
    const liveUrl = `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><html><head><title>Live state</title></head><body style="height:2400px"><input id="draft"><script>globalThis.liveState={counter:41};document.querySelector('#draft').value='unsaved Zyra draft';scrollTo(0,320)</script></body></html>`)}`
    await view.webContents.loadURL(firstUrl)
    await view.webContents.loadURL(liveUrl)
    await view.webContents.executeJavaScript('globalThis.liveState.counter += 1')

    const webContentsId = view.webContents.id
    const rendererPid = view.webContents.getProcessId()
    const historyBefore = {
        activeIndex: view.webContents.navigationHistory.getActiveIndex(),
        entries: view.webContents.navigationHistory.getAllEntries().map((entry) => entry.url)
    }
    const before = await view.webContents.executeJavaScript(`({counter:globalThis.liveState.counter,draft:document.querySelector('#draft').value,scrollY,title:document.title})`)
    const preferences = view.webContents.getLastWebPreferences()

    assert.equal(view.webContents.session, browserSession, 'the exact persistent Browser session must survive attachment')
    assert.equal(preferences.sandbox, true)
    assert.equal(preferences.contextIsolation, true)
    assert.equal(preferences.nodeIntegration, false)
    assert.equal(Boolean(preferences.preload), false, 'the Browser page must have no preload')
    assert.equal(view.webContents.navigationHistory.canGoBack(), true)

    source.contentView.removeChildView(view)
    destination.contentView.addChildView(view)
    view.setBounds({ x: 0, y: 34, width: 640, height: 446 })
    const after = await view.webContents.executeJavaScript(`({counter:globalThis.liveState.counter,draft:document.querySelector('#draft').value,scrollY,title:document.title})`)
    const historyAfter = {
        activeIndex: view.webContents.navigationHistory.getActiveIndex(),
        entries: view.webContents.navigationHistory.getAllEntries().map((entry) => entry.url)
    }

    assert.equal(view.webContents.id, webContentsId)
    assert.equal(view.webContents.getProcessId(), rendererPid)
    assert.equal(view.webContents.session, browserSession)
    assert.deepEqual(after, before)
    assert.deepEqual(historyAfter, historyBefore)

    destination.contentView.removeChildView(view)
    source.contentView.addChildView(view)
    assert.equal(await view.webContents.executeJavaScript('++globalThis.liveState.counter'), 43)

    source.contentView.removeChildView(view)
    source.destroy()
    assert.equal(view.webContents.isDestroyed(), false, 'destroying a shell after detachment must not destroy the transferable page')
    destination.contentView.addChildView(view)
    destination.contentView.removeChildView(view)
    destination.destroy()
    const pageContents = view.webContents
    pageContents.close({ waitForBeforeUnload: false })
    assert.equal(pageContents.isDestroyed(), true, 'the main tab owner must explicitly close the final view')

    await browserSession.clearStorageData()
    clearTimeout(failTimer)
    console.log(JSON.stringify({ webContentsId, rendererPid, before, after, historyEntries: historyAfter.entries.length }))
    app.quit()
}).catch((error) => {
    clearTimeout(failTimer)
    console.error(error)
    app.exit(1)
})
