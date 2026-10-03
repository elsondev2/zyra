import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
import postcss from 'postcss'
import tailwindcss from 'tailwindcss'
import config from '../tailwind.config.js'

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const capturePath = process.argv[2] ? resolve(process.argv[2]) : null
const directory = await mkdtemp(join(tmpdir(), 'zyra-runtime-notice-'))
try {
    const bundle = await build({ entryPoints: [join(desktop, 'scripts/fixtures/runtime-notification.tsx')], bundle: true, write: false, format: 'iife', jsx: 'automatic', platform: 'browser', define: { 'import.meta.hot': 'undefined' }, alias: { '@': join(desktop, 'src/renderer/src'), '@shared': join(desktop, 'src/shared') } })
    const css = await postcss([tailwindcss({ ...config, content: [join(desktop, 'src/renderer/src/components/updates/RuntimeActivationNotice.tsx')] })]).process('@tailwind base; @tailwind components; @tailwind utilities;', { from: undefined })
    const html = join(directory, 'index.html')
    await writeFile(html, `<!doctype html><style>${css.css}:root{--status-success:rgb(70,190,130);--status-info:#8aaee8;--status-warning:rgb(230,170,60);--status-danger:rgb(230,90,100);--surface-divider:#ffffff20;--surface-floating:#181e25;--color-text:#ddd;--color-text-muted:#999}body{background:#0f141a;font-family:system-ui}</style><div id="root"></div><script>${bundle.outputFiles[0].text}</script>`)
    const harness = join(directory, 'run.cjs')
    await writeFile(harness, `const{app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(directory, 'profile'))});let owner;const timer=setTimeout(()=>{console.error('Runtime notification check timed out');app.exit(1)},15000);app.whenReady().then(async()=>{owner=new BrowserWindow({show:false,width:900,height:650,webPreferences:{backgroundThrottling:false,offscreen:true,sandbox:true,contextIsolation:true,nodeIntegration:false}});await owner.loadFile(${JSON.stringify(html)});const results=await owner.webContents.executeJavaScript('window.runtimeNotificationCheck');for(const result of results)console.log('PASS: '+result);const capture=${JSON.stringify(capturePath)};if(capture){await owner.webContents.executeJavaScript('window.runtimeNotificationPreview()');await require('node:fs/promises').writeFile(capture,(await owner.webContents.capturePage()).toPNG());console.log('Capture: '+capture)}clearTimeout(timer);owner.destroy();app.quit()}).catch(error=>{console.error(error);clearTimeout(timer);if(owner&&!owner.isDestroyed())owner.destroy();app.exit(1)});`)
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
    process.exitCode = await new Promise((done, reject) => { const child = spawn(electronPath, [harness], { cwd: desktop, env, stdio: 'inherit', windowsHide: true, shell: false }); child.once('error', reject); child.once('exit', code => done(code ?? 1)) })
} finally {
    if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith('zyra-runtime-notice-')) throw Error('Unexpected notification fixture cleanup path')
    await rm(directory, { recursive: true, force: true })
}
