import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
import { FuseV1Options, getCurrentFuseWire } from '@electron/fuses'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const userDataPath = await mkdtemp(path.join(tmpdir(), 'zyra-electron-security-'))
const env = { ...process.env, ZYRA_SECURITY_SMOKE_USER_DATA: userDataPath }
delete env.ELECTRON_RUN_AS_NODE

const developmentFuseWire = await getCurrentFuseWire(electronPath)
for (const fuse of [
    FuseV1Options.EnableCookieEncryption,
    FuseV1Options.EnableNodeOptionsEnvironmentVariable,
    FuseV1Options.EnableNodeCliInspectArguments,
    FuseV1Options.EnableEmbeddedAsarIntegrityValidation,
    FuseV1Options.OnlyLoadAppFromAsar
]) {
    if (developmentFuseWire[fuse] === undefined) throw new Error(`Electron binary does not expose fuse ${FuseV1Options[fuse]}.`)
}

try {
    const exitCode = await new Promise((resolve, reject) => {
        const child = spawn(electronPath, [path.join(scriptDirectory, 'electron-security-hardening-smoke.cjs'), `--user-data-dir=${userDataPath}`], {
            cwd: path.resolve(scriptDirectory, '..'),
            env,
            stdio: 'inherit',
            shell: false,
            windowsHide: true
        })
        child.once('error', reject)
        child.once('exit', (code) => resolve(code ?? 1))
    })
    if (exitCode !== 0) process.exit(exitCode)
    console.log('Electron sandbox and website-guest capability smoke: ok')
} finally {
    await rm(userDataPath, { recursive: true, force: true }).catch(() => undefined)
}
