import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = (file: string) => readFileSync(new URL(`../src/renderer/src/pages/assistant/${file}`, import.meta.url), 'utf8')
const page = source('AssistantPage.tsx')
const panel = source('AssistantDiffPanel.tsx')
assert.match(page, /const AssistantDiffPanel = lazy/)
assert.doesNotMatch(page, /import \{ AssistantDiffPanel,/, 'optional inspector dependencies must stay off the shell startup path')
assert.match(page, /<Suspense fallback=\{<AssistantInspectorLoading \/>\}>/, 'opening shows a lightweight pane until the workspace loads')
assert.match(panel, /const AssistantTurnReview = lazy/)
assert.doesNotMatch(panel, /import \{ AssistantTurnReview \} from/, 'heavy diff rendering must stay off the shell startup path')
assert.equal((panel.match(/<Suspense fallback=\{<PreviewContentSkeleton label="Opening turn"/g) || []).length, 2, 'both detailed review surfaces suspend inside the shell')
assert.match(panel, /const AssistantBrowserWorkspace = lazy/)
assert.match(panel, /const AssistantTerminalWorkspace = lazy/)
assert.match(panel, /const AssistantFilesWorkspace = lazy/)
assert.match(page, /inspectorMounted \|\| inspectorOpen/, 'opening stays mounted for quick repeated access')
console.log('Visible opening shell and isolated heavy workspace boundaries passed')
