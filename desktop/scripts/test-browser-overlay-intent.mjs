import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import electronPath from 'electron'

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const workspace = await readFile(join(desktop, 'src/renderer/src/pages/assistant/AssistantBrowserWorkspace.tsx'), 'utf8')
assert.match(workspace, /browserOverlayScope = JSON\.stringify\(\[workspaceKey, activeTab\?\.id, activeTab\?\.url\]\)/)
assert.match(workspace, /profileMenuIntent = usePreparedBrowserOverlay\(\{\s*scopeKey: browserOverlayScope,\s*active,/)
assert.match(workspace, /profileMenuIntent\.toggle\(\)/)
assert.match(workspace, /<AssistantBrowserDownloadsButton\s+api=\{browserDownloadsApi\}\s+active=\{active\}\s+scopeKey=\{browserOverlayScope\}/)
assert.doesNotMatch(workspace, /prepareActiveBrowserOverlay\(\)\.then\(\(\) => setProfileMenuOpen\(true\)\)/)
const directory = await mkdtemp(join(tmpdir(), 'zyra-overlay-intent-'))
try {
    const stubs = {
        '@/components/ui/ConfirmModal': 'export const ConfirmModal=()=>null',
        '@/components/ui/FileEntryIcon': 'export const FileEntryIcon=()=>null',
        '@/components/ui/file-preview/utils': 'export const resolvePreviewType=()=>null',
        '@/lib/use-theme-revision': 'export const useThemeRevision=()=>0'
    }
    const bundle = await build({
        entryPoints: [join(desktop, 'scripts/fixtures/browser-overlay-intent.tsx')], bundle: true, write: false, format: 'iife', jsx: 'automatic', platform: 'browser',
        plugins: [{ name: 'overlay-leaf-fixtures', setup(build) {
            build.onResolve({ filter: /^@\// }, args => stubs[args.path] ? { path: args.path, namespace: 'fixture' } : { path: join(desktop, 'src/renderer/src', args.path.slice(2) + '.ts') })
            build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'js' }))
        } }]
    })
    const html = join(directory, 'index.html')
    await writeFile(html, `<!doctype html><body><script>${bundle.outputFiles[0].text}</script>`)
    const harness = join(directory, 'run.cjs')
    await writeFile(harness, `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(directory, 'profile'))});const timer=setTimeout(()=>app.exit(1),15000);app.whenReady().then(async()=>{const owner=new BrowserWindow({show:false,webPreferences:{backgroundThrottling:false,offscreen:true,sandbox:true,contextIsolation:true,nodeIntegration:false}});await owner.loadFile(${JSON.stringify(html)});const results=await owner.webContents.executeJavaScript('window.browserOverlayIntentCheck');for(const result of results)console.log('PASS: '+result);clearTimeout(timer);owner.destroy();app.quit()}).catch(error=>{console.error(error);app.exit(1)});`)
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
    const virtual = process.platform === 'linux' && Boolean(process.env.CI) && !process.env.DISPLAY
    const args = [...(process.platform === 'linux' && process.env.CI ? ['--no-sandbox'] : []), harness]
    process.exitCode = await new Promise((done, reject) => {
        const child = spawn(virtual ? 'xvfb-run' : electronPath, virtual ? ['--auto-servernum', electronPath, ...args] : args, { cwd: desktop, env, stdio: 'inherit', windowsHide: true, shell: false })
        child.once('error', reject); child.once('exit', code => done(code ?? 1))
    })
} finally {
    if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith('zyra-overlay-intent-')) throw new Error('Unexpected overlay intent cleanup path')
    await rm(directory, { recursive: true, force: true })
}
