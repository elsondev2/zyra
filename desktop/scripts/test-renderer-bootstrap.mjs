import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'

const main = new URL('../src/renderer/src/main.tsx', import.meta.url)
const snapshotIndex = process.argv.indexOf('--source-snapshot')
const source = await readFile(snapshotIndex < 0 ? main : process.argv[snapshotIndex + 1], 'utf8')
const modules = {
    react: 'export default {StrictMode:"strict",createElement:(...args)=>args}',
    'react-dom/client': 'export default {createRoot:()=>({render:()=>{const fixture=globalThis.__bootstrapFixture;fixture.renders++;fixture.apiAtRender=window.devscope;fixture.complete()}})}',
    './App': 'export default function App(){}',
    './components/layout/RendererErrorBoundary': 'export function RendererErrorBoundary(){}',
    './lib/browser-view-state': 'export function startBrowserViewStateTracking(){globalThis.__bootstrapFixture.stateTrackingStarts++}',
    './lib/browser-devscope-adapter': 'globalThis.__bootstrapFixture.adapterLoads++;export function installBrowserDevscopeAdapter(){if(!window.devscope)window.devscope=globalThis.__bootstrapFixture.browserApi}',
    css: ''
}
const bundle = await build({
    stdin: { contents: source, loader: 'tsx' }, bundle: true, write: false,
    platform: 'node', format: 'esm', jsx: 'transform', jsxFactory: 'React.createElement',
    plugins: [{ name: 'bootstrap-boundaries', setup(api) {
        api.onResolve({ filter: /.*/ }, input => {
            const path = input.path.endsWith('.css') ? 'css' : input.path
            if (!(path in modules)) throw Error(`Unexpected bootstrap dependency: ${input.path}`)
            return { path, namespace: 'bootstrap-fixture' }
        })
        api.onLoad({ filter: /.*/, namespace: 'bootstrap-fixture' }, input => ({ contents: modules[input.path], loader: 'js' }))
    } }]
})
const saved = { window: globalThis.window, document: globalThis.document, fixture: globalThis.__bootstrapFixture }
try {
    for (const mode of ['desktop', 'browser']) {
        const preloadApi = { source: 'preload' }
        const browserApi = { source: 'browser' }
        let complete
        const rendered = new Promise(resolve => { complete = resolve })
        const fixture = { adapterLoads: 0, renders: 0, stateTrackingStarts: 0, browserApi, complete }
        globalThis.__bootstrapFixture = fixture
        globalThis.window = mode === 'desktop' ? { devscope: preloadApi } : {}
        globalThis.document = { getElementById: () => ({ id: 'root' }) }
        let timer
        try {
            await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text + `\n// ${mode}`).toString('base64')}`)
            await Promise.race([rendered, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Renderer did not mount')), 1000) })])
        } finally { clearTimeout(timer) }
        assert.equal(fixture.renders, 1, `${mode}: the application mounts once`)
        assert.equal(fixture.stateTrackingStarts, 1, `${mode}: browser view tracking starts once`)
        assert.equal(fixture.apiAtRender, mode === 'desktop' ? preloadApi : browserApi, `${mode}: the correct API exists before mount`)
        assert.equal(fixture.adapterLoads, mode === 'desktop' ? 0 : 1, `${mode}: browser implementation loads only when needed`)
    }
    console.log('Renderer bootstrap passed: preload preserved without browser import; fallback installed before mount.')
} finally {
    for (const [key, value] of Object.entries({ window: saved.window, document: saved.document, __bootstrapFixture: saved.fixture })) {
        if (value === undefined) delete globalThis[key]
        else globalThis[key] = value
    }
}
