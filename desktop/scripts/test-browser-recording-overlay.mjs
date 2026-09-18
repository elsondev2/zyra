import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'

const directory = dirname(fileURLToPath(import.meta.url))
const userData = await mkdtemp(join(tmpdir(), 'zyra-recorder-overlay-'))
try {
    await build({ stdin: { contents: `export { BrowserRecordingOverlayManager } from '../src/main/browser-recording-overlay'; export { registerTrustedIpcSender } from '../src/main/ipc/trusted-ipc'; export { trustedBrowserGuests } from '../src/main/agent-control/trusted-guest-registry'; export { BROWSER_RECORDING_OVERLAY_IPC } from '../src/shared/contracts/browser-recording-overlay';`, resolveDir: directory, loader: 'ts' }, outfile: join(userData, 'manager.cjs'), bundle: true, platform: 'node', format: 'cjs', external: ['electron'] })
    await build({ stdin: { contents: `import { installBrowserRecordingOverlayPreload } from '../src/preload/browser-recording-overlay'; installBrowserRecordingOverlayPreload();`, resolveDir: directory, loader: 'ts' }, outfile: join(userData, 'overlay-preload.cjs'), bundle: true, platform: 'node', format: 'cjs', external: ['electron'] })
    await writeFile(join(userData, 'test-preload.cjs'), `const{contextBridge,ipcRenderer}=require('electron');const commands=[],presentations=[];ipcRenderer.on('devscope:browserRecordingOverlay:command',(_e,value)=>commands.push(value));ipcRenderer.on('devscope:browserRecordingOverlay:presentation',(_e,value)=>presentations.push(value));contextBridge.exposeInMainWorld('fixture',{invoke:(...args)=>ipcRenderer.invoke(...args),send:(...args)=>ipcRenderer.send(...args),commands:()=>commands,presentations:()=>presentations});`)
    const exitCode = await new Promise((resolve, reject) => {
        const useDisplay = process.platform === 'linux' && process.env.CI && !process.env.DISPLAY
        const args = [...(process.platform === 'linux' && process.env.CI ? ['--no-sandbox'] : []), join(directory, 'browser-recording-overlay-smoke.cjs')]
        const child = spawn(useDisplay ? 'xvfb-run' : electronPath, useDisplay ? ['--auto-servernum', electronPath, ...args] : args, {
            env: { ...process.env, ZYRA_RECORDING_OVERLAY_USER_DATA: userData }, stdio: 'inherit', shell: false, windowsHide: true
        })
        child.once('error', reject); child.once('exit', code => resolve(code ?? 1))
    })
    if (exitCode !== 0) process.exitCode = exitCode
} finally { await rm(userData, { recursive: true, force: true }).catch(() => undefined) }
