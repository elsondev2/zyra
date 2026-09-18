import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

async function moduleAt(entry) {
  const result = await build({ entryPoints: [fileURLToPath(new URL(`../src/extension/${entry}.ts`, import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node', target: 'node22' })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}

function clock(t) {
  let now = 0, next = 0;
  const jobs = new Map();
  const schedule = (fn, delay, repeat) => { const id = ++next; jobs.set(id, { fn, delay, at: now + delay, repeat }); return id }
  t.mock.method(globalThis, 'setTimeout', (fn, delay) => schedule(fn, delay, false))
  t.mock.method(globalThis, 'setInterval', (fn, delay) => schedule(fn, delay, true))
  t.mock.method(globalThis, 'clearTimeout', id => jobs.delete(id))
  t.mock.method(globalThis, 'clearInterval', id => jobs.delete(id))
  return { async tick(ms) {
    const until = now + ms;
    while (true) {
      const entry = [...jobs].sort((a, b) => a[1].at - b[1].at).find(([, job]) => job.at <= until)
      if (!entry) break;
      const [id, job] = entry; now = job.at;
      if (job.repeat) job.at += job.delay; else jobs.delete(id)
      job.fn()
      for (let i = 0; i < 50; i++) await Promise.resolve()
    }
    now = until;
  }, get size() { return jobs.size } }
}

// Exercise the real controller across the same quiet gap as consecutive tool calls.
test('cursor presence is renewed between actions and stops on release', async t => {
  const { CursorController } = await moduleAt('cursor')
  const time = clock(t)
  let visible = false, expiry
  const calls = []
  const cursor = new CursorController(async (id, command) => {
    calls.push([id, command])
    clearTimeout(expiry)
    visible = command !== 'cursor:destroy'
    if (visible) expiry = setTimeout(() => { visible = false }, 2500)
    return { durationMs: 0 }
  })
  try {
    await cursor.move(41, { x: 80, y: 100 }, new AbortController().signal)
    await cursor.phase(41, 'idle')
    for (let i = 0; i < 15; i++) {
      await time.tick(1000)
    }
    assert.equal(visible, true, 'cursor must not disappear during a 15-second thinking/waiting gap')
    await cursor.destroy(41)
    const count = calls.length
    await time.tick(10000)
    assert.equal(visible, false)
    assert.equal(calls.length, count, 'release must stop renewal, not resurrect the cursor')
  } finally { await cursor.destroy(41); clearTimeout(expiry) }
})

test('renewal does not overlap or restart after a late response or detach', async t => {
  const { CursorController } = await moduleAt('cursor')
  const time = clock(t), calls = []
  let finish
  const cursor = new CursorController(async (_id, command) => {
    calls.push(command)
    if (command === 'cursor:keepalive') await new Promise(resolve => { finish = resolve })
    return { durationMs: 0 }
  })
  await cursor.move(41, { x: 10, y: 20 }, new AbortController().signal)
  await time.tick(10000)
  assert.equal(calls.filter(command => command === 'cursor:keepalive').length, 1)
  cursor.forget(41)
  finish()
  await Promise.resolve()
  const count = calls.length
  await time.tick(10000)
  assert.equal(calls.length, count)
  assert.equal(time.size, 0)
})

test('real Chrome controller retains cursor ownership across navigation but ends it on read-only, release and detach', async t => {
  const { Controller } = await moduleAt('control')
  const time = clock(t), listeners = {}, calls = []
  const event = name => ({ addListener(fn) { listeners[name] = fn } })
  let tab = { id: 41, url: 'https://example.test/', title: 'Fixture', active: true }
  const previous = globalThis.chrome
  globalThis.chrome = {
    tabs: { get: async () => tab, onUpdated: event('updated'), onRemoved: event('removed') },
    webNavigation: { onCommitted: event('committed') },
    debugger: {
      onDetach: event('detach'), onEvent: event('debugger'), attach: async () => {}, detach: async () => {},
      sendCommand: async (_target, method, params) => {
        calls.push([method, params])
        if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'frame', url: tab.url } } }
        if (method === 'Page.createIsolatedWorld') return { executionContextId: 1 }
        if (method === 'Runtime.evaluate') return { result: { value: { durationMs: 0, x: 30, y: 40 } } }
        return {}
      }
    }
  }
  const controller = new Controller(() => {})
  const hover = () => controller.execute({ method: 'hover', params: { tabId: 41, ref: 'fixture:1' } }, new AbortController().signal)
  const renewals = () => calls.filter(([method, params]) => method === 'Runtime.evaluate' && params.expression.includes(')("cursor:keepalive",'))
  try {
    await controller.grant(41, 'control', 'tab')
    await hover()
    await time.tick(3000)
    assert.equal(renewals().length, 3)
    listeners.committed({ tabId: 41, frameId: 0, url: tab.url })
    await time.tick(1000)
    assert.equal(renewals().length, 4, 'document invalidation must not end the control session')
    await controller.execute({ method: 'navigate', params: { tabId: 41, url: 'https://example.test/next' } }, new AbortController().signal)
    await time.tick(1000)
    assert.equal(renewals().length, 5, 'explicit navigation also retains presence')
    await controller.grant(41, 'read')
    let count = calls.length
    await time.tick(6000)
    assert.equal(calls.length, count, 'read-only downgrade cancels all renewal work')
    await controller.grant(41, 'control', 'tab'); await hover()
    await controller.release(41)
    count = calls.length; await time.tick(6000)
    assert.equal(calls.length, count, 'release cannot reattach or inject')
    await controller.grant(41, 'control', 'tab'); await hover()
    listeners.detach({ tabId: 41 }, 'canceled_by_user')
    count = calls.length; await time.tick(6000)
    assert.equal(calls.length, count, 'debugger detach stops renewal and lets the page lease expire')
    await controller.grant(41, 'control'); await hover()
    tab = { ...tab, url: 'chrome://settings' }
    listeners.updated(41, { url: tab.url })
    for (let i = 0; i < 50; i++) await Promise.resolve()
    assert.equal(controller.list().length, 0)
    count = calls.length; await time.tick(6000)
    assert.equal(calls.length, count, 'blocked navigation cannot retain the cursor session')
  } finally { await controller.release(); globalThis.chrome = previous }
})
