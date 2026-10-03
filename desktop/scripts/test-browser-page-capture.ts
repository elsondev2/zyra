import assert from 'node:assert/strict'
import { mock } from 'bun:test'
import type { NativeImage, WebContents } from 'electron'

mock.module('electron', () => ({ nativeImage: {} }))
const { captureBrowserTabPreview } = await import('../src/main/browser-page-capture')

// Static hidden pages can provide readbacks without another presentation event.
function fixture() {
    let finishCapture: (image: NativeImage) => void = () => { throw new Error('No capture request') }
    let failCapture: (error: Error) => void = () => { throw new Error('No capture request') }
    let finishPaint: () => void = () => { throw new Error('No paint barrier') }
    const calls = { captures: 0, paintBarriers: 0, resizes: [] as unknown[] }
    let destroyed = false
    // Keep presentation methods to replay the old implementation: it receives the
    // wake frame but no later event, reproducing the static-page timeout.
    let present: ((image: NativeImage) => void) | undefined
    const image = (label: string, empty = false) => ({
        isEmpty: () => empty,
        getSize: () => ({ width: 1600, height: 1000 }),
        resize: (options: unknown) => { calls.resizes.push(options); return { toJPEG: (quality: number) => { assert.equal(quality, 82); return Buffer.from(label) } } },
        toJPEG: () => { throw new Error('Large images must be resized before encoding') }
    }) as NativeImage
    const guest = {
        isDestroyed: () => destroyed,
        beginFrameSubscription: (_onlyDirty: boolean, callback: (image: NativeImage) => void) => { present = callback },
        endFrameSubscription: () => { present = undefined },
        executeJavaScript: (source: string) => {
            assert.equal(source, 'new Promise(resolve => requestAnimationFrame(resolve))')
            calls.paintBarriers++
            return new Promise<void>(resolve => { finishPaint = resolve })
        },
        capturePage: (rect: unknown, options: unknown) => {
            assert.equal(rect, undefined)
            assert.deepEqual(options, { stayHidden: false, stayAwake: true })
            calls.captures++
            return new Promise<NativeImage>((resolve, reject) => { finishCapture = resolve; failCapture = reject })
        }
    } as unknown as WebContents
    return { guest, calls, capture: (label: string, empty = false) => { const frame = image(label, empty); finishCapture(frame); present?.(frame) },
        paint: () => finishPaint(), fail: (error: Error) => failCapture(error), destroy: () => { destroyed = true } }
}

async function flush() {
    for (let index = 0; index < 4; index++) await Promise.resolve()
}

async function wakeAndPaint(page: ReturnType<typeof fixture>) {
    page.capture('stale')
    await flush()
    assert.equal(page.calls.paintBarriers, 1)
    page.paint()
    await flush()
    assert.equal(page.calls.captures, 2, 'a static page requests its fresh readback after the paint barrier')
}

const first = fixture()
const pending = captureBrowserTabPreview(first.guest)
assert.equal(captureBrowserTabPreview(first.guest), pending, 'concurrent preview requests share one capture operation')
let settled = false
void pending.then(() => { settled = true })
await wakeAndPaint(first)
assert.equal(settled, false, 'the wake snapshot is discarded instead of returned as the thumbnail')
first.capture('fresh')
assert.equal(await pending, `data:image/jpeg;base64,${Buffer.from('fresh').toString('base64')}`)
assert.deepEqual(first.calls, { captures: 2, paintBarriers: 1, resizes: [{ width: 768, height: 480, quality: 'best' }] })

const second = captureBrowserTabPreview(first.guest)
assert.notEqual(second, pending, 'settled requests leave the per-tab deduplication map')
first.capture('stale-again'); await flush(); first.paint(); await flush(); first.capture('next')
assert.equal(await second, `data:image/jpeg;base64,${Buffer.from('next').toString('base64')}`)

const failed = fixture()
const failedRequest = captureBrowserTabPreview(failed.guest)
const rejection = assert.rejects(failedRequest, /capture failed/)
failed.fail(new Error('capture failed'))
await rejection
const retry = captureBrowserTabPreview(failed.guest)
assert.notEqual(retry, failedRequest, 'a failed capture can be retried')
failed.capture('stale'); await flush(); failed.paint(); await flush(); failed.capture('retry')
await retry

const empty = fixture()
const emptyRequest = captureBrowserTabPreview(empty.guest)
const emptyRejection = assert.rejects(emptyRequest, /preview is unavailable/)
await wakeAndPaint(empty); empty.capture('empty', true)
await emptyRejection

const closed = fixture()
closed.destroy()
await assert.rejects(captureBrowserTabPreview(closed.guest), /tab was closed/)
assert.equal(closed.calls.captures, 0)

const lost = fixture()
const lostRequest = captureBrowserTabPreview(lost.guest)
const lostRejection = assert.rejects(lostRequest, /tab was closed/)
lost.destroy(); lost.capture('late')
await lostRejection
assert.equal(lost.calls.paintBarriers, 0, 'destroyed pages receive no follow-up work')

const silent = fixture()
const silentRequest = captureBrowserTabPreview(silent.guest)
await assert.rejects(silentRequest, /screenshot timed out/)
silent.capture('late'); await flush()
assert.equal(silent.calls.paintBarriers, 0, 'timed-out wake requests cannot schedule further page work')

console.log('Browser thumbnails: static-page fresh readbacks, stale wake exclusion, deduplication, bounded size, retry, destruction and timeout passed.')
