import { build } from 'esbuild'
import postcss from 'postcss'
import tailwindcss from 'tailwindcss'
import tailwindConfig from '../tailwind.config.js'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const directory = await mkdtemp(join(tmpdir(), 'zyra-action-batch-scroll-'))
const screenshot = process.env.ZYRA_ACTION_BATCH_SCREENSHOT ? resolve(process.env.ZYRA_ACTION_BATCH_SCREENSHOT) : null
try {
    console.log('Action batch fixture: bundling the affected component')
    await writeFile(join(directory, 'settings.ts'), 'export function useSettings(){return {settings:{assistantShowActionStats:false}}}')
    await build({
        entryPoints: [join(desktop, 'scripts/fixtures/action-batch-scroll.tsx')],
        outfile: join(directory, 'fixture.js'), bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic',
        alias: { '@/lib/settings': join(directory, 'settings.ts'), '@': join(desktop, 'src/renderer/src'), '@shared': join(desktop, 'src/shared') },
        define: { 'process.env.NODE_ENV': '"test"', 'import.meta.hot': 'undefined' }
    })
    console.log('Action batch fixture: generating scoped styles')
    const styles = await postcss([tailwindcss({ ...tailwindConfig, content: [
        join(desktop, 'src/renderer/src/pages/assistant/AssistantTimelineActionBatch.tsx'),
        join(desktop, 'src/renderer/src/pages/assistant/assistant-action-row-layout.ts'),
        join(desktop, 'src/renderer/src/pages/assistant/AssistantTimelineActionShell.tsx'),
        join(desktop, 'src/renderer/src/pages/assistant/AssistantActionBatchScroll.tsx'),
        join(desktop, 'src/renderer/src/pages/assistant/AssistantInlineDiffStats.tsx'),
        join(desktop, 'src/renderer/src/components/ui/AnimatedHeight.tsx')
    ] })]).process('@tailwind base;@tailwind utilities;', { from: undefined })
    const scrollStyles = postcss.root()
    postcss.parse(await readFile(join(desktop, 'src/renderer/src/index.css'), 'utf8')).walkRules(rule => {
        if (rule.selector.startsWith('.project-surface-scrollbar')) scrollStyles.append(rule.clone())
    })
    await writeFile(join(directory, 'fixture.css'), `${styles.css}\n${scrollStyles.toString()}\n:root{--color-bg:#0e1418;--color-text:#dadbd7;--color-text-secondary:#a3a5a0;--color-text-muted:#777d7a;--surface-divider:#293237;--surface-hover:#ffffff08;--status-success:#60b98b;--status-danger:#dc6e72;--status-warning:#deb773;--theme-foreground-rgb:218 219 215;--theme-background-rgb:14 20 24}body{margin:0;background:var(--color-bg);color:var(--color-text);font-family:Arial,sans-serif}`)
    await writeFile(join(directory, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="fixture.css"></head><body><script src="fixture.js"></script></body></html>')
    if (screenshot) await mkdir(dirname(screenshot), { recursive: true })
    await writeFile(join(directory, 'main.cjs'), `const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');app.setPath('userData',${JSON.stringify(join(directory, 'profile'))});
const deadline=setTimeout(()=>{console.error('Action batch fixture timed out');app.exit(1)},15000);
app.whenReady().then(async()=>{
 const window=new BrowserWindow({show:false,width:1000,height:800,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,offscreen:true}});
 await window.loadFile(${JSON.stringify(join(directory, 'index.html'))});
 const poll=setInterval(async()=>{try{
  const state=await window.webContents.executeJavaScript('({ready:globalThis.__actionBatchReady===true,error:globalThis.__testFailed||null})');
  if(state.error){clearInterval(poll);clearTimeout(deadline);console.error(state.error);app.exit(1)}
  if(state.ready){clearInterval(poll);clearTimeout(deadline);
   ${screenshot ? `fs.writeFileSync(${JSON.stringify(screenshot)},(await window.webContents.capturePage()).toPNG());` : ''}
   console.log('Action batch scroll: bounded full list, aligned rows, rolling totals, reduced motion, directional fades and live growth: ok');app.exit(0)
  }
 }catch(error){clearInterval(poll);console.error(error);app.exit(1)}},100);
}).catch(error=>{console.error(error);app.exit(1)});`)
    console.log('Action batch fixture: checking real layout in isolated Electron')
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    const ciLinux = process.platform === 'linux' && Boolean(process.env.CI)
    const virtual = ciLinux && !process.env.DISPLAY
    const args = [...(ciLinux ? ['--no-sandbox'] : []), join(directory, 'main.cjs')]
    process.exitCode = await new Promise((done, reject) => {
        const child = spawn(virtual ? 'xvfb-run' : electronPath, virtual ? ['--auto-servernum', electronPath, ...args] : args, { cwd: desktop, env, stdio: 'inherit', windowsHide: true })
        const watchdog = setTimeout(() => child.kill(), 20000)
        child.once('error', error => { clearTimeout(watchdog); reject(error) })
        child.once('exit', code => { clearTimeout(watchdog); done(code ?? 1) })
    })
} finally {
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
}
