/** Keep resolved skill instructions in model context, not in a visible user message. */
export async function publishSkillPromptContext(session, prompt, expandedPrompt, delivery) {
  if (!/^\/skill:[^\s]+(?:\s|$)/i.test(prompt) || expandedPrompt === prompt) return false;
  if (typeof session.sendCustomMessage !== 'function') throw new Error('This session cannot load hidden skill context.');
  await session.sendCustomMessage({
    customType: 'zyra_skill_context',
    display: false,
    content: expandedPrompt,
    details: { originalPrompt: prompt },
  }, delivery ? { deliverAs: delivery, ...(session.isStreaming ? {} : { triggerTurn: false }) } : { triggerTurn: false });
  return true;
}
