import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const directory = await mkdtemp(join(tmpdir(), 'zyra-webview-presentation-'))
try {
    const bundle = await build({
        entryPoints: [join(desktop, 'scripts/fixtures/browser-webview-presentation.tsx')],
        bundle: true, write: false, format: 'iife', jsx: 'automatic', platform: 'browser',
        alias: { '@': join(desktop, 'src/renderer/src') },
        plugins: [{
            name: 'browser-live-presentation-fixture',
            setup(build) {
                build.onResolve({ filter: /\/assistant-browser-live-presentation$/ }, () => ({ path: 'browser-live-presentation', namespace: 'fixture' }))
                build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
                    contents: 'export const createAssistantBrowserLivePresentation=(...args)=>globalThis.__webviewPresentationController(...args);',
                    loader: 'js'
                }))
            }
        }]
    })
    const html = join(directory, 'index.html')
    await writeFile(html, `<!doctype html><div id="root"></div><script>${bundle.outputFiles[0].text}</script>`)
    const harness = join(directory, 'run.cjs')
    await writeFile(harness, `const{app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(directory, 'profile'))});const timer=setTimeout(()=>{console.error('BrowserWebview presentation timed out');app.exit(1)},15000);app.whenReady().then(async()=>{const window=new BrowserWindow({show:false,webPreferences:{backgroundThrottling:false,offscreen:true,sandbox:true,contextIsolation:true,nodeIntegration:false}});await window.loadFile(${JSON.stringify(html)});const results=await window.webContents.executeJavaScript('window.browserWebviewPresentationCheck');for(const result of results)console.log('PASS: '+result);window.destroy();clearTimeout(timer);app.quit()}).catch(error=>{console.error(error);clearTimeout(timer);app.exit(1)});`)
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    const virtual = process.platform === 'linux' && Boolean(process.env.CI) && !process.env.DISPLAY
    const args = [...(process.platform === 'linux' && process.env.CI ? ['--no-sandbox'] : []), harness]
    process.exitCode = await new Promise((done, reject) => {
        const child = spawn(virtual ? 'xvfb-run' : electronPath, virtual ? ['--auto-servernum', electronPath, ...args] : args, {
            cwd: desktop, env, stdio: 'inherit', windowsHide: true, shell: false
        })
        child.once('error', reject)
        child.once('exit', code => done(code ?? 1))
    })
} finally {
    if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith('zyra-webview-presentation-')) {
        throw new Error('Unexpected BrowserWebview presentation test cleanup path')
    }
    await rm(directory, { recursive: true, force: true })
}
