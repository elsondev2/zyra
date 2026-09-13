// MediaRecorder writes live WebM: unknown Segment/Cluster sizes, no duration or
// seek index. Finalize that narrow format without decoding/copying frame payloads
// during parsing. Matroska IDs/offsets: https://www.matroska.org/technical/elements.html
type Element = { id: number; start: number; data: number; end: number; unknown: boolean }
const ID = { segment: 0x18538067, info: 0x1549a966, tracks: 0x1654ae6b, cluster: 0x1f43b675, cues: 0x1c53bb6b, seek: 0x114d9b74 }
const topLevel = new Set([...Object.values(ID), 0xec])

function integer(value: number, width = Math.max(1, Math.ceil(Math.log2(value + 1) / 8))): Uint8Array<ArrayBuffer> {
    const bytes = new Uint8Array(width)
    for (let index = width - 1; index >= 0; index--) { bytes[index] = value % 256; value = Math.floor(value / 256) }
    if (value) throw new Error('WebM integer overflow')
    return bytes
}
function join(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
    const bytes = new Uint8Array(parts.reduce((size, part) => size + part.length, 0))
    let offset = 0
    for (const part of parts) { bytes.set(part, offset); offset += part.length }
    return bytes
}
function size(value: number): Uint8Array<ArrayBuffer> {
    let width = 1
    while (value >= 2 ** (7 * width) - 1) width++
    const bytes = integer(value, width); bytes[0] |= 1 << (8 - width)
    return bytes
}
function element(id: number, ...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
    const payload = join(parts)
    return join([integer(id), size(payload.length), payload])
}

