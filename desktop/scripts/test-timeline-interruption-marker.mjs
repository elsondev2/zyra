import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const directory = await mkdtemp(join(tmpdir(), 'zyra-timeline-marker-'))
const success = 'Timeline interruption marker: terminal placement, collapse/reopen, both modes and authoritative outcomes: ok'
try {
    await writeFile(join(directory, 'settings.ts'), 'export function useSettings(){ return { settings: { assistantAllowCollapseWhileWorking:false, assistantShowActionStats:false } } }');
    await build({
        entryPoints: [join(desktop, 'scripts/fixtures/timeline-interruption-marker.tsx')],
        outfile: join(directory, 'fixture.js'), bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic',
        alias: { '@/lib/settings': join(directory, 'settings.ts'), '@': join(desktop, 'src/renderer/src'), '@shared': join(desktop, 'src/shared') },
        define: { 'process.env.NODE_ENV': '"test"', 'import.meta.hot': 'undefined' }
    })
    await writeFile(join(directory, 'index.html'), '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'self\';script-src \'self\';style-src \'self\' \'unsafe-inline\'"></head><body><script src="./fixture.js"></script></body></html>')
    const main = join(directory, 'main.cjs')
    await writeFile(main, `const {app,BrowserWindow}=require('electron');
app.setPath('userData',${JSON.stringify(join(directory, 'profile'))});
let check;
const timeout=setTimeout(()=>{console.error('Timeline marker fixture deadline');app.exit(1)},12000);
app.whenReady().then(async()=>{
 const window=new BrowserWindow({show:false,width:900,height:650,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
 window.webContents.on('console-message',(_event,_level,message)=>{
  if(message.includes(${JSON.stringify(success)})){console.log(message);clearTimeout(timeout);clearInterval(check);app.exit(0)}
 });
 await window.loadFile(${JSON.stringify(join(directory, 'index.html'))});
 check=setInterval(async()=>{try{if(window.isDestroyed()||window.webContents.isDestroyed())return;const failure=await window.webContents.executeJavaScript('globalThis.__testFailed || null');if(failure){console.error(failure);clearInterval(check);clearTimeout(timeout);app.exit(1)}}catch{}},200);
}).catch(error=>{console.error(error);app.exit(1)});`)
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    const ciLinux = process.platform === 'linux' && Boolean(process.env.CI)
    const virtual = ciLinux && !process.env.DISPLAY
    const args = [...(ciLinux ? ['--no-sandbox'] : []), main]
    process.exitCode = await new Promise((done, reject) => {
        const child = spawn(virtual ? 'xvfb-run' : electronPath, virtual ? ['--auto-servernum', electronPath, ...args] : args, { cwd: desktop, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
        let passed = false
        const watchdog = setTimeout(() => child.kill(), 18000)
        child.stdout.on('data', value => { const text = String(value); passed ||= text.includes(success); process.stdout.write(value) })
        child.stderr.on('data', value => process.stderr.write(value))
        child.once('error', error => { clearTimeout(watchdog); reject(error) })
        child.once('exit', code => { clearTimeout(watchdog); done(code === 0 && passed ? 0 : code || 1) })
    })
} finally {
    await rm(directory, { recursive: true, force: true, maxRetries: 12, retryDelay: 100 })
}
