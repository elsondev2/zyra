/** Presentation policy for server-assigned sender provenance, never message text.
 * Legacy explicit threads use stable thread-<sha256> run IDs; other agent runs
 * are supporting workers. Explicit persisted conversation intent takes priority.
 * The initial delegated task remains visible in the child's own transcript.
 */
export function isSupportingAgentMessage(value) {
  if (!value || typeof value !== 'object' || value.origin === 'delegation') return false;
  if (value.senderConversationKind === 'subagent') return true;
  if (value.senderConversationKind === 'thread') return false;
  const sender = typeof value.senderThreadId === 'string' ? value.senderThreadId : '';
  return sender.startsWith('agent-run:') && !/^agent-run:thread-[a-f0-9]{64}$/.test(sender);
}
