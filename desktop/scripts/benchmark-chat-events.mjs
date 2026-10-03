import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { hiddenRendererBenchmark } from './helpers/hidden-renderer-benchmark.mjs'
const snapshotIndex = process.argv.indexOf('--source-directory')
const outputIndex = process.argv.indexOf('--output')
const snapshot = snapshotIndex >= 0 ? resolve(process.argv[snapshotIndex + 1]) : null
const report = await hiddenRendererBenchmark({ name: 'chat-event-checkpoints', entry: 'scripts/fixtures/performance-chat-events.ts', overrides: snapshot ? {
    'src/renderer/src/lib/assistant/assistant-store-core.ts': resolve(snapshot, 'assistant-store-core.before.ts'),
    'src/renderer/src/lib/assistant/assistant-history-state.ts': resolve(snapshot, 'assistant-history-state.before.ts'),
    'src/renderer/src/lib/assistant/session-hydration-cache.ts': resolve(snapshot, 'session-hydration-cache.before.ts')
} : {}, args: { sessions: 1000, retained: 12, updates: 200, samples: process.argv.includes('--verify-only') ? 0 : 5 } })
if (outputIndex >= 0) await writeFile(resolve(process.argv[outputIndex + 1]), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
