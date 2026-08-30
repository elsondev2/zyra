const assert = require('node:assert/strict')
const path = require('node:path')
const { app, BrowserWindow, WebContentsView } = require('electron')

if (process.env.ZYRA_SECURITY_SMOKE_USER_DATA) app.setPath('userData', process.env.ZYRA_SECURITY_SMOKE_USER_DATA)
app.enableSandbox()

app.whenReady().then(async () => {
    const shell = new BrowserWindow({
        show: false,
        webPreferences: {
            preload: path.join(__dirname, '..', 'out', 'preload', 'index.cjs'),
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            webviewTag: false
        }
    })
    const guest = new WebContentsView({
        webPreferences: {
            preload: undefined,
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            nodeIntegrationInSubFrames: false,
            nodeIntegrationInWorker: false
        }
    })
    const popupShell = new BrowserWindow({
        show: false,
        webPreferences: {
            preload: path.join(__dirname, '..', 'out', 'preload', 'index.cjs'),
            additionalArguments: ['--zyra-preload-surface=browser-popup'],
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            webviewTag: false
        }
    })

    try {
        await shell.loadURL('data:text/html,<meta charset=utf-8><title>Zyra security smoke</title>')
        const shellCapabilities = await shell.webContents.executeJavaScript(`({
            devscope: typeof window.devscope,
            require: typeof window.require,
            process: typeof window.process
        })`)
        assert.deepEqual(shellCapabilities, { devscope: 'object', require: 'undefined', process: 'undefined' })
        assert.equal(shell.webContents.getLastWebPreferences().sandbox, true)

        await guest.webContents.loadURL('data:text/html,<meta charset=utf-8><title>Website guest</title>')
        const guestCapabilities = await guest.webContents.executeJavaScript(`({
            devscope: typeof window.devscope,
            require: typeof window.require,
            process: typeof window.process
        })`)
        assert.deepEqual(guestCapabilities, { devscope: 'undefined', require: 'undefined', process: 'undefined' })
        assert.equal(guest.webContents.getLastWebPreferences().sandbox, true)

        await popupShell.loadURL('data:text/html,<meta charset=utf-8><title>Popup shell</title>')
        const popupCapabilities = await popupShell.webContents.executeJavaScript(`({
            keys: Object.keys(window.devscope || {}).sort(),
            browserPopup: typeof window.devscope?.browserPopup,
            preferences: typeof window.devscope?.preferences,
            require: typeof window.require,
            process: typeof window.process
        })`)
        assert.deepEqual(popupCapabilities, {
            keys: ['browserPopup', 'preferences', 'secrets', 'window'],
            browserPopup: 'object',
            preferences: 'object',
            require: 'undefined',
            process: 'undefined'
        })
    } finally {
        if (!guest.webContents.isDestroyed()) guest.webContents.close({ waitForBeforeUnload: false })
        if (!popupShell.isDestroyed()) popupShell.destroy()
        if (!shell.isDestroyed()) shell.destroy()
    }
}).then(() => app.quit()).catch((error) => {
    console.error(error)
    app.exit(1)
})
