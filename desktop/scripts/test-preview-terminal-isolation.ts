import assert from 'node:assert/strict'
import { mock } from 'bun:test'

mock.module('electron', () => ({ app: {
    isPackaged: true,
    getPath() { throw new Error('Preview must not reach the stable launcher path') }
} }))
// Use the real identity policy with the same injected metadata as a packaged Preview.
const runtimeGlobals = globalThis as typeof globalThis & { __ZYRA_BUILD_METADATA__?: unknown }
runtimeGlobals.__ZYRA_BUILD_METADATA__ = {distribution:'preview', sourceSha:'a'.repeat(40), sourceRepository:'example/source', runId:'123'}
try {
    const { buildMetadata, canManageGlobalTerminalCommand } = await import('../src/shared/distribution-identity')
    assert.equal(buildMetadata.distribution, 'preview')
    assert.equal(canManageGlobalTerminalCommand(true), false)
    const { installTerminalCommand, removeTerminalCommand } = await import('../src/main/terminal-command-service')
    await assert.rejects(installTerminalCommand(), /Preview builds cannot replace/)
    await assert.rejects(removeTerminalCommand(), /Preview builds cannot remove/)
} finally {
    delete runtimeGlobals.__ZYRA_BUILD_METADATA__
}
console.log('Packaged preview launcher actions reject before resolving or mutating stable paths')
