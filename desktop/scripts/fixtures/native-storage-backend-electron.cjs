const { app, safeStorage } = require('electron')
const assert = require('node:assert/strict')

app.disableHardwareAcceleration()
app.setPath('userData', process.env.ZYRA_NATIVE_TEST_STORAGE_PROFILE)
app.whenReady().then(() => {
    const storageBackend = safeStorage.getSelectedStorageBackend()
    const encryptionAvailable = safeStorage.isEncryptionAvailable()
    console.log('Native test storage:', JSON.stringify({ encryptionAvailable, storageBackend }))
    assert.equal(encryptionAvailable, true, 'Native encryption must be available on the CI runner')
    assert.equal(storageBackend, 'gnome_libsecret', 'CI fixtures require the isolated GNOME secret service')
    const value = 'synthetic-native-storage-probe'
    assert.equal(safeStorage.decryptString(safeStorage.encryptString(value)), value)
    app.quit()
}).catch(() => {
    console.error('Native encryption preflight failed; refusing plaintext fallback.')
    app.exit(1)
})
