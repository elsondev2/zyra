import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import initSqlJs from 'sql.js/dist/sql-asm.js'
import { openNativeSqliteDatabase } from '../src/main/assistant/native-sqlite-adapter'
import { readFleetSnapshot, readFleetSnapshots } from '../src/main/assistant/fleet-persistence'

const SQL = await initSqlJs()
const backends = [['sqljs', new SQL.Database()], ['native', await openNativeSqliteDatabase(':memory:')]] as const
const report: Record<string, unknown> = {}
const sampleCount = process.argv.includes('--verify-only') ? 0 : 9
const warmups = sampleCount ? 2 : 0
for (const [backend, db] of backends) {
    try {
        db.run('CREATE TABLE assistant_fleet_snapshots (root_thread_id TEXT PRIMARY KEY, payload_json TEXT)')
        const ids = Array.from({ length: 1000 }, (_, i) => `thread-${i}`)
        for (let i = 0; i < ids.length; i += 20) db.run('INSERT INTO assistant_fleet_snapshots VALUES (?, ?)', [ids[i]!, JSON.stringify({ rootThreadId: ids[i], fleetId: `fleet-${i}`, agents: {}, workflows: {}, artifacts: [], relationships: [], lastAppliedSequence: i, updatedAt: '2026-01-01T00:00:00.000Z' })])
        db.run('INSERT INTO assistant_fleet_snapshots VALUES (?, ?)', ['invalid', 'not json'])
        db.run('INSERT INTO assistant_fleet_snapshots VALUES (?, ?)', ['null', 'null'])
        const samples: Record<string, number[]> = { before: [], after: [] }
        const expected: Record<string, unknown> = Object.create(null)
        for (const id of ids) { const value = readFleetSnapshot(db, id); if (value) expected[id] = value }
        assert.deepEqual(readFleetSnapshots(db, ids), expected)
        const queryCounts: Record<string, number> = {}
        for (let sample = -warmups; sample < sampleCount; sample++) {
            for (const mode of sample % 2 ? ['after', 'before'] : ['before', 'after']) {
                const start = performance.now()
                const data: Record<string, unknown> = Object.create(null)
                if (mode === 'before') for (const id of ids) { const value = readFleetSnapshot(db, id); if (value) data[id] = value }
                else Object.assign(data, readFleetSnapshots(db, ids))
                const elapsed = performance.now() - start
                assert.equal(Object.keys(data).length, 50)
                assert.equal((data['thread-980'] as any).lastAppliedSequence, 980)
                if (sample >= 0) samples[mode]!.push(elapsed)
            }
        }
        const original = db.exec.bind(db)
        let queries = 0
        db.exec = ((...args: Parameters<typeof db.exec>) => { queries++; return original(...args) }) as typeof db.exec
        ids.forEach(id => readFleetSnapshot(db, id)); queryCounts.before = queries; queries = 0
        readFleetSnapshots(db, ids); queryCounts.after = queries
        queries = 0; assert.deepEqual({ ...readFleetSnapshots(db, []) }, {}); assert.equal(queries, 0)
        assert.deepEqual({ ...readFleetSnapshots(db, ['invalid', 'null', 'missing']) }, {})
        assert.equal(Object.keys(readFleetSnapshots(db, ['thread-0', 'thread-0'])).length, 1)
        report[backend] = { protocol: { threads: 1000, fleetRows: 50, samples: sampleCount, warmups, alternatingOrder: true, workload: 'Actual fleet readers, in-memory database; query time only, no app launch' }, timesMs: samples, queryCounts, correctness: { allFleets: true, missingAndCorrupt: true, empty: true, duplicates: true } }
    } finally { db.close() }
}
const outputIndex = process.argv.indexOf('--output')
if (outputIndex >= 0) await writeFile(resolve(process.argv[outputIndex + 1]!), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
