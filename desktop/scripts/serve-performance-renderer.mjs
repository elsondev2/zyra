import { createServer, loadConfigFromFile } from 'vite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, readFileSync } from 'node:fs'

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const portIndex = process.argv.indexOf('--port')
const port = portIndex < 0 ? 5187 : Number(process.argv[portIndex + 1])
const cacheIndex = process.argv.indexOf('--cache-dir')
const cacheDir = cacheIndex < 0 ? undefined : resolve(process.argv[cacheIndex + 1])
const baselineIndex = process.argv.indexOf('--baseline-source-dir')
const baselineDir = baselineIndex < 0 ? undefined : resolve(process.argv[baselineIndex + 1])
const workspace = resolve(desktop, '..')
const baselineSource = id => {
    if (!baselineDir) return undefined
    const path = id.split('?')[0].replaceAll('\\', '/')
    const root = workspace.replaceAll('\\', '/') + '/'
    if (!path.startsWith(root)) return undefined
    const saved = resolve(baselineDir, path.slice(root.length))
    return existsSync(saved) ? readFileSync(saved, 'utf8') : undefined
}
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid benchmark renderer port')
const loaded = await loadConfigFromFile({ command: 'serve', mode: 'development' }, resolve(desktop, 'electron.vite.config.ts'))
if (!loaded?.config.renderer) throw Error('Desktop renderer configuration is missing')
const renderer = loaded.config.renderer
const server = await createServer({ ...renderer, ...(cacheDir ? { cacheDir } : {}), plugins: [
    ...(baselineDir ? [{ name: 'benchmark-before-source', enforce: 'pre', load: baselineSource }] : []),
    ...(renderer.plugins || [])
], optimizeDeps: { ...renderer.optimizeDeps, esbuildOptions: { ...renderer.optimizeDeps?.esbuildOptions, plugins: [
    ...(renderer.optimizeDeps?.esbuildOptions?.plugins || []),
    ...(baselineDir ? [{ name: 'benchmark-before-source', setup(build) { build.onLoad({ filter: /\.[jt]sx?$/ }, ({ path }) => { const contents = baselineSource(path); return contents === undefined ? undefined : { contents, loader: path.endsWith('.tsx') ? 'tsx' : path.endsWith('.ts') ? 'ts' : path.endsWith('.jsx') ? 'jsx' : 'js' } }) } }] : [])
] } }, configFile: false, server: { ...renderer.server, port, strictPort: true, hmr: { clientPort: port } } })
await server.listen()
server.printUrls()
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await server.close(); process.exit(0) })
