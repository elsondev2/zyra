import { readFile } from 'node:fs/promises'
import path from 'node:path'

function arg(name, fallback = null) {
    const inline = process.argv.slice(2).find((value) => value.startsWith(`--${name}=`))
    if (inline) return inline.slice(name.length + 3)
    const index = process.argv.indexOf(`--${name}`)
    return index >= 0 ? process.argv[index + 1] : fallback
}

const directory = path.resolve(arg('dir', '.'))
const requireSigning = arg('require-signing', 'false') === 'true'
const markers = new Map()
for (const platform of ['windows', 'macos', 'linux']) {
    const marker = JSON.parse(await readFile(path.join(directory, `${platform}.json`), 'utf8'))
    if (marker.schemaVersion !== 1 || marker.platform !== platform || !Array.isArray(marker.checks)) {
        throw new Error(`Invalid ${platform} signature verification marker`)
    }
    markers.set(platform, marker)
}

if (requireSigning) {
    const windows = markers.get('windows')
    const macos = markers.get('macos')
    if (windows.signed !== true || !windows.checks.some((check) => check.name === 'authenticode')) {
        throw new Error('Tagged publication requires a verified Windows Authenticode signature')
    }
    if (!windows.checks.some((check) => check.name === 'widevine-vmp')) {
        throw new Error('Tagged publication requires verified Windows Widevine VMP signing')
    }
    if (macos.signed !== true || macos.notarized !== true) {
        throw new Error('Tagged publication requires verified macOS signing and notarization')
    }
    for (const requiredCheck of ['widevine-vmp', 'codesign', 'gatekeeper', 'notarization-staple']) {
        if (!macos.checks.some((check) => check.name === requiredCheck)) {
            throw new Error(`Tagged publication is missing macOS verification: ${requiredCheck}`)
        }
    }
}

console.log(`Validated native signature markers (signing required: ${requireSigning}).`)
