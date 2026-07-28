import assert from 'node:assert/strict'
import { ensureBrowserControlToolState } from '../src/zyra-sdk.mjs'
import {
  applyBrowserLoaderOnlyState,
  BROWSER_LOADER_TOOL_NAME,
  BROWSER_TOOLSET_NAMES,
  createBrowserToolSet,
} from '../src/agent-control/browser-toolset.mjs'
import { BROWSER_CONTROL_OPERATIONS, browserControlSchema } from '../src/agent-control/tool-contracts.mjs'

function fakeSession(options = {}) {
  return {
    active: [...(options.active || ['read', 'bash', 'browser_control', ...BROWSER_TOOLSET_NAMES])],
    getActiveToolNames() {
      return [...this.active]
    },
    setActiveToolsByName(names) {
      this.active = [...names]
    },
  }
}

const projected = fakeSession()
assert.equal(ensureBrowserControlToolState(projected, true, applyBrowserLoaderOnlyState, BROWSER_TOOLSET_NAMES), true)
assert.deepEqual(projected.getActiveToolNames(), ['read', 'bash', BROWSER_LOADER_TOOL_NAME], 'fresh chats should see only the small Browser loader')
assert.equal(ensureBrowserControlToolState(projected, true, applyBrowserLoaderOnlyState, BROWSER_TOOLSET_NAMES), false, 'loader-only projection is idempotent')

const sessionRef = { current: projected }
const tools = createBrowserToolSet({ sessionRef })
const loader = tools.find((tool) => tool.name === BROWSER_LOADER_TOOL_NAME)
assert(loader, 'browser_use must be registered')
await loader.execute('tool-call:load', { action: 'load' })
assert.deepEqual(
  projected.getActiveToolNames().filter((name) => name.startsWith('browser_')),
  [BROWSER_LOADER_TOOL_NAME, ...BROWSER_TOOLSET_NAMES],
  'loading should activate the complete Browser tool set without the legacy schema'
)
assert(!projected.getActiveToolNames().includes('browser_control'))

const perform = tools.find((tool) => tool.name === 'browser_perform')
assert(perform?.parameters?.properties?.steps, 'loaded staged execution must publish a bounded steps schema')
assert.equal(perform.parameters.properties.steps.maxItems, 64)
const strokeVariant = perform.parameters.properties.steps.items.anyOf.find((entry) => entry.properties?.type?.const === 'stroke')
assert.equal(strokeVariant.properties.points.maxItems, 512, 'continuous strokes must remain bounded')

await loader.execute('tool-call:unload', { action: 'unload' })
assert.deepEqual(projected.getActiveToolNames(), ['read', 'bash', BROWSER_LOADER_TOOL_NAME])

const disabled = fakeSession()
assert.equal(ensureBrowserControlToolState(disabled, false, applyBrowserLoaderOnlyState, BROWSER_TOOLSET_NAMES), true)
assert.deepEqual(disabled.getActiveToolNames(), ['read', 'bash'])

for (const operation of ['reveal_tab', 'close_tab', 'refresh_tab', 'open_external', 'set_tab_layout', 'resize_inspector']) {
  assert(BROWSER_CONTROL_OPERATIONS.includes(operation), `${operation} must remain available through the inactive compatibility tool`)
}
assert(browserControlSchema.properties.primaryTargetId)
assert(browserControlSchema.properties.secondaryTargetId)
assert(browserControlSchema.properties.grantId)
assert(browserControlSchema.properties.width)

console.log('Zyra lazy Browser tool-set projection passed.')
