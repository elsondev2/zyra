import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
    resolveAssistantUtilityTabContextTitle,
    resolveDiffWorkspaceTabContext,
    resolveFilesWorkspaceTabContext
} from '../src/renderer/src/pages/assistant/assistant-workspace-tab-context'

assert.deepEqual(resolveFilesWorkspaceTabContext(undefined, 'C:/project'), {
    label: 'Files',
    preview: 'Browse C:/project'
})
assert.deepEqual(resolveFilesWorkspaceTabContext({
    name: 'AGENTS.md',
    path: 'C:/project/AGENTS.md',
    extension: 'md',
    mode: 'edit',
    expanded: true
}, 'C:/project'), {
    label: 'AGENTS.md',
    preview: 'Files · AGENTS.md · Edit · Full screen'
})
assert.deepEqual(resolveDiffWorkspaceTabContext({ turnCount: 8 }), {
    label: 'Diff',
    preview: '8 turns · Search prompts, responses, files, and turn numbers'
})
assert.deepEqual(resolveDiffWorkspaceTabContext({
    turnCount: 8,
    turnNumber: 4,
    filePath: 'src/components/App.tsx'
}), {
    label: 'App.tsx',
    preview: 'Diff · Turn 4 · src/components/App.tsx'
})
assert.equal(resolveAssistantUtilityTabContextTitle('explorer', {
    version: 1,
    workspace: 'explorer',
    activePreview: { name: 'AGENTS.md', path: 'C:/project/AGENTS.md', extension: 'md' }
}, 'Files'), 'AGENTS.md')
assert.equal(resolveAssistantUtilityTabContextTitle('diff', {
    version: 1,
    workspace: 'diff',
    selectedDiff: { filePath: 'desktop/src/main/index.ts' }
}, 'Diff'), 'index.ts')
assert.equal(resolveAssistantUtilityTabContextTitle('terminal', undefined, 'Terminal'), 'Terminal')

const filesSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantFilesWorkspace.tsx', import.meta.url), 'utf8')
const modalSource = readFileSync(new URL('../src/renderer/src/components/ui/FilePreviewModal.tsx', import.meta.url), 'utf8')
const utilityWindowSource = readFileSync(new URL('../src/renderer/src/pages/assistant/utility/AssistantUtilityWindow.tsx', import.meta.url), 'utf8')
assert.match(filesSource, /\{preview\.previewFile \? \(/, 'inactive Files tabs retain the mounted preview instead of resetting it')
assert.match(filesSource, /active=\{active\}/, 'retained previews disable their global interactions while hidden')
assert.match(filesSource, /initialPresentation=/, 'utility Files tabs hydrate their exact preview presentation')
assert.match(modalSource, /if \(!active \|\| shellMode !== 'modal'\) return/, 'inactive retained previews do not keep the page scroll lock')
assert.match(modalSource, /if \(!active\) return null/, 'inactive retained previews remove their body portal while preserving component state')
assert.match(utilityWindowSource, /resolveAssistantUtilityTabContextTitle/, 'utility tab labels follow their latest bounded workspace capsule')

console.log('Assistant contextual workspace tabs: ok')
