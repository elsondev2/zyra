import { writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { hiddenRendererBenchmark, desktopRoot } from './helpers/hidden-renderer-benchmark.mjs'

const snapshotIndex = process.argv.indexOf('--source-snapshot')
const outputIndex = process.argv.indexOf('--output')
const snapshot = snapshotIndex >= 0 ? resolve(process.argv[snapshotIndex + 1]) : null
const report = await hiddenRendererBenchmark({
    name: 'chat-store-selectors', entry: 'scripts/fixtures/performance-chat-selectors.tsx',
    overrides: snapshot ? { 'src/renderer/src/lib/assistant/assistant-store-hooks.ts': snapshot } : {},
    plugins: [{ name: 'synthetic-assistant-store', setup(api) {
        api.onResolve({ filter: /^\.\/assistant-store-core$/ }, () => ({ path: join(desktopRoot, 'scripts/fixtures/performance-assistant-store.ts') }))
    } }],
    args: { sessions: 1000, updates: 200, samples: process.argv.includes('--verify-only') ? 0 : 5 }
})
if (outputIndex >= 0) await writeFile(resolve(process.argv[outputIndex + 1]), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
