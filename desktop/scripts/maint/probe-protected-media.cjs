const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const electron = require('electron')

const { app, BrowserWindow, components, session } = electron
const userData = path.join(os.tmpdir(), `zyra-protected-media-probe-${process.pid}`)
app.setPath('userData', userData)

app.whenReady().then(async () => {
    if (!components?.WIDEVINE_CDM_ID) throw new Error('This Electron runtime does not expose Widevine components.')
    const componentPromise = components.whenReady([components.WIDEVINE_CDM_ID])
    const shell = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false } })
    await shell.loadURL('data:text/html,Zyra protected-media probe')
    const componentResult = await componentPromise
    const browserSession = session.fromPartition('persist:zyra-protected-media-smoke', { cache: true })
    const authorizedWebContentsIds = new Set()
    browserSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
        if (!webContents || !authorizedWebContentsIds.has(webContents.id) || permission !== 'mediaKeySystem') return false
        const requestingUrl = details.requestingUrl || requestingOrigin
        return requestingUrl.startsWith('https://')
    })
    browserSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
        callback(authorizedWebContentsIds.has(webContents.id) && permission === 'mediaKeySystem' && details.requestingUrl.startsWith('https://'))
    })
    const guest = new BrowserWindow({ show: false, webPreferences: { session: browserSession, contextIsolation: true, sandbox: true, nodeIntegration: false } })
    authorizedWebContentsIds.add(guest.webContents.id)
    await guest.loadURL('https://example.com/')
    const result = await guest.webContents.executeJavaScript(`navigator.requestMediaKeySystemAccess('com.widevine.alpha', [{ initDataTypes: ['cenc'], audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"' }] }]).then((access) => ({ widevine: true, keySystem: access.keySystem })).catch((error) => ({ widevine: false, name: error.name, message: error.message }))`)
    console.log(JSON.stringify({ componentResult, persistentPartition: true, permissionScopedToGuest: true, result }))
    shell.destroy()
    guest.destroy()
    if (!result.widevine) throw new Error(`${result.name}: ${result.message}`)
    app.quit()
}).catch((error) => {
    console.error(error)
    app.exit(1)
}).finally(() => {
    setTimeout(() => fs.rmSync(userData, { recursive: true, force: true }), 100).unref?.()
})
