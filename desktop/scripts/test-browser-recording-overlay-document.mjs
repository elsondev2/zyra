import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'

const directory = dirname(fileURLToPath(import.meta.url))
const userData = await mkdtemp(join(tmpdir(), 'zyra-recorder-document-'))
try {
    const documentModule = join(userData, 'document.cjs')
    await build({ entryPoints: [join(directory, '../src/main/browser-recording-overlay-document.ts')], outfile: documentModule, bundle: true, platform: 'node', format: 'cjs' })
    await writeFile(join(userData, 'preload.cjs'), `const{contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('zyraRecordingOverlay',{getState:()=>ipcRenderer.invoke('read'),onState:listener=>{const fn=(_e,state)=>listener(state);ipcRenderer.on('state',fn);return()=>ipcRenderer.removeListener('state',fn)},command:command=>ipcRenderer.send('command',command),resize:height=>ipcRenderer.send('resize',height)});`)
    const exitCode = await new Promise((resolve, reject) => {
        const useDisplay = process.platform === 'linux' && process.env.CI && !process.env.DISPLAY
        const args = [...(process.platform === 'linux' && process.env.CI ? ['--no-sandbox'] : []), join(directory, 'browser-recording-overlay-document-smoke.cjs')]
        const child = spawn(useDisplay ? 'xvfb-run' : electronPath, useDisplay ? ['--auto-servernum', electronPath, ...args] : args, {
            env: { ...process.env, ZYRA_RECORDER_DOCUMENT_USER_DATA: userData, ZYRA_RECORDER_DOCUMENT_MODULE: documentModule },
            stdio: 'inherit', shell: false, windowsHide: true
        })
        child.once('error', reject)
        child.once('exit', code => resolve(code ?? 1))
    })
    if (exitCode !== 0) process.exitCode = exitCode
} finally {
    await rm(userData, { recursive: true, force: true }).catch(() => undefined)
}
