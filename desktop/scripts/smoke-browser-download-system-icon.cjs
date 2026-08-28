const { app } = require('electron')
const { existsSync } = require('node:fs')

const targetPath = process.argv[2] || process.execPath

void app.whenReady().then(async () => {
    try {
        if (!existsSync(targetPath)) throw new Error(`File does not exist: ${targetPath}`)
        const icon = await app.getFileIcon(targetPath, { size: 'normal' })
        const dataUrl = icon.toDataURL()
        if (icon.isEmpty() || !dataUrl.startsWith('data:image/png;base64,')) {
            throw new Error('Electron did not return a usable PNG icon.')
        }
        console.log(`System file icon: ok (${dataUrl.length} data-url characters)`)
    } finally {
        app.quit()
    }
}).catch((error) => {
    console.error(error)
    app.exit(1)
})
