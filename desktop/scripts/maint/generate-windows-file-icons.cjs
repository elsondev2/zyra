// Rasterize the installed Material SVGs using our existing Chromium dependency.
// No downloads, visible windows, app profile, or production build are involved.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createHash } = require('node:crypto')
const root = path.resolve(__dirname, '../..')
const sizes = [16, 24, 32, 48, 64, 128, 256]

function encodeIco(frames) {
    const header = Buffer.alloc(6 + frames.length * 16)
    header.writeUInt16LE(1, 2)
    header.writeUInt16LE(frames.length, 4)
    let offset = header.length
    frames.forEach((png, index) => {
        const entry = 6 + index * 16
        header[entry] = header[entry + 1] = sizes[index] % 256
        header.writeUInt16LE(1, entry + 4)
        header.writeUInt16LE(32, entry + 6)
        header.writeUInt32LE(png.length, entry + 8)
        header.writeUInt32LE(offset, entry + 12)
        offset += png.length
    })
    return Buffer.concat([header, ...frames])
}

async function generate() {
    const { app, BrowserWindow } = require('electron')
    app.setPath('userData', process.env.ZYRA_ICON_GENERATOR_PROFILE)
    app.disableHardwareAcceleration()
    await app.whenReady()
    const window = new BrowserWindow({ show: false, webPreferences: {
        sandbox: true, contextIsolation: true, nodeIntegration: false
    } })
    try {
        await window.loadURL('data:text/html,<meta charset="utf-8"><title>File icon generator</title>')
        const theme = require('material-icon-theme/dist/material-icons.json')
        const { windowsFileAssociations, windowsFileIconNsis } = require('../release/windows-file-icons-before-pack.cjs')
        const originalAssociations = require('../../package.json').build.fileAssociations
        const associations = windowsFileAssociations(originalAssociations)
        const output = path.join(root, 'resources/file-icons')
        fs.mkdirSync(output, { recursive: true })
        const sources = {}
        for (const icon of new Set(associations.map(item => path.basename(item.icon)))) {
            const definition = icon.slice('zyra-file-'.length, -4)
            const svgName = path.basename(theme.iconDefinitions[definition].iconPath)
            const svg = fs.readFileSync(path.join(root, 'node_modules/material-icon-theme/icons', svgName))
            sources[icon] = { svg: svgName, sha256: createHash('sha256').update(svg).digest('hex') }
            const uri = `data:image/svg+xml;base64,${svg.toString('base64')}`
            const frames = await window.webContents.executeJavaScript(`(async () => {
                const image = new Image(); image.src = ${JSON.stringify(uri)};
                await image.decode();
                return ${JSON.stringify(sizes)}.map(size => {
                    const canvas = document.createElement('canvas');
                    canvas.width = canvas.height = size;
                    canvas.getContext('2d').drawImage(image, 0, 0, size, size);
                    return canvas.toDataURL('image/png').split(',')[1];
                });
            })()`)
            fs.writeFileSync(path.join(output, icon), encodeIco(frames.map(frame => Buffer.from(frame, 'base64'))))
        }
        fs.copyFileSync(path.join(root, 'node_modules/material-icon-theme/LICENSE'), path.join(output, 'LICENSE.txt'))
        fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({
            theme: 'material-icon-theme',
            version: require('material-icon-theme/package.json').version,
            sources,
            associations: associations.map(item => ({ ext: item.ext[0], progId: item.name, icon: path.basename(item.icon) }))
        }, null, 2) + '\n')
        fs.writeFileSync(path.join(root, 'build/windows-file-icons.nsh'), windowsFileIconNsis(originalAssociations))
        console.log(`Generated ${Object.keys(sources).length} Material ICOs for ${associations.length} extensions.`)
    } finally {
        window.destroy()
        app.quit()
    }
}

if (process.versions.electron) {
    const timer = setTimeout(() => { console.error('File icon generation timed out'); process.exit(1) }, 60_000)
    generate().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => clearTimeout(timer))
} else {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'zyra-file-icons-'))
    try {
        const env = { ...process.env, ZYRA_ICON_GENERATOR_PROFILE: profile }
        delete env.ELECTRON_RUN_AS_NODE
        const result = require('node:child_process').spawnSync(require('electron'), [__filename], {
            env, stdio: 'inherit', windowsHide: true, timeout: 90_000
        })
        if (result.error) throw result.error
        process.exitCode = result.status ?? 1
    } finally {
        fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    }
}
