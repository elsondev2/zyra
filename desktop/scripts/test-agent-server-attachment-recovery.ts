import assert from 'node:assert/strict'
import { recoverAttachmentReplay } from '../src/main/assistant/agent-server-attachment-recovery'
const attention = { type: 'approval_requested', requestId: 'pending' }
const tool = { type: 'tool_execution_start', toolCallId: 'tool' }
const attachment = { latestSequence: 100, activeRequestContext: { turnId: 'turn' }, pendingAttention: [attention], pendingTools: [tool], liveMessage: { role: 'assistant', content: 'current' }, replay: [{ sequence: 100, event: { type: 'status' } }] }
const recovered = recoverAttachmentReplay(attachment, 2)
assert.deepEqual(recovered.entries.slice(1).map(entry => (entry.event as any).type), ['tool_execution_start', 'approval_requested', 'message_update'])
assert.equal(recovered.entries[1].requestContext?.turnId, 'turn')
assert.equal(recovered.resetWatermark, false)
assert.equal(recoverAttachmentReplay(attachment, 99).entries.length, 1, 'contiguous replay must not duplicate UI events')
assert.equal(recoverAttachmentReplay(attachment, 200).resetWatermark, true, 'a replaced journal must not strand a higher UI watermark')
const existing = recoverAttachmentReplay({ ...attachment, replay: [{ sequence: 99, event: attention }, { sequence: 100, event: { type: 'message_update', message: attachment.liveMessage } }] }, 2)
assert.equal(existing.entries.filter(entry => (entry.event as any).type === 'approval_requested').length, 1)
console.log('Desktop bounded replay recovery: passed')
