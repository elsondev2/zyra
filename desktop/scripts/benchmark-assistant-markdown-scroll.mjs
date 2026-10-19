import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
import postcss from 'postcss'
import tailwind from 'tailwindcss'
import tailwindConfig from '../tailwind.config.js'

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const directory = await mkdtemp(join(os.tmpdir(), 'zyra-markdown-scroll-'))
const report = process.argv.find(argument => argument.endsWith('.json'))
try {
    const bundle = await build({ entryPoints: [join(desktop, 'scripts/fixtures/assistant-markdown-scroll.tsx')], bundle: true, write: false,
        outfile: join(directory, 'fixture.js'), format: 'iife', platform: 'browser', jsx: 'automatic', loader: { '.css': 'empty' },
        define: { 'process.env.NODE_ENV': '"production"', 'import.meta.hot': 'undefined', 'import.meta.env': '{}', '__ZYRA_DESKTOP_VERSION__': '"0.0.0-test"' },
        alias: { '@': join(desktop, 'src/renderer/src'), '@shared': join(desktop, 'src/shared') } })
    await writeFile(join(directory, 'fixture.js'), bundle.outputFiles.find(file => file.path.endsWith('.js')).text)
    const shell = await readFile(join(desktop, 'src/renderer/index.html'), 'utf8')
    const policy = shell.match(/<meta http-equiv="Content-Security-Policy"[\s\S]*?\/>/)?.[0]
    if (!policy) throw new Error('Real app CSP must be present')
    const stylesheet = postcss.parse(await readFile(join(desktop, 'src/renderer/src/index.css'), 'utf8'))
    stylesheet.walkAtRules('import', rule => rule.remove())
    const css = await postcss([tailwind({ ...tailwindConfig, content: [join(desktop, 'src/renderer/src/components/ui/**/*.tsx'), join(desktop, 'src/renderer/src/pages/assistant/AssistantVirtualTimeline.tsx')] })]).process(stylesheet.toString(), { from: join(desktop, 'src/renderer/src/index.css') })
    await writeFile(join(directory, 'fixture.css'), css.css)
    await writeFile(join(directory, 'tokens.css'), await readFile(join(desktop, 'src/renderer/src/styles/theme-tokens.css'), 'utf8'))
    await writeFile(join(directory, 'index.html'), `<!doctype html><html><head>${policy}<link rel="stylesheet" href="tokens.css"><link rel="stylesheet" href="fixture.css"><style>
        html,body,#root{height:100%;margin:0}body{font:14px system-ui;background:#101318;color:#eef1f6}
        .h-full{height:100%}.w-full{width:100%}.relative{position:relative}.absolute{position:absolute}.inset-0{inset:0}.pb-4{padding-bottom:16px}
        .markdown-body{max-width:760px;margin:auto}
        </style></head><body><div id="root"></div><script src="./fixture.js"></script></body></html>`)
    await writeFile(join(directory, 'run.cjs'), `
        const {app,BrowserWindow}=require('electron');const fs=require('node:fs');
        app.setPath('userData',${JSON.stringify(join(directory, 'profile'))});
        const timer=setTimeout(()=>{console.error('Markdown scroll fixture timed out');app.exit(1)},25000);
        app.whenReady().then(async()=>{
            const window=new BrowserWindow({show:false,width:1000,height:800,webPreferences:{backgroundThrottling:false,offscreen:true,sandbox:true,contextIsolation:true,nodeIntegration:false}});
            await window.loadFile(${JSON.stringify(join(directory, 'index.html'))}, {hash:${JSON.stringify(process.argv.includes('--no-idle') ? 'no-idle' : '')}});
            const result=await window.webContents.executeJavaScript('window.assistantMarkdownScrollCheck');
            result.environment={electron:process.versions.electron,chromium:process.versions.chrome,hiddenWindow:true,productionReact:true,noIdleCallback:${process.argv.includes('--no-idle')}};
            fs.writeFileSync(${JSON.stringify(join(directory, 'report.json'))},JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
            clearTimeout(timer);window.destroy();app.quit();
        }).catch(error=>{console.error(error);clearTimeout(timer);app.exit(1)});
    `)
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
    const useVirtualDisplay = process.platform === 'linux' && Boolean(process.env.CI) && !process.env.DISPLAY
    const args = [...(process.platform === 'linux' && process.env.CI ? ['--no-sandbox'] : []), join(directory, 'run.cjs')]
    const code = await new Promise((done, reject) => {
        const child = spawn(useVirtualDisplay ? 'xvfb-run' : electronPath, useVirtualDisplay ? ['--auto-servernum', electronPath, ...args] : args,
            { cwd: desktop, env, stdio: 'inherit', windowsHide: true })
        child.once('error', reject); child.once('exit', value => done(value ?? 1))
    })
    if (code !== 0) throw new Error(`Markdown scroll fixture exited ${code}`)
    const result = JSON.parse(await readFile(join(directory, 'report.json'), 'utf8'))
    if (process.argv.includes('--verify')) {
        if (result.highlightsWhileScrollBusy > 0) throw new Error('Scheduled cold highlighting ran while chat scrolling was busy')
        if (result.coldMount.synchronousHighlights !== 0) throw new Error('Completed messages synchronously highlighted cold code')
        if (Math.abs(result.coldMount.plainHeight - result.coldMount.highlightedHeight) > 1) throw new Error('Deferred highlighting changed code block height')
        console.log('PASS: no cold highlighting during scrolling; idle highlighting, stable height, selection and copy verified')
    }
    if (report) { await mkdir(dirname(resolve(report)), { recursive: true }); await writeFile(resolve(report), await readFile(join(directory, 'report.json'))) }
} finally { await rm(directory, { recursive: true, force: true }) }
