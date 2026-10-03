import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const directory = await mkdtemp(join(tmpdir(), 'zyra-terminal-input-'))
try {
    const bundle = await build({ entryPoints: [join(desktop, 'scripts/fixtures/assistant-terminal-input.tsx')], bundle: true, write: false, format: 'iife', jsx: 'automatic', platform: 'browser', define: { 'import.meta.hot': 'undefined' }, alias: { '@': join(desktop, 'src/renderer/src'), '@shared': join(desktop, 'src/shared') }, plugins: [{ name: 'controlled-runtime-startup', setup(builder) {
        builder.onResolve({ filter: /previewTerminalRuntime$/ }, () => ({ path: 'delayed-runtime', namespace: 'fixture' }))
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ resolveDir: desktop, loader: 'js', contents: `import {Terminal} from 'xterm';import {FitAddon} from 'xterm-addon-fit';import {WebLinksAddon} from 'xterm-addon-web-links';let release;const ready=new Promise(resolve=>release=resolve);window.releaseTerminalRuntime=release;export async function loadPreviewTerminalRuntime(){await ready;return {Terminal,FitAddon,WebLinksAddon}}` }))
    } }] })
    const css = await readFile(join(desktop, 'node_modules/xterm/css/xterm.css'), 'utf8')
    const html = join(directory, 'index.html')
    await writeFile(html, `<!doctype html><head><style>${css}.h-full{height:100%}.w-full{width:100%}</style></head><body><script>${bundle.outputFiles[0].text}</script>`)
    const harness = join(directory, 'run.cjs')
    await writeFile(harness, `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(directory, 'profile'))});let owner;const timer=setTimeout(()=>{console.error('Terminal input test timed out');app.exit(1)},20000);app.whenReady().then(async()=>{owner=new BrowserWindow({show:false,width:840,height:520,webPreferences:{backgroundThrottling:false,offscreen:true,sandbox:true,contextIsolation:true,nodeIntegration:false}});await owner.loadFile(${JSON.stringify(html)});const results=await owner.webContents.executeJavaScript('window.terminalInputCheck');for(const result of results)console.log('PASS: '+result);clearTimeout(timer);owner.destroy();app.quit()}).catch(error=>{console.error(error);if(owner&&!owner.isDestroyed())owner.destroy();app.exit(1)});`)
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
    process.exitCode = await new Promise((done, reject) => {
        const child = spawn(electronPath, [harness], { cwd: desktop, env, stdio: 'inherit', windowsHide: true, shell: false })
        child.once('error', reject); child.once('exit', code => done(code ?? 1))
    })
} finally {
    if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith('zyra-terminal-input-')) throw new Error('Unexpected terminal input cleanup path')
    await rm(directory, { recursive: true, force: true })
}
