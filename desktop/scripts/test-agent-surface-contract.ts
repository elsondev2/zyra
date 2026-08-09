import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

const confirmModalSource = readFileSync(resolve(import.meta.dir, '../src/renderer/src/components/ui/ConfirmModal.tsx'), 'utf8')
assert.match(confirmModalSource, /role="dialog"[\s\S]{0,140}aria-modal="true"/, 'confirmation modals must expose dialog semantics')
assert.match(confirmModalSource, /checkboxLabel[\s\S]*?<\/div>[\s\S]*?<footer className="flex items-center justify-end/, 'optional confirmation preferences must sit above a separate action footer')
assert.match(confirmModalSource, /h-8 items-center justify-center whitespace-nowrap/, 'confirmation actions must remain compact and must not wrap into tall buttons')
assert.doesNotMatch(confirmModalSource, /sm:flex-row sm:items-center sm:justify-between/, 'confirmation preferences must not compete horizontally with actions')

console.log('Desktop agent surface contract: ok')
