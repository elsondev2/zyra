import assert from 'node:assert/strict'
import { ensureBrowserControlToolState } from '../src/zyra-sdk.mjs'

function fakeSession(options = {}) {
  return {
    active: [...(options.active || ['read', 'bash'])],
    registered: options.registered !== false,
    getToolDefinition(name) {
      return this.registered && name === 'browser_control' ? { name } : undefined
    },
    getActiveToolNames() {
      return [...this.active]
    },
    setActiveToolsByName(names) {
      this.active = [...names]
    },
  }
}

const projected = fakeSession()
assert.equal(ensureBrowserControlToolState(projected, true), true)
assert.deepEqual(projected.getActiveToolNames(), ['read', 'bash', 'browser_control'])
assert.equal(ensureBrowserControlToolState(projected, true), false, 'already-active Browser control is idempotent')

const disabled = fakeSession()
assert.equal(ensureBrowserControlToolState(disabled, false), false)
assert.deepEqual(disabled.getActiveToolNames(), ['read', 'bash'])

assert.throws(
  () => ensureBrowserControlToolState(fakeSession({ registered: false }), true),
  /not registered with Pi/
)

console.log('Zyra Browser callable-tool projection passed.')
