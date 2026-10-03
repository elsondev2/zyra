const { app, BrowserWindow } = require('electron')
const assert = require('node:assert/strict')
const path = require('node:path')

const directory = process.env.ZYRA_APP_VIEW_TEST_DIR
app.setPath('userData', path.join(directory, 'profile'))
let window
const diagnostics = []
const timer = setTimeout(() => { console.error('App view host fixture timed out'); app.exit(1) }, 20000)

async function waitFor(read, timeout = 8000) {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
        const value = await read()
        if (value) return value
        await new Promise((resolve) => setTimeout(resolve, 50))
    }
    throw new Error('Timed out waiting for app view host: ' + JSON.stringify(window.webContents.mainFrame.frames.map((frame) => frame.url)))
}

app.whenReady().then(async () => {
    window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } })
    window.webContents.on('console-message', (event, message) => { if (diagnostics.length < 20) diagnostics.push(event.message || message) })
    window.webContents.on('did-fail-load', (_event, code, description, url) => { diagnostics.push(`Load failed ${code} ${description} ${url}`) })
    await window.loadFile(path.join(directory, 'index.html'))
    const outer = await waitFor(() => window.webContents.mainFrame.frames.find((frame) => frame.url.endsWith('mcp-app-sandbox.html')))
    const inner = await waitFor(() => outer.frames.find((frame) => frame.url === 'about:srcdoc'))
    await waitFor(() => window.webContents.executeJavaScript('window.zyraAppViewTestStatus === "ready"'))
    const initial = await waitFor(() => inner.executeJavaScript('document.getElementById("status")?.textContent === "initial result"'))
    assert.equal(initial, true)
    const isolated = await window.webContents.executeJavaScript('document.getElementById("sandbox").contentDocument === null')
    assert.equal(isolated, true, 'Plugin view proxy has an opaque origin')
    await inner.executeJavaScript('document.getElementById("call").click()')
    await waitFor(() => window.webContents.executeJavaScript('window.zyraAppViewTestStatus === "called"'))
    await waitFor(() => inner.executeJavaScript('document.getElementById("status")?.textContent === "refreshed result"'))
    console.log('MCP app view sandbox, handshake, tool result and view-initiated call: ok')
    clearTimeout(timer)
    window.destroy()
    app.quit()
}).catch((error) => {
    const frame = window?.webContents?.mainFrame?.frames?.[0]
    void frame?.executeJavaScript('({ ready: document.readyState, inner: document.querySelector("iframe")?.outerHTML, body: document.body?.innerHTML.slice(0, 160), last: document.body.dataset.lastMethod })').then(async (state) => {
        const host = await window.webContents.executeJavaScript('window.zyraAppViewTestStatus')
        console.error(error, 'Host: ' + host, 'Frame: ' + JSON.stringify(state), 'Child frames: ' + JSON.stringify(frame?.frames?.map((entry) => entry.url)), 'Diagnostics: ' + JSON.stringify(diagnostics))
        clearTimeout(timer)
        if (window && !window.isDestroyed()) window.destroy()
        app.exit(1)
    }).catch(() => {
        console.error(error, 'Diagnostics: ' + JSON.stringify(diagnostics))
        clearTimeout(timer)
        if (window && !window.isDestroyed()) window.destroy()
        app.exit(1)
    })
})
