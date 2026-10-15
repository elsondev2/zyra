/** Keep resolved skill instructions in model context, not in a visible user message. */
export async function publishSkillPromptContext(session, prompt, expandedPrompt, delivery) {
  const invocation = String(prompt).match(/^\/skill:[^\s]+(?:\s+([\s\S]*))?$/i);
  if (!invocation || expandedPrompt === prompt) return false;
  const request = invocation[1]?.trim() || 'Start the skill workflow for the current request.';
  const suffix = `\n\nUser: ${request}`;
  if (!expandedPrompt.endsWith(suffix)) throw new Error('Resolved skill context has an unexpected request boundary.');
  const instructions = expandedPrompt.slice(0, -suffix.length);
  if (typeof session.sendCustomMessage !== 'function') throw new Error('This session cannot load hidden skill context.');
  await session.sendCustomMessage({
    customType: 'zyra_skill_context',
    display: false,
    content: instructions,
    details: { originalPrompt: prompt },
  }, delivery ? { deliverAs: delivery, ...(session.isStreaming ? {} : { triggerTurn: false }) } : { triggerTurn: false });
  return true;
}
