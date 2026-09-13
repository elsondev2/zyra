import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const directory = await mkdtemp(join(tmpdir(), 'zyra-live-presentation-'))
try {
    await build({
        stdin: {
            contents: `export { createAssistantBrowserLivePresentation } from './assistant-browser-live-presentation'; export { requestAssistantBrowserDisplayCapture } from './assistant-browser-display-capture';`,
            resolveDir: join(desktop, 'src/renderer/src/pages/assistant'), loader: 'ts'
        },
        outfile: join(directory, 'presentation.js'), bundle: true, platform: 'browser', format: 'iife', globalName: 'BrowserLivePresentation'
    })
    await build({ entryPoints: [join(desktop, 'src/main/browser-recording-capture.ts')], outfile: join(directory, 'capture.cjs'), bundle: true, platform: 'node', format: 'cjs', external: ['electron'] })
    const env = { ...process.env, ZYRA_LIVE_PRESENTATION_SMOKE: directory }
    delete env.ELECTRON_RUN_AS_NODE
    const virtual = process.platform === 'linux' && Boolean(process.env.CI) && !process.env.DISPLAY
    const args = [...(process.platform === 'linux' && process.env.CI ? ['--no-sandbox'] : []), join(desktop, 'scripts/browser-live-presentation-smoke.cjs')]
    process.exitCode = await new Promise((done, reject) => {
        const child = spawn(virtual ? 'xvfb-run' : electronPath, virtual ? ['--auto-servernum', electronPath, ...args] : args, {
            cwd: desktop, env, stdio: 'inherit', windowsHide: true, shell: false
        })
        child.once('error', reject)
        child.once('exit', code => done(code ?? 1))
    })
} finally {
    if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith('zyra-live-presentation-')) throw new Error('Unexpected live presentation test cleanup path')
    await rm(directory, { recursive: true, force: true })
}
