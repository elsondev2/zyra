// A canonical approval has one decision owner, even when several clients display it.
export class ApprovalResponses {
  constructor(pendingIds) { this.pendingIds = pendingIds; this.states = new Map(); }
  respond(clientId, payload, dispatch) {
    const id = String(payload?.requestId || '').trim();
    const decision = payload?.decision;
    const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
    if (!id || !['acceptOnce', 'acceptForSession', 'decline'].includes(decision)) {
      fail('AGENT_SERVER_APPROVAL_INVALID', 'Approval requires a request ID and a valid decision.');
    }
    const prior = this.states.get(id);
    if (prior) {
      if (prior.clientId !== clientId || prior.decision !== decision) {
        fail('AGENT_SERVER_APPROVAL_ALREADY_ANSWERED', 'This approval was already answered.');
      }
      return prior.promise;
    }
    if (!this.pendingIds.has(id)) fail('AGENT_SERVER_APPROVAL_UNKNOWN', 'This approval is no longer pending.');
    if (this.states.size >= 128) {
      for (const [key, state] of this.states) {
        if (state.settled) this.states.delete(key);
        if (this.states.size < 128) break;
      }
      if (this.states.size >= 128) fail('AGENT_SERVER_APPROVAL_BUSY', 'Too many approval decisions are in progress.');
    }
    const state = { clientId, decision, settled: false, promise: null };
    state.promise = Promise.resolve().then(dispatch).then(result => {
      state.settled = true; return result;
    }, error => {
      // An uncertain dispatch must never authorize a second, conflicting decision.
      state.settled = true; throw error;
    });
    this.states.set(id, state);
    return state.promise;
  }
}
