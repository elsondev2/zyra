import assert from 'node:assert/strict'
import { ensureBrowserControlToolState } from '../src/zyra-sdk.mjs'
import { BROWSER_CONTROL_OPERATIONS, browserControlSchema } from '../src/agent-control/tool-contracts.mjs'

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

for (const operation of ['reveal_tab', 'close_tab', 'refresh_tab', 'open_external', 'set_tab_layout', 'resize_inspector']) {
  assert(BROWSER_CONTROL_OPERATIONS.includes(operation), `${operation} must remain callable through browser_control`)
}
assert(browserControlSchema.properties.primaryTargetId, 'side-by-side Browser layout requires a primary target field')
assert(browserControlSchema.properties.secondaryTargetId, 'side-by-side Browser layout requires a secondary target field')
assert(browserControlSchema.properties.grantId, 'managed tab operations require a grant field')
assert(browserControlSchema.properties.width, 'Inspector resize requires a bounded width field')

console.log('Zyra Browser callable-tool projection passed.')
