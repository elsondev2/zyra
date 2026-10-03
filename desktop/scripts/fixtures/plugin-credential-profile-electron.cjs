const { app, safeStorage } = require('electron')
const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

app.disableHardwareAcceleration()
app.setPath('userData', process.env.ZYRA_CREDENTIAL_TEST_PROFILE)
app.setPath('sessionData', join(process.env.ZYRA_CREDENTIAL_TEST_PROFILE, 'session'))
app.whenReady().then(() => {
    const file = process.env.ZYRA_CREDENTIAL_TEST_FILE
    if (process.env.ZYRA_CREDENTIAL_TEST_MODE.startsWith('write')) {
        writeFileSync(file, safeStorage.encryptString('synthetic-public-registration'))
        console.log('ENCRYPTED')
        if (process.env.ZYRA_CREDENTIAL_TEST_MODE === 'write-abrupt') { app.exit(0); return }
    } else {
        try {
            const value = safeStorage.decryptString(readFileSync(file))
            if (value !== 'synthetic-public-registration') throw new Error('Unexpected synthetic value.')
            console.log('READABLE')
        } catch {
            console.log('UNREADABLE')
        }
    }
    app.quit()
}).catch(() => { console.error('Synthetic credential profile fixture failed.'); app.exit(1) })
