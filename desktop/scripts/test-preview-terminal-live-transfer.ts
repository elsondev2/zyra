import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isBrowserDevscopeBridgePath } from '../src/shared/browser-assistant-bridge'
import {
    PreviewTerminalWorkspaceRegistry,
    previewTerminalEventChannel
} from '../src/main/ipc/handlers/preview-terminal-workspace-registry'

const registry = new PreviewTerminalWorkspaceRegistry<{ id: number }>()
const source = registry.register(11, 'terminal-runtime:stable', { id: 11 })
const destination = registry.register(22, 'terminal-runtime:stable', { id: 22 })

const sourceScope = registry.resolve(11, source.capability)
const destinationScope = registry.resolve(22, destination.capability)
assert.equal(sourceScope.key, destinationScope.key, 'a transferred outer tab must resolve to the same PTY session scope')
assert.equal(sourceScope.runtimeId, 'terminal-runtime:stable')
assert.equal(destinationScope.runtimeId, 'terminal-runtime:stable')
assert.deepEqual(
    registry.bindingsForRuntime('terminal-runtime:stable').map((binding) => binding.senderId).sort(),
    [11, 22],
    'source and destination may overlap while the destination rehydrates'
)
assert.notEqual(
    previewTerminalEventChannel(source.capability),
    previewTerminalEventChannel(destination.capability),
    'each trusted renderer receives the shared output stream over its own capability channel'
)
assert.throws(
    () => registry.resolve(22, source.capability),
    /capability is unavailable/,
    'another renderer cannot reuse a capability issued to the source'
)
assert.throws(
    () => registry.resolve(11, 'terminal-capability:guessed'),
    /capability is unavailable/,
    'a guessed capability cannot select another terminal runtime'
)
assert.notEqual(
    registry.resolve(11).key,
    registry.resolve(22).key,
    'unscoped legacy callers retain sender-isolated fallback behavior'
)
assert.equal(isBrowserDevscopeBridgePath(['registerPreviewTerminalWorkspace']), false, 'remote pages cannot request a terminal capability through the bridge endpoint')
assert.equal(isBrowserDevscopeBridgePath(['releasePreviewTerminalWorkspace']), false, 'remote pages cannot mutate capability ownership through the bridge endpoint')
assert.equal(isBrowserDevscopeBridgePath(['createPreviewTerminal']), false, 'remote pages cannot create PTYs through the bridge endpoint')
assert.equal(isBrowserDevscopeBridgePath(['writePreviewTerminal']), false, 'remote pages cannot write to a terminal runtime through the bridge endpoint')
assert.equal(isBrowserDevscopeBridgePath(['assistantUtility', 'beginTearOff']), false, 'remote pages cannot manufacture a utility terminal tab with another runtime identity')
assert.equal(registry.release(22, source.capability), false, 'only the capability owner can release it')
assert.equal(registry.release(11, source.capability), true)
assert.deepEqual(registry.bindingsForRuntime('terminal-runtime:stable').map((binding) => binding.senderId), [22])

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const manager = read('../src/main/assistant/assistant-utility-window-manager.ts')
const host = read('../src/renderer/src/pages/assistant/utility/AssistantUtilityWorkspaceHost.tsx')
const panel = read('../src/renderer/src/pages/assistant/AssistantDiffPanel.tsx')
const liveAdapter = read('../src/renderer/src/lib/browser-devscope-live-adapter.ts')

assert.match(
    manager,
    /const ready = this\.waitForDestination\(tab, provisional\.id, provisionalWindow\)[\s\S]{0,300}await ready/,
    'standalone tear-off waits for destination terminal registration before source removal'
)
assert.match(host, /workspaceKey=\{terminalRuntimeId\}/, 'utility terminal UI state follows the stable outer tab runtime')
assert.match(host, /terminalOwner=\{\{ kind: 'utility-tab', tabId: tab\.id \}\}/, 'utility registration supplies only its owned tab identity')
assert.match(panel, /terminalRuntimeId: workspace === 'terminal' \? terminalRuntimeId/, 'main-to-utility transfer carries the existing runtime identity')
assert.match(panel, /setTerminalRuntimeId\(incoming\.terminalRuntimeId \|\| incoming\.id\)/, 'utility-to-main transfer restores the carried runtime identity')
assert.match(liveAdapter, /'registerPreviewTerminalWorkspace'[\s\S]{0,80}'releasePreviewTerminalWorkspace'/, 'remote Browser pages cannot invoke terminal capability registration through the live relay')

console.log('Preview terminal hybrid live transfer: ok')
