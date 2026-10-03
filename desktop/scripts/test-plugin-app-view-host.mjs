import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temporary = await mkdtemp(join(tmpdir(), 'zyra-app-view-'))
try {
    const view = await build({ entryPoints: [join(desktop, 'scripts/fixtures/plugin-app-view-test-view.ts')], bundle: true, minify: true, write: false, format: 'iife', platform: 'browser' })
    const host = await build({ entryPoints: [join(desktop, 'scripts/fixtures/plugin-app-view-test-host.ts')], bundle: true, write: false, format: 'iife', platform: 'browser', define: { __TEST_VIEW_SCRIPT__: JSON.stringify(view.outputFiles[0].text) } })
    await cp(join(desktop, 'src/renderer/mcp-app-sandbox.html'), join(temporary, 'mcp-app-sandbox.html'))
    await writeFile(join(temporary, 'fixture.js'), host.outputFiles[0].text)
    await writeFile(join(temporary, 'index.html'), `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; frame-src 'self' file:; style-src 'unsafe-inline'"></head><body><script src="./fixture.js"></script></body></html>`)
    const env = { ...process.env, ZYRA_APP_VIEW_TEST_DIR: temporary }
    delete env.ELECTRON_RUN_AS_NODE
    process.exitCode = await new Promise((done, reject) => {
        const child = spawn(electronPath, [join(desktop, 'scripts/fixtures/plugin-app-view-test-electron.cjs')], { cwd: desktop, env, stdio: 'inherit', windowsHide: true })
        child.once('error', reject)
        child.once('exit', (code) => done(code ?? 1))
    })
} finally { await rm(temporary, { recursive: true, force: true }) }
