import { writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { hiddenRendererBenchmark, desktopRoot } from './helpers/hidden-renderer-benchmark.mjs'
const beforeIndex = process.argv.indexOf('--source-snapshot')
const outputIndex = process.argv.indexOf('--output')
const report = await hiddenRendererBenchmark({ name: 'closed-command-palette', entry: 'scripts/fixtures/performance-command-palette.tsx', overrides: beforeIndex < 0 ? {} : { 'src/renderer/src/components/CommandPalette.tsx': resolve(process.argv[beforeIndex + 1]) }, plugins: [{ name: 'synthetic-palette-environment', setup(api) {
    api.onResolve({ filter: /^\.\/assistant-store-core$/ }, () => ({ path: join(desktopRoot, 'scripts/fixtures/performance-assistant-store.ts') }))
    api.onResolve({ filter: /^(?:@\/lib\/settings|\.\/settings)$/ }, () => ({ path: 'settings', namespace: 'palette-fixture' }))
    api.onResolve({ filter: /settings-route-loaders$/ }, () => ({ path: 'routes', namespace: 'palette-fixture' }))
    api.onLoad({ filter: /.*/, namespace: 'palette-fixture' }, input => ({ contents: input.path === 'routes' ? 'export const preloadSettingsRoute=()=>{};' : 'const settings={theme:"vercel",appearanceCustomThemeActive:false,keyboardShortcuts:{}};const updateSettings=()=>{};export const useSettings=()=>({settings,updateSettings});export const getThemePresetAccent=()=>"#38bdf8";export const DEFAULT_APPEARANCE_ANIMATION_SPEED="normal",DEFAULT_APPEARANCE_ANIMATION_SCALE=100,DEFAULT_APPEARANCE_CODE_FONT="jetbrains",DEFAULT_APPEARANCE_CODE_SCALE=100,DEFAULT_APPEARANCE_CONTRAST_SCALE=100,DEFAULT_APPEARANCE_INTERFACE_SCALE=100;', loader: 'js' }))
} }], args: { sessions: 1000, updates: 100, samples: process.argv.includes('--verify-only') ? 0 : 5 } })
if (outputIndex >= 0) await writeFile(resolve(process.argv[outputIndex + 1]), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
