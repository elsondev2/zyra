import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const directory = await mkdtemp(join(tmpdir(), 'zyra-accessory-browser-native-'))

async function removeTemporaryDirectory(path) {
    let lastError
    for (let attempt = 0; attempt < 24; attempt += 1) {
        try {
            await rm(path, { recursive: true, force: true })
            return
        } catch (error) {
            lastError = error
            await new Promise(resolveDelay => setTimeout(resolveDelay, 250))
        }
    }
    throw lastError
}
try {
    const main = join(directory, 'main.cjs')
    await build({
        entryPoints: [join(desktop, 'scripts/fixtures/accessory-browser-native-main.ts')],
        outfile: main,
        bundle: true,
        platform: 'node',
        format: 'cjs',
        external: ['electron', 'better-sqlite3', 'node-pty'],
        plugins: [{
            name: 'isolate-browser-session-services',
            setup(context) {
                context.onResolve({ filter: /browser-preview-handlers$/ }, () => ({
                    path: join(desktop, 'scripts/fixtures/accessory-browser-native-services.ts')
                }))
            }
        }]
    })
    const preload = join(directory, 'preload.cjs')
    await writeFile(preload, `const { contextBridge, ipcRenderer } = require('electron');
const ACCESSORIES={
 getState:'devscope:accessories:getState',
 acknowledge:'devscope:accessories:acknowledge',
 syncBrowserTabs:'devscope:accessories:syncBrowserTabs',
 registerBrowserDropZone:'devscope:accessories:registerBrowserDropZone',
 beginBrowserTabTearOff:'devscope:accessories:beginBrowserTabTearOff',
 finishBrowserTabTearOff:'devscope:accessories:finishBrowserTabTearOff',
 cancelBrowserTabTearOff:'devscope:accessories:cancelBrowserTabTearOff'
};
const BROWSER={ensure:'devscope:browserView:ensure',close:'devscope:browserView:close',report:'devscope:browserView:reportSlot'};
contextBridge.exposeInMainWorld('accessoryNative',{
 getState:()=>ipcRenderer.invoke(ACCESSORIES.getState),
 acknowledge:id=>ipcRenderer.invoke(ACCESSORIES.acknowledge,id),
 syncBrowserTabs:input=>ipcRenderer.invoke(ACCESSORIES.syncBrowserTabs,input),
 registerBrowserDropZone:input=>ipcRenderer.invoke(ACCESSORIES.registerBrowserDropZone,input),
 beginBrowserTabTearOff:input=>ipcRenderer.invoke(ACCESSORIES.beginBrowserTabTearOff,input),
 finishBrowserTabTearOff:input=>ipcRenderer.invoke(ACCESSORIES.finishBrowserTabTearOff,input),
 cancelBrowserTabTearOff:id=>ipcRenderer.invoke(ACCESSORIES.cancelBrowserTabTearOff,id),
 ensure:input=>ipcRenderer.invoke(BROWSER.ensure,input),
 close:id=>ipcRenderer.invoke(BROWSER.close,id),
 report:input=>ipcRenderer.send(BROWSER.report,input)
});`)
    const html = join(directory, 'index.html')
    await writeFile(html, '<!doctype html><html><body><main id="slot">Accessory Browser test shell</main></body></html>')
    const env = {
        ...process.env,
        ZYRA_ACCESSORY_NATIVE_PROFILE: join(directory, 'profile'),
        ZYRA_ACCESSORY_NATIVE_HTML: html,
        ZYRA_ACCESSORY_NATIVE_PRELOAD: preload
    }
    delete env.ELECTRON_RUN_AS_NODE
    const virtual = process.platform === 'linux' && Boolean(process.env.CI) && !process.env.DISPLAY
    const args = [...(process.platform === 'linux' && process.env.CI ? ['--no-sandbox'] : []), main]
    process.exitCode = await new Promise((done, reject) => {
        const child = spawn(virtual ? 'xvfb-run' : electronPath, virtual ? ['--auto-servernum', electronPath, ...args] : args, {
            cwd: desktop,
            env,
            stdio: ['ignore', 'pipe', 'inherit'],
            windowsHide: true,
            shell: false
        })
        let passed = false
        const watchdog = setTimeout(() => { console.error('Accessory native child exceeded its deadline'); child.kill() }, 35_000)
        child.stdout?.on('data', chunk => {
            const text = String(chunk)
            process.stdout.write(text)
            if (!passed && text.includes('Accessory Browser native tear-off, rollback, ownership, state, and session isolation: ok')) {
                passed = true
                child.kill()
            }
        })
        child.once('error', error => { clearTimeout(watchdog); reject(error) })
        child.once('exit', (code) => { clearTimeout(watchdog); done(passed ? 0 : code ?? 1) })
    })
} finally {
    if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith('zyra-accessory-browser-native-')) {
        throw new Error('Unexpected Accessory Browser native test cleanup path')
    }
    await removeTemporaryDirectory(directory)
}
