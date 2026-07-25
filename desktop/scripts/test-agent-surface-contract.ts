import assert from 'node:assert/strict'
import { parseAgentSurfaceDescriptor } from '../src/shared/assistant/contracts'

const descriptor = parseAgentSurfaceDescriptor({
    version: 1,
    kind: 'command',
    lifecycle: 'running',
    phase: 'start',
    toolName: 'bash',
    toolKey: 'bash',
    primaryText: 'npm test',
    command: 'npm test',
    paths: [],
    summary: 'Running command'
})

assert.equal(descriptor?.kind, 'command')
assert.equal(descriptor?.command, 'npm test')
assert.equal(descriptor?.phase, 'start')
assert.equal(parseAgentSurfaceDescriptor({ ...descriptor, phase: 'finished' }), null)
assert.equal(parseAgentSurfaceDescriptor({ ...descriptor, version: 2 }), null)
assert.equal(parseAgentSurfaceDescriptor({ ...descriptor, paths: [42] }), null)

console.log('Desktop agent surface contract: ok')
