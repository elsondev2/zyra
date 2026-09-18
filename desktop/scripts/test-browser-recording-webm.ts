import assert from 'node:assert/strict'
import { finalizeBrowserRecordingWebm } from '../src/shared/browser-recording-webm'

// Deliberately tiny encoded-shaped data: the committed fixture never captures a user page/audio.
const concat = (...parts: Uint8Array[]) => new Uint8Array(Buffer.concat(parts))
const uint = (value: number, width = 1) => { const out = Buffer.alloc(width); out.writeUIntBE(value, 0, width); return out }
const tag = (id: string, payload: Uint8Array) => concat(Buffer.from(id, 'hex'), payload.length < 127 ? uint(0x80 + payload.length) : uint(0x4000 + payload.length, 2), payload)
const unknown = Buffer.from('01ffffffffffffff', 'hex')
const info = tag('1549a966', tag('2ad7b1', uint(1_000_000, 3)))
const tracks = tag('1654ae6b', tag('ae', concat(tag('d7', uint(1)), tag('83', uint(1)))))
const block = (key: boolean, time: number, payload: number[]) => tag('a3', concat(uint(0x81), uint(time, 2), uint(key ? 0x80 : 0), new Uint8Array(payload)))
const first = concat(Buffer.from('1f43b675', 'hex'), unknown, tag('e7', uint(0)), block(true, 0, [13, 71, 9]), block(false, 33, [26, 82]))
const second = concat(Buffer.from('1f43b675', 'hex'), unknown, tag('e7', uint(1000, 2)), block(true, 20, [39, 93]))
const source = concat(tag('1a45dfa3', tag('4282', new TextEncoder().encode('webm'))), Buffer.from('18538067', 'hex'), unknown, info, tracks, first, second)
const output = finalizeBrowserRecordingWebm(source, 1600)
assert.notEqual(output, source, 'live WebM gets finalized')

type Item = { id: string; start: number; data: number; end: number }
const read = (buffer: Uint8Array, start: number): Item => {
    const width = (offset: number) => { let length = 1; while (!(buffer[offset] & (0x80 >> (length - 1)))) length++; return length }
    const idWidth = width(start); const sizeWidth = width(start + idWidth)
    let length = buffer[start + idWidth] & (0xff >> sizeWidth)
    for (let i = 1; i < sizeWidth; i++) length = length * 256 + buffer[start + idWidth + i]
    const data = start + idWidth + sizeWidth
    return { id: Buffer.from(buffer.subarray(start, start + idWidth)).toString('hex'), start, data, end: data + length }
}
const children = (buffer: Uint8Array, parent: Item) => {
    const result: Item[] = []
    for (let offset = parent.data; offset < parent.end;) { const item = read(buffer, offset); result.push(item); offset = item.end }
    return result
}
const value = (buffer: Uint8Array, item: Item) => { let n = 0; for (let i = item.data; i < item.end; i++) n = n * 256 + buffer[i]; return n }
const header = read(output, 0); const segment = read(output, header.end)
assert.equal(segment.end, output.length, 'the Segment now has a finite exact size')
const seek = read(output, segment.data)
const locations = new Map<string, number>()
for (const item of children(output, seek)) {
    const fields = children(output, item)
    const id = fields.find(field => field.id === '53ab')!
    locations.set(Buffer.from(output.subarray(id.data, id.end)).toString('hex'), value(output, fields.find(field => field.id === '53ac')!))
}
const finalizedInfo = read(output, segment.data + locations.get('1549a966')!)
assert.equal(children(output, segment).at(-1)!.end, segment.end, 'finite Segment children must all have finite exact sizes')
const duration = children(output, finalizedInfo).find(item => item.id === '4489')!
assert.equal(new DataView(output.buffer, output.byteOffset + duration.data, 8).getFloat64(0), 1600)
assert.equal(read(output, segment.data + locations.get('1654ae6b')!).id, '1654ae6b')
const cues = read(output, segment.data + locations.get('1c53bb6b')!)
assert.equal(cues.id, '1c53bb6b')
const points = children(output, cues)
assert.equal(points.length, 2, 'only video keyframes enter the seek index')
for (const [index, point] of points.entries()) {
    const fields = children(output, point)
    assert.equal(value(output, fields.find(item => item.id === 'b3')!), [0, 1020][index])
    const positions = children(output, fields.find(item => item.id === 'b7')!)
    const clusterOffset = segment.data + value(output, positions.find(item => item.id === 'f1')!)
    const originalCluster = [first, second][index]
    const cluster = read(output, clusterOffset)
    assert(cluster.end <= cues.start, 'finalized Clusters have finite sizes inside the finite Segment')
    assert.deepEqual(output.subarray(cluster.data, cluster.end), originalCluster.subarray(4 + unknown.length), 'encoded cluster payloads remain identical')
    const frame = read(output, cluster.data + value(output, positions.find(item => item.id === 'f0')!))
    assert.equal(frame.id, 'a3', 'seek relative offsets point to actual keyframe blocks')
    assert.equal(output[frame.data + 3] & 0x80, 0x80)
}
assert.equal(finalizeBrowserRecordingWebm(output, 2000), output, 'already finalized media stays untouched')
assert.equal(finalizeBrowserRecordingWebm(source, NaN), source)
const truncated = source.subarray(0, source.length - 1)
assert.equal(finalizeBrowserRecordingWebm(truncated, 1600), truncated, 'truncated input stays available for recovery')
const foreign = new TextEncoder().encode('some other media')
assert.equal(finalizeBrowserRecordingWebm(foreign, 1600), foreign)
const shortHeaderCluster = concat(Buffer.from('1f43b675ff', 'hex'), first.subarray(4 + unknown.length), block(false, 66, Array.from({ length: 180 }, (_, i) => i)))
const shortHeaderSource = concat(tag('1a45dfa3', tag('4282', new TextEncoder().encode('webm'))), Buffer.from('18538067', 'hex'), unknown, info, tracks, shortHeaderCluster)
const shortHeaderOutput = finalizeBrowserRecordingWebm(shortHeaderSource, 1600)
const shortHeaderSegment = read(shortHeaderOutput, read(shortHeaderOutput, 0).end)
const resizedCluster = children(shortHeaderOutput, shortHeaderSegment).find(item => item.id === '1f43b675')!
assert.equal(resizedCluster.data - resizedCluster.start, 6, 'one-byte unknown length grows when its finite payload needs two bytes')
assert.deepEqual(shortHeaderOutput.subarray(resizedCluster.data, resizedCluster.end), shortHeaderCluster.subarray(5))
const scaledInfo = tag('1549a966', tag('2ad7b1', uint(100_000, 3)))
const scaled = concat(source.subarray(0, header.end), Buffer.from('18538067', 'hex'), unknown, scaledInfo, tracks, first, second)
const scaledOutput = finalizeBrowserRecordingWebm(scaled, 1600)
const durationMarker = Buffer.from(scaledOutput).indexOf(Buffer.from('448988', 'hex'))
assert.equal(new DataView(scaledOutput.buffer, scaledOutput.byteOffset + durationMarker + 3, 8).getFloat64(0), 16000, 'duration uses the declared Segment tick scale')
console.log('WebM metadata: finite duration, correct keyframe seeks, exact media preservation, scale and safe fallback: ok')
