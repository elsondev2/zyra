import assert from 'node:assert/strict'
import type { AssistantMessage } from '../src/shared/assistant/contracts'
import { replaceSerializedAssistantImageAttachments } from '../src/shared/assistant/message-attachments'
import { buildAssistantDiffTurns } from '../src/renderer/src/pages/assistant/assistant-diff-turns'
import { buildAssistantResourceIndex } from '../src/renderer/src/pages/assistant/assistant-resource-index'
import type { AssistantDiffTurn } from '../src/renderer/src/pages/assistant/assistant-diff-types'

const clipboardPath = 'clipboard://1787066500944-o566ow-image.png'
const canonicalPath = 'C:\\workspace\\Zyra-test\\assistant\\canonical-media\\fixture-chat\\fixture-image.png'
const promptBody = 'the filter tags the resources should be there on demand'
const optimisticText = `${promptBody}\n\nAttached files (1):\n1. Pasted image [IMAGE]\nref: ${clipboardPath}\nmime: image/png\nsize: 3305 bytes\norigin: pasted from clipboard`
const staleCanonicalText = `${optimisticText}\n\nAttached files (1):\n2. Image 2 [IMAGE]\npath: ${canonicalPath}\nmime: image/png\nsize: 3305\norigin: Canonical Zyra transcript`
const duplicateTurn: AssistantDiffTurn = {
    id: 'turn:resource-duplicate',
    number: 1,
    state: 'completed',
    reviewStatus: 'latest',
    prompt: 'Please inspect this image.',
    promptAvailable: true,
    promptAttachments: [
        {
            id: 'pasted-image',
            name: 'Pasted image',
            displayName: 'Pasted image',
            type: 'IMAGE',
            path: clipboardPath,
            mime: 'image/png',
            size: '3305 bytes',
            preview: null,
            note: null,
            origin: 'pasted from clipboard; treat this as inline context only',
            content: 'data:image/png;base64,AAAA',
            isClipboard: true
        },
        {
            id: 'canonical-image',
            name: 'Image 2',
            displayName: 'Image 2',
            type: 'IMAGE',
            path: canonicalPath,
            mime: 'image/png',
            size: '3305',
            preview: null,
            note: null,
            origin: 'Canonical Zyra transcript',
            content: null,
            isClipboard: false
        }
    ],
    response: 'Done.',
    responseAvailable: true,
    historyUnavailable: false,
    searchText: '',
    createdAt: '2026-08-18T15:27:49.708Z',
    updatedAt: '2026-08-18T15:28:00.000Z',
    files: [],
    changes: [],
    additions: 0,
    deletions: 0
}

const index = buildAssistantResourceIndex({ turns: [duplicateTurn] })
assert.equal(index.resources.length, 1, 'clipboard and canonical-cache forms of one pasted image collapse into one Resource')
assert.equal(index.totalOccurrences, 1, 'the materialized canonical copy is not counted as a second occurrence')
assert.equal(index.resources[0]?.path?.replace(/\\/g, '/'), canonicalPath.replace(/\\/g, '/'), 'the retained Resource uses the durable canonical path')
assert.equal(index.resources[0]?.title, 'Pasted image', 'the retained Resource keeps the human attachment label')
assert.equal(index.resources[0]?.attachment?.content, 'data:image/png;base64,AAAA', 'inline preview data survives reconciliation')

const messages: AssistantMessage[] = [
    {
        id: 'assistant-message-local',
        role: 'user',
        text: optimisticText,
        turnId: null,
        streaming: false,
        createdAt: '2026-08-18T15:27:49.637Z',
        updatedAt: '2026-08-18T15:27:49.637Z'
    },
    {
        id: 'assistant-message-user-pi-message:user:1787066869708',
        role: 'user',
        text: staleCanonicalText,
        turnId: 'shared-turn:canonical:user:1787066869708',
        streaming: false,
        createdAt: '2026-08-18T15:27:49.708Z',
        updatedAt: '2026-08-18T15:27:49.708Z'
    },
    {
        id: 'assistant-message-pi-message:assistant:1787067556986',
        role: 'assistant',
        text: 'Updated the Resources filters.',
        turnId: 'shared-turn:canonical:user:1787066869708',
        streaming: false,
        createdAt: '2026-08-18T15:39:16.986Z',
        updatedAt: '2026-08-18T15:39:16.986Z'
    }
]
const reviewTurns = buildAssistantDiffTurns({
    messages,
    activities: [],
    turns: [{
        id: '304a3c95-f52e-4341-a275-15c52edb8f54',
        requestedAt: '2026-08-18T15:27:49.659Z',
        startedAt: '2026-08-18T15:27:49.659Z',
        completedAt: '2026-08-18T15:41:54.903Z'
    }]
})
assert.equal(reviewTurns.length, 1, 'optimistic and canonical image replay forms project as one Review turn')
assert.equal(reviewTurns[0]?.number, 1, 'the reconciled turn uses the persisted turn number')
assert.equal(reviewTurns[0]?.response, 'Updated the Resources filters.', 'the one Review turn retains its final response')
assert.equal(reviewTurns[0]?.historyUnavailable, false, 'no empty persisted shell remains beside the completed turn')

const canonicalProjectionText = replaceSerializedAssistantImageAttachments(
    `${optimisticText}\n\n2. notes.txt [TEXT]\npath: C:\\tmp\\notes.txt\nmime: text/plain\nsize: 20 bytes`,
    [`2. Image 2 [IMAGE]\npath: ${canonicalPath}\nmime: image/png\nsize: 3305\norigin: Canonical Zyra transcript`]
)
assert.doesNotMatch(canonicalProjectionText, /clipboard:\/\//, 'canonical projection removes the superseded clipboard image manifest')
assert.match(canonicalProjectionText, /notes\.txt \[TEXT\]/, 'canonical projection preserves unrelated non-image attachments')
assert.match(canonicalProjectionText, /1\. Pasted image \[IMAGE\]/, 'canonical projection keeps the original human attachment label')
assert.match(canonicalProjectionText, /canonical-media/, 'canonical projection retains the materialized image manifest')
assert.match(canonicalProjectionText, /Attached files \(2\):/, 'canonical projection reports the reconciled attachment count')

console.log('Assistant Resource and Review replay deduplication passed.')
