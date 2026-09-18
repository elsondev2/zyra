import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { AssistantQuestionResponseDialog } from '../src/renderer/src/pages/assistant/AssistantQuestionResponse'

const entry = { id: 'q1', header: 'Surface', question: 'Which surface should receive the change?', answer: 'Desktop and mobile.\nKeep the existing navigation.' }
const single = renderToStaticMarkup(<AssistantQuestionResponseDialog entries={[entry]} onClose={() => {}} />)
assert.match(single, /Your response/)
assert.match(single, /lucide-bot/)
assert.match(single, /w-\[min\(520px,calc\(100vw-32px\)\)\]/)
assert.doesNotMatch(single, /Response to agent question|1 answer|>Surface<|uppercase|rounded-full/)
assert.match(single, /data-assistant-full-question="true"[^>]*font-normal/)
assert.match(single, /data-assistant-full-answer="true"[^>]*bg-\[var\(--surface-hover\)\]/)
assert.match(single, /Your answer/)
assert.match(single, /Desktop and mobile\.\nKeep the existing navigation\./)
assert.doesNotMatch(single, /truncate[^>]*>Which|line-clamp/, 'full details remain untruncated')
const multiple = renderToStaticMarkup(<AssistantQuestionResponseDialog entries={[entry, { ...entry, id: 'q2', header: 'Checks', question: 'Run tests?', answer: 'Yes' }]} onClose={() => {}} />)
assert.match(multiple, /2 answers/)
assert.match(multiple, /1\. Surface/)
assert.match(multiple, /2\. Checks/)
assert.match(multiple, /Run tests\?/)
assert.equal((multiple.match(/data-assistant-answer-section="true"/g) || []).length, 2)
console.log('Full question-response dialog: passed')
