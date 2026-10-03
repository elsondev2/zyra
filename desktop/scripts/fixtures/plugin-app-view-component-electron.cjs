const { app, BrowserWindow } = require('electron')
const assert = require('node:assert/strict')
const path = require('node:path')
const directory = process.env.ZYRA_APP_COMPONENT_TEST_DIR
const sdkChunk = process.env.ZYRA_APP_COMPONENT_SDK_CHUNK
app.setPath('userData', path.join(directory, 'profile'))
let window
let stage = 'launch'
const diagnostics = []
const timer = setTimeout(() => { console.error('Actual app-view component timed out at '+stage, diagnostics); app.exit(1) }, 30000)
const waitFor = async read => {
    const deadline = Date.now() + 10000
    while (Date.now() < deadline) {
        if (await read()) return
        await new Promise(resolve => setTimeout(resolve, 25))
    }
    throw Error('Actual app-view component did not settle')
}
app.whenReady().then(async () => {
    stage = 'Electron ready'
    window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } })
    window.webContents.on('console-message', event => diagnostics.push(String(event.message).slice(0,250)))
    window.webContents.on('did-fail-load', (_event, code, message) => diagnostics.push(`load ${code}: ${message}`))
    window.webContents.on('dom-ready', () => { stage = 'DOM ready' })
    window.webContents.on('did-finish-load', () => { stage = 'load finished' })
    const requests = []
    window.webContents.debugger.attach('1.3')
    window.webContents.debugger.on('message', (_event, method, params) => { if (method === 'Network.requestWillBeSent') requests.push(params.request.url) })
    stage = 'enable network and navigate'
    const networkEnabled = window.webContents.debugger.sendCommand('Network.enable')
    const js = source => window.webContents.executeJavaScript(source)
    await window.loadURL(process.env.ZYRA_APP_COMPONENT_TEST_URL)
    await networkEnabled
    stage = 'closed widget'; console.log(stage)
    assert.equal(await js('document.querySelector("button")?.textContent'), 'Open')
    assert.equal(requests.some(url => url.endsWith('/'+sdkChunk)), false, 'closed widget must not fetch the SDK')
    await js('document.querySelector("button").click()')
    stage = 'waiting for paused SDK'; console.log(stage)
    await waitFor(async () => (await (await fetch(process.env.ZYRA_APP_COMPONENT_TEST_URL+'/__sdk-status')).json()).paused)
    await js('[...document.querySelectorAll("button")].find(button => button.textContent === "Close").click()')
    assert.equal(await js('!!document.querySelector("iframe")'), false)
    await js('document.querySelector("button").click()')
    await waitFor(() => js('!!document.querySelector("iframe")'))
    await js('window.replaceViewFixture("ui://fixture/changed")')
    assert.equal(await js('!!document.querySelector("iframe")'), false, 'descriptor changes invalidate a pending bridge')
    assert.equal(await js('document.querySelector("button").textContent'), 'Open')
    await fetch(process.env.ZYRA_APP_COMPONENT_TEST_URL+'/__release-sdk', { method: 'POST' })
    stage = 'closed during SDK load'; console.log(stage)
    await js('document.querySelector("button").click()')
    const innerFrame = () => window.webContents.mainFrame.frames.flatMap(frame => frame.frames).find(frame => frame.url === 'about:srcdoc')
    await waitFor(async () => { const inner = innerFrame(); return inner && await inner.executeJavaScript('document.getElementById("status")?.textContent === "initial result"') })
    stage = 'first result'; console.log(stage)
    assert.equal(await js('window.lastRequestedUri'), 'ui://fixture/changed', 'the replacement uses its own resource')
    assert.equal(requests.some(url => url.endsWith('/'+sdkChunk)), true, 'opening the widget fetches the SDK')
    await innerFrame().executeJavaScript('document.getElementById("call").click()')
    await waitFor(() => js('!!document.querySelector("[role=dialog]")'))
    assert.equal(await innerFrame().executeJavaScript('document.getElementById("status").textContent'), 'initial result', 'tool call waits for approval')
    await js('[...document.querySelectorAll("button")].find(button => button.textContent === "Allow once").click()')
    await waitFor(() => innerFrame().executeJavaScript('document.getElementById("status")?.textContent === "refreshed result"'))
    await js('[...document.querySelectorAll("button")].find(button => button.textContent === "Close").click()')
    await waitFor(() => js('!document.querySelector("iframe")'))
    await js('document.querySelector("button").click()')
    await waitFor(async () => { const inner = innerFrame(); return inner && await inner.executeJavaScript('document.getElementById("status")?.textContent === "initial result"') })
    await js('window.unmountFixture()')
    assert.equal(await js('document.getElementById("root").childElementCount'), 0)
    assert.equal(window.isVisible(), false)
    console.log('Actual app-view component: SDK deferred, real sandbox/result, approval, close/reopen, unmount and hidden presentation passed.')
    clearTimeout(timer)
    window.destroy()
    app.quit()
}).catch(async error => {
    console.error(error, diagnostics)
    if (window && !window.isDestroyed()) {
        console.error(await window.webContents.executeJavaScript('({text:document.body.innerText,iframe:document.querySelector("iframe")?.src})').catch(() => 'renderer closed'))
        window.destroy()
    }
    clearTimeout(timer); app.exit(1)
})
