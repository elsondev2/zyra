/** Provider errors may resolve the SDK turn; presentation must retain failure. */
export function agentEndOutcome(event) {
  const latest = Array.isArray(event.messages) ? event.messages.findLast(message => message?.role === 'assistant') : null;
  // Older providers emitted aborts as stopReason:error, and the old bridge
  // journaled outcome:failed. Classify the terminal evidence before replaying it.
  const errorMessage = event.errorMessage || latest?.errorMessage;
  const interrupted = ['aborted', 'cancelled', 'canceled', 'interrupted', 'stopped'].includes(latest?.stopReason)
    || /\b(?:abort(?:ed)?|cancel(?:led|ed)?|interrupt(?:ed)?)\b/i.test(String(errorMessage || ''));
  if (interrupted && (!event.outcome || event.outcome === 'failed' || event.outcome === 'interrupted')) {
    return { outcome: 'interrupted', ...(errorMessage ? { errorMessage } : {}) };
  }
  if (event.outcome) return { outcome: event.outcome, ...(event.errorMessage ? { errorMessage: event.errorMessage } : {}) };
  if (latest?.stopReason === 'error') return { outcome: 'failed', errorMessage: latest.errorMessage || 'Provider request failed.' };
  if (latest?.stopReason === 'aborted') return { outcome: 'interrupted', errorMessage: latest.errorMessage || 'The turn was interrupted.' };
  return { outcome: 'completed' };
}
