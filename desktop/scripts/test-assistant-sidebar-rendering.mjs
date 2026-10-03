import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
import postcss from 'postcss'
import tailwindcss from 'tailwindcss'
import config from '../tailwind.config.js'

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const directory = await mkdtemp(join(tmpdir(), 'zyra-sidebar-rendering-'))
try {
    const bundle = await build({ entryPoints: [join(desktop, 'scripts/fixtures/assistant-sidebar-targets.tsx')], bundle: true, write: false, format: 'iife', jsx: 'automatic', platform: 'browser', define: { 'import.meta.hot': 'undefined' }, alias: { '@': join(desktop, 'src/renderer/src'), '@shared': join(desktop, 'src/shared') },
        // Local-file opening is exercised here. The unused inline fallback owns a
        // full Monaco editor; exclude that unrelated renderer from this fixture.
        plugins: [{ name: 'unused-inline-fallback', setup(builder) {
            builder.onResolve({ filter: /AssistantAttachmentPreviewModal$/ }, () => ({ path: 'inline-fallback', namespace: 'fixture' }))
            builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export default function InlineFallback(){return null}', loader: 'js' }))
        } }]
    })
    const css = await postcss([tailwindcss({ ...config, content: [join(desktop, 'src/renderer/src/**/*.{ts,tsx}'), join(desktop, 'scripts/fixtures/assistant-sidebar-targets.tsx')] })]).process('@tailwind base; @tailwind components; @tailwind utilities;', { from: undefined })
    const html = join(directory, 'index.html')
    await writeFile(html, `<!doctype html><head><style>${css.css} :root{--font-ui:Arial;--theme-foreground-rgb:230 230 240;--theme-background-rgb:15 20 26;--status-success-rgb:100 200 150;--status-danger-rgb:230 100 100;--status-warning-rgb:230 180 100;--color-bg:#0f141a;--color-card:#171e26;--color-text:#e8ebf0;--color-text-secondary:#b4bdc9;--color-text-muted:#758393;--accent-primary:#38bdf8;--surface-panel-divider:#ffffff15;--surface-hover:#ffffff10}body{background:var(--color-bg)}</style></head><body><script>${bundle.outputFiles[0].text}</script>`)
    const screenshot = process.argv.includes('--capture') ? join(desktop, '../docs.local/sidebar-navigation-check.png') : null
    if (screenshot) await mkdir(dirname(screenshot), { recursive: true })
    const harness = join(directory, 'run.cjs')
    await writeFile(harness, `const {app,BrowserWindow}=require('electron');const fs=require('node:fs/promises');app.setPath('userData',${JSON.stringify(join(directory, 'profile'))});let owner;const timer=setTimeout(()=>{console.error('Sidebar rendering timed out');app.exit(1)},20000);app.whenReady().then(async()=>{owner=new BrowserWindow({show:false,width:840,height:520,webPreferences:{backgroundThrottling:false,offscreen:true,sandbox:true,contextIsolation:true,nodeIntegration:false}});await owner.loadFile(${JSON.stringify(html)});const results=await owner.webContents.executeJavaScript('window.sidebarTargetCheck');for(const result of results)console.log('PASS: '+result);${screenshot ? `await fs.writeFile(${JSON.stringify(screenshot)},(await owner.webContents.capturePage()).toPNG());` : ''}clearTimeout(timer);owner.destroy();app.quit()}).catch(error=>{console.error(error);if(owner&&!owner.isDestroyed())owner.destroy();app.exit(1)});`)
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
    const virtual = process.platform === 'linux' && Boolean(process.env.CI) && !process.env.DISPLAY
    const args = [...(process.platform === 'linux' && process.env.CI ? ['--no-sandbox'] : []), harness]
    process.exitCode = await new Promise((done, reject) => {
        const child = spawn(virtual ? 'xvfb-run' : electronPath, virtual ? ['--auto-servernum', electronPath, ...args] : args, { cwd: desktop, env, stdio: 'inherit', windowsHide: true, shell: false })
        child.once('error', reject); child.once('exit', code => done(code ?? 1))
    })
} finally {
    if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith('zyra-sidebar-rendering-')) throw new Error('Unexpected sidebar rendering cleanup path')
    await rm(directory, { recursive: true, force: true })
}
