import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
import postcss from 'postcss'
import tailwind from 'tailwindcss'
import config from '../tailwind.config.js'

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temporary = await mkdtemp(join(tmpdir(), 'zyra-background-panel-'))
const screenshotDirectory = process.argv[2] ? resolve(process.argv[2]) : null
try {
    const assetRoot = join(desktop, 'src/renderer/src/assets/browser-backgrounds')
    const manifest = JSON.parse(await readFile(join(assetRoot, 'manifest.json'), 'utf8'))
    const photos = await Promise.all(manifest.assets.slice(0, 8).map(async asset => ({
        ...asset, provider: 'built-in', imageUrl: '',
        thumbnailUrl: `data:image/webp;base64,${(await readFile(join(assetRoot, asset.thumbnail.file))).toString('base64')}`
    })))
    const bundle = await build({ stdin: { resolveDir: desktop, loader: 'tsx', contents: `
        import { useState } from 'react'
        import { createRoot } from 'react-dom/client'
        import { AssistantBrowserBackgroundPicker } from './src/renderer/src/pages/assistant/AssistantBrowserBackgroundPicker'
        function Fixture() {
            const [mode, setMode] = useState('built-in')
            const [category, setCategory] = useState('all')
            const [rotation, setRotation] = useState('every-tab')
            const [active, setActive] = useState(window.photos[0])
            const controller = {
                mode, setMode, category, setCategory, rotation, setRotation, activeBackground: active,
                selectBackground: setActive, changeBackground: () => setActive(window.photos[1]),
                visibleBackgrounds: mode === 'off' ? [] : window.photos.filter(p => category === 'all' || p.category === category),
                providerStatus: { unsplashConfigured: true }, loading: false, error: null,
                searchRemote: async query => { window.lastSearch = query },
                saveUnsplashAccessKey: async () => {}, removeUnsplashAccessKey: async () => {}
            }
            return <AssistantBrowserBackgroundPicker controller={controller} onClose={() => { window.closedCount++ }} />
        }
        window.closedCount = 0
        createRoot(document.querySelector('#browser')).render(<Fixture />)
    ` }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', alias: { '@': join(desktop, 'src/renderer/src') }, logLevel: 'error' })
    const css = await postcss([tailwind({ ...config, content: [join(desktop, 'src/renderer/src/pages/assistant/AssistantBrowserBackgroundPicker.tsx')] })]).process('@tailwind base; @tailwind components; @tailwind utilities;', { from: undefined })
    const style = `
        :root { color-scheme:light;--color-card:#fff;--color-bg:#f6f7f9;--color-text:#20242b;--color-text-muted:#626974;--color-text-secondary:#4e5663;--surface-divider:#e4e6eb;--surface-hover:#f0f2f5;--accent-primary:#386fdb;--accent-contrast:#fff;--theme-foreground-rgb:32 36 43;--theme-background-rgb:246 247 249;--status-danger-rgb:190 30 40 }
        .dark { color-scheme:dark;--color-card:#181c22;--color-bg:#101318;--color-text:#eef1f6;--color-text-muted:#a8b0bd;--color-text-secondary:#bdc4ce;--surface-divider:#343b46;--surface-hover:#2b323d;--theme-foreground-rgb:238 241 246;--theme-background-rgb:16 19 24;--status-danger-rgb:255 120 120 }
        body { margin:0;background:var(--color-bg);font-family:system-ui,sans-serif }
        #browser { position:absolute;left:300px;top:60px;width:900px;height:700px;background:#294039;background-size:cover }
        @keyframes assistant-browser-history-panel-in { from { transform:translateX(calc(100% + 16px)) } to { transform:translateX(0) } }
    `
    await writeFile(join(temporary, 'index.html'), `<html><head><style>${css.css}\n${style}</style></head><body><div id="browser"></div><script>window.photos=${JSON.stringify(photos)};document.querySelector('#browser').style.backgroundImage='url('+window.photos[0].thumbnailUrl+')';</script><script>${bundle.outputFiles[0].text}</script></body></html>`)
    if (screenshotDirectory) await mkdir(screenshotDirectory, { recursive: true })
    const env = { ...process.env, ZYRA_BACKGROUND_FIXTURE: temporary, ZYRA_BACKGROUND_SCREENSHOTS: screenshotDirectory || '' }
    delete env.ELECTRON_RUN_AS_NODE
    const result = await new Promise((done, reject) => {
        const child = spawn(electronPath, [join(desktop, 'scripts/fixtures/browser-background-panel.cjs')], { cwd: desktop, env, stdio: 'inherit', windowsHide: true })
        child.once('error', reject)
        child.once('exit', code => done(code ?? 1))
    })
    assert.equal(result, 0, 'Background panel fixture failed')
} finally {
    await rm(temporary, { recursive: true, force: true })
}
