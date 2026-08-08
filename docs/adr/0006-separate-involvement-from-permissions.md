# ADR-0006: Separate involvement preferences from permissions

- **Status:** Accepted design; implementation pending
- **Date:** 2026-08-02
- **Specification:** [Lifecycle and routing](../architecture/voice-agent/lifecycle-and-routing.md)

## Context

Users differ in how often they want to be consulted about design and scope. That preference is distinct from authorization for commands, writes, deployment, external side effects, desktop control, and other protected capabilities.

Combining the two could let an “autonomous” preference bypass safety policy or make a “collaborative” preference generate excessive low-value questions.

## Decision

Zyra models two independent controls:

1. **Involvement mode** determines when agents request user judgment. The default is Balanced. Future settings are Mostly autonomous, Balanced, Highly collaborative, and Tightly controlled.
2. **Permission policy** determines whether an action is authorized and which approval is required.

Balanced mode resolves routine, reversible, evidence-backed implementation choices and asks about meaningful product decisions, tradeoffs, scope, unresolved conflicts, and consequential intent.

A decision record grants no capability. A trusted-control approval resolution can issue a separate task/attempt/context/permission-epoch-bound lease but cannot choose ambiguous product intent. Every involvement mode receives the same permission checks.

## Consequences

### Benefits

- Users can tune collaboration without weakening safety.
- Decision prompts can be evaluated for usefulness.
- Approval records remain precise and auditable.
- Voice and text follow identical authorization rules.

### Costs

- UI and schemas must present two concepts clearly.
- Some flows require a decision followed by a separate approval.
- Speech can discuss/navigate to approvals, but the baseline requires an accessible trusted control to mint the scoped lease.

## Alternatives considered

### One autonomy slider controls both

Rejected because it conflates judgment delegation with capability authorization.

### Ask for every implementation choice

Rejected because it interrupts progress and shifts routine work back to the user.

### Let agents infer approval from conversational tone

Rejected because approval requires an unambiguous, scoped trusted record.

## Verification

- Protected-action tests require the same approvals in every involvement mode.
- Balanced scenario corpus asks only for meaningful unresolved choices.
- Decision resolution does not mint a capability lease.
- Approval scope change creates a new request.
