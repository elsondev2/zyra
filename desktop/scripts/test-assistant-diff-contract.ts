import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { AssistantActivity } from '../src/shared/assistant/contracts'
import { resolveAssistantDiffTarget, type AssistantDiffTarget } from '../src/renderer/src/pages/assistant/assistant-diff-types'

const previewPatch = '--- a/src/live.ts\n+++ b/src/live.ts\n@@ -1 +1 @@\n-old\n+preview\n'
const resultPatch = '--- a/src/live.ts\n+++ b/src/live.ts\n@@ -1 +1 @@\n-old\n+final\n'
const target: AssistantDiffTarget = {
    activityId: 'zyra-tool-live-edit',
    filePath: 'src/live.ts',
    displayPath: 'src/live.ts',
    patch: previewPatch,
    provisional: true
}
const runningActivity: AssistantActivity = {
    id: target.activityId,
    kind: 'file-change',
    tone: 'tool',
    summary: 'Editing file',
    turnId: 'turn-live',
    createdAt: '2026-07-11T10:00:00.000Z',
    payload: {
        category: 'file-change',
        provider: 'pi',
        status: 'running',
        source: 'args-preview',
        revision: 1,
        authoritative: false,
        previewPatch,
        paths: [target.filePath]
    }
}
const liveTarget = resolveAssistantDiffTarget(target, runningActivity)
assert.match(liveTarget.patch, /^diff --git a\/src\/live\.ts b\/src\/live\.ts/)
assert.match(liveTarget.patch, /\+preview/)
assert.equal(liveTarget.provisional, true)

const completedActivity: AssistantActivity = {
    ...runningActivity,
    payload: {
        ...runningActivity.payload,
        status: 'completed',
        source: 'provider-result',
        revision: 2,
        authoritative: true,
        patch: resultPatch,
        changes: [{ path: target.filePath, kind: 'update', diff: resultPatch }]
    }
}
const refreshedTarget = resolveAssistantDiffTarget(target, completedActivity)
assert.equal(refreshedTarget.activityId, target.activityId)
assert.equal(refreshedTarget.filePath, target.filePath)
assert.match(refreshedTarget.patch, /\+final/, 'an open diff selection must consume the latest activity patch')
assert.equal(refreshedTarget.provisional, false, 'authoritative completion removes the live-preview state')

const legacyActivity: AssistantActivity = {
    ...completedActivity,
    id: 'legacy-file-change',
    payload: {
        patch: resultPatch,
        paths: [target.filePath],
        status: 'completed'
    }
}
const legacyTarget = resolveAssistantDiffTarget({ ...target, activityId: legacyActivity.id }, legacyActivity)
assert.match(legacyTarget.patch, /^diff --git a\/src\/live\.ts b\/src\/live\.ts/, 'legacy patch/path-only activities remain selectable')

const pageSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantPage.tsx', import.meta.url), 'utf8')
assert.equal(pageSource.includes('onViewDiff={handleViewDiff}'), true, 'mounted conversation pane must receive a real diff callback')
assert.equal(pageSource.includes('<AssistantDiffPanel'), true, 'the existing diff panel must be mounted in AssistantPage')
assert.equal(pageSource.includes('resolveAssistantDiffTarget(selectedDiffTarget, selectedDiffActivity)'), true, 'open selection must refresh from live store activity state')
assert.equal(pageSource.includes('onViewDiff={undefined}'), false)

const panelSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantDiffPanel.tsx', import.meta.url), 'utf8')
assert.equal(panelSource.includes('Live preview'), true)
assert.equal(panelSource.includes('selectedDiff?.provisional'), true)

console.log('Assistant mounted diff contract: ok')
