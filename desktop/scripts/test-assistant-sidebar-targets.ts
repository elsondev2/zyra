import assert from 'node:assert/strict'
import { acknowledgeAssistantInspectorNavigation, requestAssistantInspectorNavigation, subscribeAssistantInspectorNavigation, type AssistantInspectorNavigationRequest } from '../src/renderer/src/pages/assistant/assistant-inspector-navigation'
import { assistantImageDisplayName, assistantResourceForPath, assistantResourceCaption } from '../src/renderer/src/pages/assistant/assistant-resource-labels'
import { buildAssistantResourceIndex } from '../src/renderer/src/pages/assistant/assistant-resource-index'
import { openAssistantFileTarget } from '../src/renderer/src/pages/assistant/assistant-file-navigation'
import type { AssistantDiffTurn } from '../src/renderer/src/pages/assistant/assistant-diff-types'

const received: AssistantInspectorNavigationRequest[] = []
const closed = subscribeAssistantInspectorNavigation(request => received.push(request), false)
const first: AssistantInspectorNavigationRequest = { workspace: 'agents', agentRunId: 'agent-one' }
requestAssistantInspectorNavigation(first)
assert.equal(received.length, 0, 'a closed/restoring panel cannot consume its first target click')
closed()
const ready = subscribeAssistantInspectorNavigation(request => { received.push(request); acknowledgeAssistantInspectorNavigation(request) })
assert.deepEqual(received, [first], 'the exact agent target replays once when its panel becomes ready')
ready()
const duplicate = subscribeAssistantInspectorNavigation(request => received.push(request))
assert.equal(received.length, 1, 'an acknowledged target does not replay on subsequent renders')
duplicate()
requestAssistantInspectorNavigation({ workspace: 'resources' })
const newest: AssistantInspectorNavigationRequest = { workspace: 'agents', workflowRunId: 'workflow-two' }
requestAssistantInspectorNavigation(newest)
acknowledgeAssistantInspectorNavigation(first)
const newestOwner = subscribeAssistantInspectorNavigation(request => { assert.equal(request, newest); acknowledgeAssistantInspectorNavigation(request) })
newestOwner()

const storedName = '6dd38ad8c2619880226fce10.png'
const path = `C:/chat-media/${storedName}`
const turn = { id: 'turn-four', number: 4, state: 'completed', reviewStatus: 'latest', createdAt: '2026-01-01T00:00:00Z', prompt: `Inspect \`${path}\``, response: '', changes: [], files: [], promptAttachments: [
    { id: 'image-one', name: storedName, displayName: storedName, type: 'IMAGE', path, mime: 'image/png', isClipboard: false },
    { id: 'image-two', name: 'Pasted image', displayName: 'Pasted image', type: 'IMAGE', path: 'clipboard://second.png', mime: 'image/png', isClipboard: true },
] } as unknown as AssistantDiffTurn
const index = buildAssistantResourceIndex({ turns: [turn] })
assert.equal(index.resources.length, 2)
assert.equal(assistantResourceForPath(index.resources, path.toUpperCase().replaceAll('/', '\\'))?.title, 'Turn 4 · Attachment 1')
assert.equal(index.resources.find(resource => resource.attachment?.id === 'image-two')?.title, 'Turn 4 · Attachment 2')
assert.equal(turn.promptAttachments[0].name, storedName, 'display labels never rename stored attachments')
assert.equal(assistantResourceCaption(index.resources[0]), 'PNG · Attached', 'thumbnail captions show useful metadata instead of internal storage names')
assert.equal(assistantImageDisplayName('diagram-final.png', 4, 'attached'), 'diagram-final.png')
assert.equal(assistantImageDisplayName(storedName, 8, 'generated', 3), 'Turn 8 · Generated image 3')
const mentionedTurn = { ...turn, promptAttachments: [], prompt: `Inspect \`${path}\` and \`C:/chat-media/75bcf031a5275265908287d4.png\`.`, response: `Again: \`${path}\`` }
const mentioned = buildAssistantResourceIndex({ turns: [mentionedTurn] }).resources
assert.deepEqual(new Set(mentioned.map(resource => resource.title)), new Set(['Turn 4 · Image 1', 'Turn 4 · Image 2']), 'images mentioned in one turn have distinct stable display numbers')

const opens: unknown[] = []
Object.assign(globalThis, { window: { devscope: { getPathInfo: async (requestedPath: string) => ({ success: true, exists: true, type: 'file', path: requestedPath }) } } })
assert.equal(await openAssistantFileTarget({ target: 'C:/project/source.ts:37', openPreview: async (...args) => { opens.push(args) }, previewOptions: { displayName: 'Source', openNavigator: false, revealNavigatorTarget: false } }), true)
assert.equal(opens.length, 1, 'one file click opens one exact destination')
assert.deepEqual(opens[0], [{ name: 'source.ts', path: 'C:/project/source.ts' }, 'ts', { displayName: 'Source', openNavigator: false, revealNavigatorTarget: false, targetKind: 'file', focusLine: 37 }])
console.log('Sidebar targets: cold-panel replay, exact selection, attachment labels, preserved filenames, and direct file/line navigation passed.')
