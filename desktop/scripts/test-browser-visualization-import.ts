import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import browserConfig from '../vite.browser.config'

// Exercise the real browser dev import boundary without the live bridge plugin,
// dependency scanning, a browser window, or requests to any user/provider service.
const cacheDir = await mkdtemp(join(tmpdir(), 'zyra-browser-import-'))
console.log('[browser-import] creating isolated server')
const server = await createServer({
    ...browserConfig,
    configFile: false,
    cacheDir,
    plugins: [],
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { ...browserConfig.server, host: '127.0.0.1', port: 0, strictPort: false, hmr: false, watch: null, preTransformRequests: false }
})
try {
    console.log('[browser-import] listening')
    await server.listen()
    const address = server.httpServer!.address()
    assert(address && typeof address !== 'string')
    const origin = `http://127.0.0.1:${address.port}`
    console.log('[browser-import] requesting shared entry')
    const entry = await fetch(`${origin}/@fs/${new URL('../src/shared/visualization.ts', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')}`)
    assert.equal(entry.status, 200, 'browser shared visualization entry is served')
    const code = await entry.text()
    const imported = code.match(/from\s+["']([^"']*visualizations\/blocks\.mjs[^"']*)["']/)?.[1]
    assert(imported, 'browser entry imports the shared visualization parser')
    const parser = await fetch(new URL(imported, origin))
    assert.equal(parser.status, 200, 'browser dev server allows the actual shared parser import')
    assert((await parser.text()).includes('parseVisualizationBlocks'))
    console.log('Browser visualization parser import: passed with the existing browser configuration')
} finally { await server.close(); await rm(cacheDir, { recursive: true, force: true }) }
