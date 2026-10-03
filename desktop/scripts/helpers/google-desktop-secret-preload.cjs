const { contextBridge, ipcRenderer } = require('electron')
const channel = process.argv.find(value => value.startsWith('--zyra-google-secret-channel='))?.split('=')[1]
if (channel) contextBridge.exposeInMainWorld('googleSetup', Object.freeze({
    save: secret => ipcRenderer.invoke(channel, secret)
}))
