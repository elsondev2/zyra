import { createHash } from 'node:crypto';

const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };

/** One answering surface owns both resolution and its optional continuation.
 * Retry IDs from the phone are not permission to run a second canonical turn. */
export class UserInputResponses {
  constructor(pendingIds, resume) { this.pendingIds = pendingIds; this.resume = resume; this.states = new Map(); }
  respond(ownerClientId, payload, requestContext, dispatch, resume = this.resume) {
    const id = String(payload?.requestId || '').trim();
    if (!id) fail('AGENT_SERVER_USER_INPUT_INVALID', 'User-input responses require a request id.');
    const continues = payload.continue === true;
    if (continues && !requestContext?.turnId) fail('AGENT_SERVER_USER_INPUT_INVALID', 'Question continuation requires a durable turn id.');
    const hash = createHash('sha256').update(JSON.stringify(canonical({ answers: payload.answers || {}, cancelled: payload.cancelled === true, continues }))).digest('hex');
    const prior = this.states.get(id);
    if (prior) {
      if (prior.ownerClientId !== ownerClientId) fail('AGENT_SERVER_USER_INPUT_ALREADY_ANSWERED', 'This user-input request was already answered by another attached surface.');
      if (prior.hash !== hash) fail('AGENT_SERVER_USER_INPUT_ALREADY_ANSWERED', 'This question was already answered with a different response. Refresh the conversation.');
      return prior.promise;
    }
    if (!this.pendingIds.has(id)) fail('AGENT_SERVER_USER_INPUT_UNKNOWN', 'This question is no longer pending. Refresh the conversation.');
    for (const [key, state] of this.states) { if (this.states.size < 128) break; if (state.settled && !this.pendingIds.has(key)) this.states.delete(key); }
    if (this.states.size >= 128) fail('AGENT_SERVER_USER_INPUT_BUSY', 'Too many question responses are in progress.');
    const state = { ownerClientId, hash, settled: false, promise: null };
    state.promise = Promise.resolve().then(dispatch).then(async result => {
      if (!continues || payload.cancelled === true || result?.cancelled === true) return result;
      const prompt = typeof result?.continuationPrompt === 'string' ? result.continuationPrompt.trim() : '';
      if (!prompt) fail('AGENT_SERVER_USER_INPUT_CONTINUATION_UNAVAILABLE', 'The answer was received, but no continuation was returned. Open the conversation to continue.');
      await resume(prompt, requestContext);
      return { ...result, continuationPrompt: null, continuation: { state: 'completed', turnId: requestContext.turnId } };
    }).finally(() => { state.settled = true; });
    // Failed/uncertain continuations stay claimed. Replaying them could repeat
    // work already sent to the worker; the gateway persists this same rule.
    this.states.set(id, state);
    return state.promise;
  }
}
