import assert from 'node:assert/strict'
import { requestAssistantBrowserDisplayCapture } from '../src/renderer/src/pages/assistant/assistant-browser-display-capture'

const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
const calls: string[] = []
let release!: (value: MediaStream) => void
let requestCount = 0
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: {
    getDisplayMedia: () => {
        calls.push('capture')
        if (++requestCount === 1) return new Promise<MediaStream>(resolve => { release = resolve })
        return Promise.resolve({ id: 'second' } as MediaStream)
    }
} } })
try {
    const first = requestAssistantBrowserDisplayCapture(async () => { calls.push('presentation grant') }, { video: true, audio: false })
    const second = requestAssistantBrowserDisplayCapture(async () => { calls.push('audio grant') }, { video: true, audio: true })
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.deepEqual(calls, ['presentation grant', 'capture'], 'a concurrent audio grant cannot replace an outstanding presentation request')
    release({ id: 'first' } as MediaStream)
    assert.equal((await first).id, 'first')
    assert.equal((await second).id, 'second')
    assert.deepEqual(calls, ['presentation grant', 'capture', 'audio grant', 'capture'])
    const failed = requestAssistantBrowserDisplayCapture(async () => { throw new Error('closed tab') }, { video: true })
    const recovery = requestAssistantBrowserDisplayCapture(async () => { calls.push('recovery grant') }, { video: true })
    await assert.rejects(failed, /closed tab/)
    await recovery
    assert.equal(requestCount, 3, 'failed preparation does not request media or poison the next capture')
    console.log('Browser display capture grant serialization and recovery: ok')
} finally {
    if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor)
    else Reflect.deleteProperty(globalThis, 'navigator')
}
