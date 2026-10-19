import assert from 'node:assert/strict'
import { mkdtemp, writeFile, appendFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ChildTranscriptStore } from '../../src/agents/runtime/transcript-store.mjs'
const directory = await mkdtemp(join(tmpdir(), 'zyra-transcript-store-'))
try {
    const file = join(directory, 'child.jsonl')
    await writeFile(file, Array.from({ length: 95 }, (_, index) => JSON.stringify({ type: 'message', value: index })).join('\n') + '\n')
    const store = new ChildTranscriptStore()
    const head = await store.page(file, { after: -1, limit: 30 })
    assert.deepEqual(head.entries.map(entry => entry.value), Array.from({ length: 30 }, (_, index) => index), 'opening requests the beginning, not the tail')
    assert.equal(head.nextBefore, null)
    assert.equal(head.nextAfter, 29)
    const next = await store.page(file, { after: head.nextAfter, limit: 30 })
    assert.equal(next.entries[0].value, 30)
    assert.equal(next.entries.at(-1).value, 59)
    assert.equal(next.nextAfter, 59)
    const refresh = await store.page(file, { after: -1, before: 30, limit: 30 })
    assert.deepEqual(refresh.entries, head.entries, 'refresh can stay within the loaded window')
    assert.equal(refresh.nextAfter, 29, 'bounded refresh does not falsely report end of history')
    const tail = await store.page(file, { after: 89, limit: 30 })
    assert.deepEqual(tail.entries.map(entry => entry.value), [90, 91, 92, 93, 94])
    assert.equal(tail.nextAfter, null)
    await appendFile(file, JSON.stringify({ type: 'message', value: 95 }) + '\n')
    const live = await store.page(file, { after: 93, limit: 30 })
    assert.deepEqual(live.entries.map(entry => entry.value), [94, 95])
    const legacy = await store.page(file, { limit: 3 })
    assert.deepEqual(legacy.entries.map(entry => entry.value), [93, 94, 95], 'legacy tail callers retain their existing behavior')
    assert.equal(legacy.nextBefore, 93)
    const older = await store.page(file, { before: 93, limit: 3 })
    assert.deepEqual(older.entries.map(entry => entry.value), [90, 91, 92])
    assert.equal((await store.page(file, { after: 95 })).entries.length, 0)
    assert.equal((await store.page(file, { after: -1, limit: 500 })).entries.length, 50, 'forward pages respect the store cap')
    console.log('Child transcript store: bounded forward/backward pages, head refresh and live append passed')
} finally { await rm(directory, { recursive: true, force: true }) }
