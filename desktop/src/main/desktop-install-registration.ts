import { app } from 'electron'
import os from 'node:os'
import { join } from 'node:path'
import { writeJsonAtomically } from './setup/atomic-json'

export async function registerInstalledDesktop(): Promise<void> {
    if (!app.isPackaged) return
    const target = join(os.homedir(), '.zyra', 'desktop-install-v1.json')
    await writeJsonAtomically(target, {
        version: 1,
        appVersion: app.getVersion(),
        executable: process.platform === 'linux' && process.env.APPIMAGE ? process.env.APPIMAGE : process.execPath,
        launchArgs: [],
        platform: process.platform,
        architecture: process.arch,
        registeredAt: new Date().toISOString()
    })
}
