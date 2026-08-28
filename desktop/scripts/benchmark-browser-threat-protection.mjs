import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { DatabaseSync } from 'node:sqlite'

const ENTRY_COUNT = 1_000_000
const KNOWN_ENTRY_COUNT = 5_000
const LOOKUP_COUNT = 10_000
const LOOKUP_P95_BUDGET_MS = 2
const RAM_BUDGET_BYTES = 10 * 1024 * 1024

function hashUrl(index) {
    return createHash('sha256').update(`https://benchmark.example/item/${index}`).digest().subarray(0, 16)
}

function percentile(values, fraction) {
    const sorted = [...values].sort((left, right) => left - right)
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]
}

const tempDirectory = await mkdtemp(join(tmpdir(), 'zyra-browser-threat-benchmark-'))
const databasePath = join(tempDirectory, 'browser-threats.sqlite')
try {
    const database = new DatabaseSync(databasePath)
    database.exec(`
        PRAGMA journal_mode = OFF;
        PRAGMA synchronous = OFF;
        PRAGMA temp_store = FILE;
        CREATE TABLE threat_urls (url_hash BLOB PRIMARY KEY) WITHOUT ROWID;
        BEGIN IMMEDIATE;
    `)
    const insert = database.prepare('INSERT INTO threat_urls (url_hash) VALUES (?)')
    const buildStarted = performance.now()
    for (let index = 0; index < KNOWN_ENTRY_COUNT; index += 1) insert.run(hashUrl(index))
    const batchSize = 9_950
    for (let batch = 0; batch < 100; batch += 1) {
        database.exec(`
            WITH RECURSIVE sequence(value) AS (
                SELECT 1
                UNION ALL
                SELECT value + 1 FROM sequence WHERE value < ${batchSize}
            )
            INSERT INTO threat_urls (url_hash) SELECT randomblob(16) FROM sequence;
        `)
    }
    database.exec('COMMIT; PRAGMA optimize;')
    const buildMs = performance.now() - buildStarted
    database.close()

    global.gc?.()
    const rssBefore = process.memoryUsage().rss
    const lookupDatabase = new DatabaseSync(databasePath, { readOnly: true })
    lookupDatabase.exec('PRAGMA query_only = ON; PRAGMA cache_size = -2048; PRAGMA mmap_size = 0;')
    const lookup = lookupDatabase.prepare('SELECT 1 AS found FROM threat_urls WHERE url_hash = ? LIMIT 1')
    for (let index = 0; index < 1_000; index += 1) lookup.get(hashUrl(index % KNOWN_ENTRY_COUNT))
    const lookupSamples = []
    for (let index = 0; index < LOOKUP_COUNT; index += 1) {
        const candidate = index % 2 === 0 ? index % KNOWN_ENTRY_COUNT : ENTRY_COUNT + index
        const started = performance.now()
        lookup.get(hashUrl(candidate))
        lookupSamples.push(performance.now() - started)
    }
    const rssAfter = process.memoryUsage().rss
    lookupDatabase.close()

    const databaseBytes = (await stat(databasePath)).size
    const lookupP50Ms = percentile(lookupSamples, 0.50)
    const lookupP95Ms = percentile(lookupSamples, 0.95)
    const incrementalRssBytes = Math.max(0, rssAfter - rssBefore)
    assert.ok(lookupP95Ms < LOOKUP_P95_BUDGET_MS, `lookup p95 ${lookupP95Ms.toFixed(3)}ms exceeds ${LOOKUP_P95_BUDGET_MS}ms`)
    assert.ok(incrementalRssBytes < RAM_BUDGET_BYTES, `incremental RSS ${incrementalRssBytes} exceeds ${RAM_BUDGET_BYTES}`)
    console.log(JSON.stringify({
        entries: ENTRY_COUNT,
        databaseBytes,
        buildMs: Number(buildMs.toFixed(1)),
        lookupP50Ms: Number(lookupP50Ms.toFixed(4)),
        lookupP95Ms: Number(lookupP95Ms.toFixed(4)),
        incrementalRssBytes
    }, null, 2))
} finally {
    await rm(tempDirectory, { recursive: true, force: true })
}
