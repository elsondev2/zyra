import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
import postcss from 'postcss'
import tailwind from 'tailwindcss'
import config from '../tailwind.config.js'
import { visualizationFrameDocument } from './maint/visualization-frame-document.mjs'

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temporary = await mkdtemp(join(tmpdir(), 'zyra-resource-review-'))
const screenshots = resolve(desktop, '../output/visualization-resources-review')
let server
try {
    await build({ plugins: [{ name: 'unrelated-attachment-modal', setup(build) {
        // Resource details are real; the unrelated image attachment modal is
        // closed throughout this fixture. Avoid bundling its Monaco editor.
        build.onResolve({ filter: /AssistantAttachmentPreviewModal$/ }, () => ({ path: 'attachment-modal', namespace: 'unrelated-attachment-modal' }))
        build.onLoad({ filter: /.*/, namespace: 'unrelated-attachment-modal' }, () => ({ contents: 'export default function AttachmentModal(){ return null }', loader: 'js' }))
    } }, { name: 'unrelated-editor-workers', setup(build) {
        build.onResolve({ filter: /\?worker$/ }, args => ({ path: args.path, namespace: 'unrelated-worker' }))
        build.onLoad({ filter: /.*/, namespace: 'unrelated-worker' }, () => ({ contents: 'export default class Worker { constructor() { throw new Error("Monaco workers are outside this visualization fixture"); } }', loader: 'js' }))
    } }], entryPoints: [join(desktop, 'scripts/fixtures/visualization-resources-review.tsx')], outdir: temporary, bundle: true, splitting: true, write: true, format: 'esm', platform: 'browser', jsx: 'automatic', loader: { '.woff2': 'dataurl', '.woff': 'dataurl', '.ttf': 'dataurl', '.png': 'dataurl' }, define: { 'import.meta.hot': 'undefined', 'import.meta.env': '{}', '__ZYRA_DESKTOP_VERSION__': '"0.0.0-test"' }, alias: { '@': join(desktop, 'src/renderer/src'), '@shared': join(desktop, 'src/shared') } })
    console.log('Resource fixture bundled; starting isolated rendering check')
    const shell = await readFile(join(desktop, 'src/renderer/index.html'), 'utf8')
    const policy = shell.match(/<meta http-equiv="Content-Security-Policy"[\s\S]*?\/>/)?.[0]
    if (!policy) throw new Error('Missing actual renderer CSP')
    const css = await postcss([tailwind({ ...config, content: [join(desktop, 'src/renderer/src/components/ui/visualization*/**/*.tsx'), join(desktop, 'src/renderer/src/pages/assistant/AssistantResources*.tsx'), join(desktop, 'scripts/fixtures/visualization-resources-review.tsx')] })]).process('@tailwind base; @tailwind utilities;', { from: undefined })
    await writeFile(join(temporary, 'visualization-frame.html'), visualizationFrameDocument())
    await writeFile(join(temporary, 'index.html'), `<!doctype html><html><head>${policy}<style>${css.css}\n:root{--color-bg:#101318;--color-card:#181c22;--color-text:#eef1f6;--color-text-secondary:#c3cad5;--color-text-muted:#a8b0bd;--accent-primary:#a58aff;--surface-divider:#343b46;--surface-hover:#2b323d;--surface-active:#25213a;--settings-text-muted:#a8b0bd}body{margin:0;background:var(--color-bg);color:var(--color-text);font:14px system-ui}.text-sparkle-text{color:var(--color-text)}.text-sparkle-text-muted{color:var(--color-text-muted)}.text-sparkle-text-secondary{color:var(--color-text-secondary)}button:disabled{opacity:.4}button:focus-visible,select:focus-visible{outline:2px solid var(--accent-primary)}</style></head><body><div id="root"></div><script type="module" src="./visualization-resources-review.js"></script></body></html>`)
    if (process.argv.includes('--serve')) {
        server = createServer(async (request, response) => {
            const pathname = new URL(request.url || '/', 'http://localhost').pathname
            if (pathname === '/fixture-error' && request.method === 'POST') {
                let body = ''; for await (const chunk of request) body += chunk.toString(); console.error('Browser fixture error:', body); response.end('recorded'); return
            }
            if (!/^\/[a-zA-Z0-9_.-]*$/.test(pathname)) { response.writeHead(404).end(); return }
            try {
                const target = pathname === '/' ? 'index.html' : pathname.slice(1)
                const body = await readFile(join(temporary, target))
                response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' })[extname(target)] || 'application/octet-stream')
                response.end(body)
            } catch { response.writeHead(404).end() }
        })
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
        console.log(`Visualization resource review: http://127.0.0.1:${server.address().port}/`)
        await new Promise(resolve => { process.once('SIGTERM', resolve); process.once('SIGINT', resolve) })
    } else {
        await mkdir(screenshots, { recursive: true })
        const env = { ...process.env, ZYRA_RESOURCE_FIXTURE: temporary, ZYRA_RESOURCE_SCREENSHOTS: screenshots }
        delete env.ELECTRON_RUN_AS_NODE
        process.exitCode = await new Promise((done, reject) => {
            const child = spawn(electronPath, [join(desktop, 'scripts/fixtures/visualization-resources-electron.cjs')], { cwd: desktop, env, stdio: 'inherit', windowsHide: true })
            child.once('error', reject); child.once('exit', code => done(code ?? 1))
        })
    }
} finally { server?.close(); await rm(temporary, { recursive: true, force: true }) }
