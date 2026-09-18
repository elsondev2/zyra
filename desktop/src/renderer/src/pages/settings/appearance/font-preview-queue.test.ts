import assert from 'node:assert/strict'
import { createFontPreviewQueue, fontRangeContainsAscii } from './font-preview-queue'

const queue = createFontPreviewQueue(2)
let active = 0, peak = 0, completed = 0
const tasks = Array.from({ length: 30 }, (_, index) => queue(async () => {
    active += 1; peak = Math.max(peak, active)
    await Promise.resolve(); await Promise.resolve()
    active -= 1; completed += 1
    return index
}))
assert.deepEqual(await Promise.all(tasks), Array.from({ length: 30 }, (_, index) => index))
assert.equal(peak, 2); assert.equal(completed, 30)
await assert.rejects(queue(async () => { throw Error('fixture failure') }))
assert.equal(await queue(async () => 'recovered'), 'recovered')
assert.equal(fontRangeContainsAscii('U+0400-045F'), false)
assert.equal(fontRangeContainsAscii('U+0000-00FF, U+0131'), true)
assert.equal(fontRangeContainsAscii('U+0??'), true)
assert.equal(fontRangeContainsAscii(undefined), true)
console.log('Font preview queue: bounded slots, failure release and actual Latin subset selection: ok')
