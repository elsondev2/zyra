import { deriveSessionTitleFromPrompt } from '../src/main/assistant/utils'
import assert from 'node:assert/strict'
import { mergeAssistantShellSnapshot } from '../src/renderer/src/lib/assistant/assistant-history-state'
const receipt = {id:'q', status:'resolved', responseMessageId:'m', questions:[{id:'choice'}], answers:{choice:'Yes'}}
const pending = {id:'pending', status:'pending'}
const message = {id:'m', role:'user', text:'Here are my answers:'}
const current:any = {sessions:[{id:'s',threads:[{id:'t',messages:[message],pendingUserInputs:[receipt,pending]}]}]}
const shell:any = {sessions:[{id:'s',threads:[{id:'t',hasPendingUserInputs:false}]}]}
const result = mergeAssistantShellSnapshot(current,shell)
assert.deepEqual(result.sessions[0].threads[0].pendingUserInputs,[receipt])
assert.deepEqual(result.sessions[0].threads[0].messages,[message])
assert.deepEqual(mergeAssistantShellSnapshot(result,shell).sessions[0].threads[0].pendingUserInputs,[receipt])
assert.equal(current.sessions[0].threads[0].pendingUserInputs.length,2)
console.log('PASS: resolved answer receipts survive repeated shell refreshes without reviving pending questions')

assert.equal(deriveSessionTitleFromPrompt('Hello\n\n<browser-context>{"source":"Zyra Chrome sidebar","targetId":"control-target:chrome-tab:abc"}</browser-context>'), 'Hello')
