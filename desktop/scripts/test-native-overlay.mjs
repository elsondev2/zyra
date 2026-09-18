import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'

const directory = dirname(fileURLToPath(import.meta.url))
const userData = await mkdtemp(join(tmpdir(), 'zyra-native-overlay-'))
try {
    await build({ stdin: { contents: `export { NativeOverlayManager } from '../src/main/native-overlay-manager'; export { addNativeWindowView } from '../src/main/native-view-layers'; export { registerTrustedIpcSender, assertTrustedIpcEvent } from '../src/main/ipc/trusted-ipc'; export { NATIVE_OVERLAY_IPC, NATIVE_OVERLAY_FRAME_PREFIX } from '../src/shared/contracts/native-overlay';`, resolveDir: directory, loader: 'ts' }, outfile: join(userData, 'manager.cjs'), bundle: true, platform: 'node', format: 'cjs', external: ['electron'] })
    await build({ stdin: { contents: `import {contextBridge,ipcRenderer} from 'electron'; import {createNativeOverlayAdapter} from '../src/preload/adapters/native-overlay-adapter'; const notices=[]; const api=createNativeOverlayAdapter(); api.onNativeOverlayDismiss(value=>notices.push(value)); contextBridge.exposeInMainWorld('fixture',{...api, notices:()=>notices, callback:()=>ipcRenderer.invoke('fixture:callback')});`, resolveDir: directory, loader: 'ts' }, outfile: join(userData, 'preload.cjs'), bundle: true, platform: 'node', format: 'cjs', external: ['electron'] })
    await writeFile(join(userData, 'owner.html'), '<!doctype html><style>body{margin:0;background:#17212e;color:#fff;font:16px system-ui}header{padding:20px}</style><header>Trusted native overlay fixture <button id="trigger">Open controls</button></header>')
    const env = { ...process.env, ZYRA_NATIVE_OVERLAY_USER_DATA: userData }; delete env.ELECTRON_RUN_AS_NODE
    const exitCode = await new Promise((done, reject) => {
        const args = [join(directory, 'native-overlay-smoke.cjs'), ...process.argv.slice(2).filter(arg => arg === '--hold' || arg === '--hover-only' || arg === '--scoped-only')]
        const child = spawn(electronPath, args, { env, stdio: 'inherit', shell: false, windowsHide: true })
        child.once('error', reject); child.once('exit', code => done(code ?? 1))
    })
    if (exitCode !== 0) process.exitCode = exitCode
} finally {
    if (!resolve(userData).startsWith(join(resolve(tmpdir()), 'zyra-native-overlay-'))) throw new Error('Invalid fixture cleanup path.')
    await rm(userData, { recursive: true, force: true }).catch(() => undefined)
}
