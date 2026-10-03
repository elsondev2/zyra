import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
import postcss from 'postcss'
import tailwindcss from 'tailwindcss'
import config from '../tailwind.config.js'

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const directory = await mkdtemp(join(tmpdir(), 'zyra-project-catalog-'))
try {
    const bundle = await build({
        entryPoints: [join(desktop, 'scripts/fixtures/project-settings-catalog.tsx')], bundle: true, write: false,
        format: 'iife', jsx: 'automatic', platform: 'browser', define: { 'import.meta.hot': 'undefined' },
        alias: { '@': join(desktop, 'src/renderer/src'), '@shared': join(desktop, 'src/shared') },
        // The catalog itself and its actions are real. Synthetic folder artwork
        // avoids metadata IPC, user settings and remote logo requests in this test.
        plugins: [{ name: 'catalog-fixture-boundaries', setup(builder) {
            builder.onResolve({ filter: /AssistantProjectIcon$/ }, () => ({ path: 'project-icon', namespace: 'fixture' }))
            // Tab hover preloading owns the whole Settings route graph. This
            // isolated catalog test does not navigate or preload other pages.
            builder.onResolve({ filter: /settings-route-loaders$/ }, () => ({ path: 'route-preload', namespace: 'fixture' }))
            builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
                contents: path === 'route-preload' ? 'export function preloadSettingsRoute(){}'
                    : 'import {Folder} from "lucide-react"; export function AssistantProjectIcon({size}){return <Folder size={size} strokeWidth={1.5} className="text-[var(--settings-text-secondary)]"/>}',
                loader: 'jsx', resolveDir: desktop
            }))
        } }]
    })
    const indexCss = (await readFile(join(desktop, 'src/renderer/src/index.css'), 'utf8')).replace(/^@import[^\n]+\n/gm, '')
    const tokens = await readFile(join(desktop, 'src/renderer/src/styles/theme-tokens.css'), 'utf8')
    const css = await postcss([tailwindcss({ ...config, content: [
        join(desktop, 'src/renderer/src/pages/settings/*.{ts,tsx}'),
        join(desktop, 'src/renderer/src/components/ui/FileActionsMenu*.tsx'),
        join(desktop, 'scripts/fixtures/project-settings-catalog.tsx')
    ] })]).process(`${tokens}\n${indexCss}`, { from: undefined })
    const html = join(directory, 'index.html')
    await writeFile(html, `<!doctype html><head><style>${css.css}:root{--font-ui:Segoe UI;--color-bg:#0e1419;--color-card:#151c22;--color-text:#e4e8ea;--color-text-secondary:#9ba5ac;--color-text-muted:#75818a;--accent-primary:#f39b48}html,body{height:100%}</style></head><body><script>${bundle.outputFiles[0].text}</script>`)
    const capture = process.argv.includes('--capture') ? join(desktop, '../docs.local/project-catalog') : null
    if (capture) await mkdir(capture, { recursive: true })
    const harness = join(directory, 'run.cjs')
    await writeFile(harness, `const {app,BrowserWindow,session}=require('electron');const fs=require('node:fs/promises');app.setPath('userData',${JSON.stringify(join(directory, 'profile'))});let owner;const timer=setTimeout(()=>{console.error('Project catalog rendering timed out');app.exit(1)},25000);app.whenReady().then(async()=>{session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_,done)=>done({cancel:true}));owner=new BrowserWindow({show:false,width:1172,height:856,webPreferences:{backgroundThrottling:false,offscreen:true,sandbox:true,contextIsolation:true,nodeIntegration:false}});await owner.loadFile(${JSON.stringify(html)});for(const result of await owner.webContents.executeJavaScript('window.catalogCheck'))console.log('PASS: '+result);${capture ? `await fs.writeFile(${JSON.stringify(join(capture, 'wide.png'))},(await owner.webContents.capturePage()).toPNG());` : ''}owner.setContentSize(380,640);for(const result of await owner.webContents.executeJavaScript('window.catalogNarrowCheck()'))console.log('PASS: '+result);${capture ? `await fs.writeFile(${JSON.stringify(join(capture, 'narrow.png'))},(await owner.webContents.capturePage()).toPNG());` : ''}clearTimeout(timer);owner.destroy();app.quit()}).catch(error=>{console.error(error);if(owner&&!owner.isDestroyed())owner.destroy();app.exit(1)});`)
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
    const virtual = process.platform === 'linux' && Boolean(process.env.CI) && !process.env.DISPLAY
    const args = [...(process.platform === 'linux' && process.env.CI ? ['--no-sandbox'] : []), harness]
    process.exitCode = await new Promise((done, reject) => {
        const child = spawn(virtual ? 'xvfb-run' : electronPath, virtual ? ['--auto-servernum', electronPath, ...args] : args,
            { cwd: desktop, env, stdio: 'inherit', windowsHide: true, shell: false })
        child.once('error', reject); child.once('exit', code => done(code ?? 1))
    })
} finally {
    if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith('zyra-project-catalog-')) throw new Error('Unexpected catalog fixture cleanup path')
    await rm(directory, { recursive: true, force: true })
}
