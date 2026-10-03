import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
import postcss from 'postcss'
import tailwindcss from 'tailwindcss'
import config from '../tailwind.config.js'

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const directory = await mkdtemp(join(tmpdir(), 'zyra-inspector-updates-'))
try {
    const bundle = await build({ entryPoints: [join(desktop, 'scripts/fixtures/inspector-titlebar-updates.tsx')], bundle: true, write: false, format: 'iife', jsx: 'automatic', platform: 'browser', loader: { '.svg': 'dataurl', '.css': 'empty' }, define: { 'import.meta.hot': 'undefined' }, alias: { '@': join(desktop, 'src/renderer/src'), '@shared': join(desktop, 'src/shared') }, plugins: [{ name: 'fixture-settings', setup(builder) {
        // Reproduce the previous portal leak without reverting the user's live renderer.
        if (process.argv.includes('--reproduce-background-overlay')) builder.onLoad({ filter: /native-overlay-portal\.tsx$/ }, async args => ({
            contents: (await readFile(args.path, 'utf8')).replace('const visible = useContext(NativeOverlayVisibility)', 'const visible = true'),
            loader: 'tsx', resolveDir: dirname(args.path)
        }))
        builder.onResolve({ filter: /(?:^|\/)settings$/ }, () => ({ path: 'settings', namespace: 'fixture' }))
        builder.onResolve({ filter: /AssistantBrowserWebview$/ }, () => ({ path: 'webview', namespace: 'fixture' }))
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'settings' ? 'const settings={accessibilityReduceMotion:false,keyboardShortcuts:{}}; export function useSettings(){return {settings}}' : 'export function AssistantBrowserWebview(){return null}', loader: 'js' }))
    } }] })
    const css = await postcss([tailwindcss({ ...config, content: [join(desktop, 'src/renderer/src/pages/assistant/AssistantInspectorSidebar.tsx'), join(desktop, 'src/renderer/src/components/ui/FileActionsMenu.tsx')] })]).process('@tailwind base; @tailwind components; @tailwind utilities;', { from: undefined })
    const html = join(directory, 'index.html')
    await writeFile(html, `<!doctype html><style>${css.css}</style><div id="root"></div><script>${bundle.outputFiles[0].text}</script>`)
    const harness = join(directory, 'run.cjs')
    await writeFile(harness, `const{app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(directory, 'profile'))});let owner;const timer=setTimeout(()=>{console.error('Inspector check timed out');app.exit(1)},20000);app.whenReady().then(async()=>{owner=new BrowserWindow({show:false,width:1300,height:700,webPreferences:{backgroundThrottling:false,offscreen:true,sandbox:true,contextIsolation:true,nodeIntegration:false}});owner.webContents.on('console-message',details=>{if(details.level==='error')console.error(details.message)});await owner.loadFile(${JSON.stringify(html)});const results=await owner.webContents.executeJavaScript('window.inspectorUpdateCheck');for(const result of results)console.log('PASS: '+result);clearTimeout(timer);owner.destroy();app.quit()}).catch(error=>{console.error(error);clearTimeout(timer);if(owner&&!owner.isDestroyed())owner.destroy();app.exit(1)});`)
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
    process.exitCode = await new Promise((done, reject) => {
        const child = spawn(electronPath, [harness], { cwd: desktop, env, stdio: 'inherit', windowsHide: true, shell: false })
        child.once('error', reject); child.once('exit', code => done(code ?? 1))
    })
} finally {
    if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith('zyra-inspector-updates-')) throw new Error('Unexpected inspector fixture cleanup path')
    await rm(directory, { recursive: true, force: true })
}
