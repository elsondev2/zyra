import assert from 'node:assert/strict'
import { shouldApplyMonacoExternalValue } from '../src/renderer/src/components/ui/file-preview/monacoExternalValueSync'

function insertAt(value: string, offset: number, text: string): { value: string; offset: number } {
    return {
        value: `${value.slice(0, offset)}${text}${value.slice(offset)}`,
        offset: offset + text.length
    }
}

let model = 'forward text'
let cursor = 0
let local = insertAt(model, cursor, 'a')
model = local.value
cursor = local.offset
const delayedParentValue = model
local = insertAt(model, cursor, 'b')
model = local.value
cursor = local.offset
const latestLocalValue = model

const shouldApplyDelayedValue = shouldApplyMonacoExternalValue({
    currentValue: model,
    incomingValue: delayedParentValue,
    readOnly: false,
    modelPathChanged: false,
    lastLocallyEmittedValue: latestLocalValue
})
assert.equal(shouldApplyDelayedValue, false, 'a delayed React acknowledgement cannot replace a newer editable Monaco model')

if (shouldApplyDelayedValue) model = delayedParentValue
model = insertAt(model, cursor, 'c').value
assert.equal(model, 'abcforward text', 'rapid typing stays in order instead of moving into forward text')

assert.equal(shouldApplyMonacoExternalValue({
    currentValue: 'unsaved draft',
    incomingValue: 'reverted file',
    readOnly: false,
    modelPathChanged: false,
    lastLocallyEmittedValue: null
}), true, 'an intentional external update still reaches an idle editable model')
assert.equal(shouldApplyMonacoExternalValue({
    currentValue: 'old file',
    incomingValue: 'new file',
    readOnly: false,
    modelPathChanged: true,
    lastLocallyEmittedValue: 'old file'
}), true, 'switching Monaco models remains authoritative')
assert.equal(shouldApplyMonacoExternalValue({
    currentValue: 'old preview',
    incomingValue: 'new preview',
    readOnly: true,
    modelPathChanged: false,
    lastLocallyEmittedValue: 'old preview'
}), true, 'read-only previews continue following external content')

console.log('Monaco rapid input synchronization: ok')
