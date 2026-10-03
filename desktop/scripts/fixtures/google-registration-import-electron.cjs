const { app, dialog, BrowserWindow, safeStorage } = require('electron')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const fs = require('node:fs/promises')
const originalRead = fs.readFile
fs.readFile = async (...args) => { await new Promise(resolve => setTimeout(resolve, 100)); return originalRead(...args) }
app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => {
    if (!process.argv.includes('--enter-secret') || process.env.ZYRA_IMPORT_TEST_CANCEL === '1') return
    const expected = JSON.parse(readFileSync(process.env.ZYRA_IMPORT_TEST_JSON, 'utf8')).installed.client_secret
    const record = JSON.parse(safeStorage.decryptString(readFileSync(join(process.env.ZYRA_IMPORT_TEST_APPDATA, 'Zyra-dev', 'assistant', 'plugins', 'credentials', 'google-mcp-client.enc'))))
    if (record.records['zyra-google-desktop-client'].issuers['https://accounts.google.com'].client.client_secret !== expected) {
        console.error('Synthetic shutdown regression: encrypted write was not complete.')
        app.exit(2)
    }
})
BrowserWindow.prototype.show = function () {}
BrowserWindow.prototype.focus = function () {}
if (process.argv.includes('--enter-secret')) app.on('browser-window-created', (_event, window) => {
    window.webContents.once('did-finish-load', async () => {
        if (process.env.ZYRA_IMPORT_TEST_CANCEL === '1') { window.close(); return }
        const secret = JSON.parse(readFileSync(process.env.ZYRA_IMPORT_TEST_JSON, 'utf8')).installed.client_secret
        assert.equal(await window.webContents.executeJavaScript("document.querySelector('input').type"), 'password')
        await window.webContents.executeJavaScript(`document.querySelector('input').value=${JSON.stringify(secret)};document.querySelector('form').requestSubmit();`)
    })
})
app.setPath('appData', process.env.ZYRA_IMPORT_TEST_APPDATA)
dialog.showOpenDialog = async () => ({ canceled: process.env.ZYRA_IMPORT_TEST_CANCEL === '1', filePaths: [process.env.ZYRA_IMPORT_TEST_JSON] })
require(process.env.ZYRA_IMPORT_TEST_BUNDLE)