/** Returns the original bytes on foreign/truncated layouts; never sacrifices a recording to metadata repair. */
export function finalizeBrowserRecordingWebm(bytes: Uint8Array, durationMs: number): Uint8Array {
    try {
        if (!Number.isFinite(durationMs) || durationMs <= 0 || bytes.length > 128 * 1024 * 1024) return bytes
        let visited = 0
        const vint = (offset: number, stripMarker: boolean) => {
            const first = bytes[offset]
            if (!first) throw new Error('Invalid WebM VINT')
            let width = 1
            while (!(first & (1 << (8 - width)))) width++
            if (width > 8 || offset + width > bytes.length) throw new Error('Truncated WebM VINT')
            let value = stripMarker ? first & ((1 << (8 - width)) - 1) : first
            let unknown = stripMarker && value === (1 << (8 - width)) - 1
            for (let index = 1; index < width; index++) { value = value * 256 + bytes[offset + index]; unknown &&= bytes[offset + index] === 255 }
            if (!unknown && !Number.isSafeInteger(value)) throw new Error('Oversized WebM integer')
            return { value, width, unknown }
        }
        const read = (start: number, limit: number): Element => {
            if (++visited > 250_000) throw new Error('WebM metadata scan budget exceeded')
            const id = vint(start, false); const length = vint(start + id.width, true)
            const data = start + id.width + length.width
            const end = length.unknown ? limit : data + length.value
            if (data > limit || end > limit || end <= start) throw new Error('Truncated WebM element')
            return { id: id.value, start, data, end, unknown: length.unknown }
        }
        const children = (parent: Element) => {
            const result: Element[] = []
            for (let offset = parent.data; offset < parent.end;) {
                const child = read(offset, parent.end)
                if (child.unknown) throw new Error('Unsupported unknown WebM child')
                result.push(child); offset = child.end
            }
            return result
        }
        const number = (item: Element) => {
            if (item.end - item.data > 6) throw new Error('Oversized WebM metadata')
            let result = 0
            for (let offset = item.data; offset < item.end; offset++) result = result * 256 + bytes[offset]
            return result
        }
        const raw = (item: Element) => bytes.subarray(item.start, item.end)
        const header = read(0, bytes.length)
        if (header.id !== 0x1a45dfa3 || header.unknown) return bytes
        const segment = read(header.end, bytes.length)
        if (segment.id !== ID.segment || segment.end !== bytes.length) return bytes
        const entries: Element[] = []
        const cuePoints: { cluster: Element; time: number; track: number; relative: number }[] = []
        let videoTrack = 0; let scale = 1_000_000; let latestTime = 0
        for (let offset = segment.data; offset < segment.end;) {
            const item = read(offset, segment.end)
            if (!topLevel.has(item.id) || item.id === ID.segment) return bytes
            if (item.unknown && item.id !== ID.cluster) return bytes
            if (item.id === ID.info) {
                const values = children(item)
                // Already finalized files may contain offsets we must not invalidate.
                if (values.some(value => value.id === 0x4489)) return bytes
                const timestampScale = values.find(value => value.id === 0x2ad7b1)
                if (timestampScale) scale = number(timestampScale)
                if (!scale) return bytes
            } else if (item.id === ID.tracks) {
                for (const track of children(item).filter(value => value.id === 0xae)) {
                    const values = children(track)
                    if (values.some(value => value.id === 0x83 && number(value) === 1)) {
                        const trackNumber = values.find(value => value.id === 0xd7)
                        if (trackNumber) videoTrack = number(trackNumber)
                    }
                }
            } else if (item.id === ID.cluster) {
                let timestamp = 0
                for (let position = item.data; position < item.end;) {
                    const child = read(position, item.end)
                    if (item.unknown && topLevel.has(child.id) && child.id !== 0xec) { item.end = position; break }
                    if (child.unknown || child.id === 0xa7) return bytes // Existing absolute Cluster Position would need rewriting.
                    if (child.id === 0xe7) timestamp = number(child)
                    if (child.id === 0xa3) {
                        const track = vint(child.data, true)
                        const block = child.data + track.width
                        if (track.unknown || block + 3 > child.end) return bytes
                        const relative = new DataView(bytes.buffer, bytes.byteOffset + block, 2).getInt16(0)
                        const time = timestamp + relative
                        latestTime = Math.max(latestTime, time)
                        if (track.value === videoTrack && (bytes[block + 2] & 0x80) && time >= 0) {
                            if (cuePoints.length >= 20_000) return bytes
                            cuePoints.push({ cluster: item, time, track: track.value, relative: child.start - item.data })
                        }
                    } else if (child.id === 0xa0) return bytes // Chromium's supported VP8/Opus recorder emits SimpleBlocks.
                    position = child.end
                }
            }
            entries.push(item); offset = item.end
        }
        const info = entries.find(item => item.id === ID.info)
        const tracks = entries.find(item => item.id === ID.tracks)
        if (!info || !tracks || !cuePoints.length) return bytes
        const duration = new Uint8Array(8)
        new DataView(duration.buffer).setFloat64(0, Math.max(durationMs * 1_000_000 / scale, latestTime))
        const finalizedInfo = element(ID.info, ...children(info).filter(item => item.id !== 0xbf).map(raw), element(0x4489, duration))
        const seekEntry = (id: number, offset: number) => element(0x4dbb, element(0x53ab, integer(id)), element(0x53ac, integer(offset, 8)))
        const seekHead = (infoOffset: number, tracksOffset: number, cuesOffset: number) => element(ID.seek, seekEntry(ID.info, infoOffset), seekEntry(ID.tracks, tracksOffset), seekEntry(ID.cues, cuesOffset))
        const seekLength = seekHead(0, 0, 0).length
        let offset = seekLength + finalizedInfo.length + raw(tracks).length
        const media = entries.filter(item => item.id === ID.cluster || item.id === 0xec)
        const clusterOffsets = new Map<Element, number>()
        for (const item of media) { clusterOffsets.set(item, offset); offset += item.end - item.start }
        const cues = element(ID.cues, ...cuePoints.sort((left, right) => left.time - right.time).map(cue => element(0xbb,
            element(0xb3, integer(cue.time)), element(0xb7, element(0xf7, integer(cue.track)),
                element(0xf1, integer(clusterOffsets.get(cue.cluster)!, 8)), element(0xf0, integer(cue.relative))))))
        const payload = [seekHead(seekLength, seekLength + finalizedInfo.length, offset), finalizedInfo, raw(tracks), ...media.map(raw), cues]
        // One final allocation; frame payloads remain byte-for-byte unchanged.
        const length = payload.reduce((total, part) => total + part.length, 0)
        return join([raw(header), integer(ID.segment), size(length), ...payload])
    } catch { return bytes }
}
