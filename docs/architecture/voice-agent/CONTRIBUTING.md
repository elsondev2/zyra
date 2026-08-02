# Contributing to the voice-agent architecture

This specification is intended for public discussion and implementation. Small, evidence-backed changes are easier to review than broad rewrites.

## Start here

1. Read the [architecture index](README.md) and [glossary](glossary.md).
2. Check the [ADRs](../../adr/) before reopening an accepted decision.
3. Identify whether your proposal changes a domain invariant, provider adapter, UI projection, or evaluation.
4. Open an issue or focused pull request with the template below.

## Proposal template

```markdown
## Problem
What observable failure, limitation, or missing capability exists?

## Scope
Which conversation/task/provider paths are affected?

## Contract change
What schema, state transition, interface, or invariant changes?

## Authority and privacy
Does this widen tools, permissions, retention, or model-visible context?

## Provider evidence
Link public documentation or describe a redacted reproducible interoperability test.

## Compatibility
How do older records/adapters/clients behave?

## Evaluation
Which deterministic and live scenarios prove the change?

## Rollback
How can the change be disabled without losing canonical data?
```

## Status labels

Use these exact labels:

- **Implemented foundation** — present in the current public Zyra runtime and covered by tests.
- **Documented provider behavior** — stated in a cited public provider source.
- **Experimentally verified** — observed through a reproducible, redacted interoperability test on a named version.
- **Proposed** — design decision awaiting implementation/evidence.
- **Unsupported** — capability probe or provider contract says it is unavailable.
- **Unknown** — no reliable evidence; do not infer support.

## Schemas

- Use JSON Schema Draft 2020-12.
- Persisted records require `schema_version`.
- Add or update a valid synthetic example.
- Test invalid, oversized, duplicate, stale, and unknown-version inputs.
- Preserve the verbatim request and active constraints through migrations.
- Do not add provider-specific fields to the core schema when an adapter can normalize them.

See [`schemas/README.md`](schemas/README.md).

## Mermaid diagrams

GitHub-rendered Mermaid is the canonical diagram source.

- Keep node labels concise and quote labels containing punctuation when needed.
- Pair color-independent shapes/labels with any visual styling.
- Keep diagrams readable in light and dark themes.
- Validate every Mermaid block with a current Mermaid CLI before merge.
- Update the surrounding prose; diagrams cannot be the only statement of an invariant.

## Provider adapters

A provider contribution must include:

- truthful adapter/client identity;
- authentication and billing path;
- capability discovery output;
- supported provider/version range;
- normalized event mapping;
- stop/retry/reconnect cleanup proof;
- usage mapping;
- schema/version failure behavior;
- deterministic fake coverage;
- redacted live interoperability evidence.

Generic OpenAI Realtime API behavior and subscription-backed Codex thread realtime are separate capability surfaces. Passing one suite does not imply the other.

## Security and privacy

Never commit:

- auth files, access/refresh tokens, API keys, cookies, SDP credentials, or provider headers;
- private `.zyra` sessions, memory, histories, raw exports, or account identifiers;
- microphone recordings or screenshots with personal content;
- copied/minified proprietary Desktop application code;
- raw provider captures containing user data;
- prompts that claim user approval or bypass capability policy.

Run the repository privacy check before publication. Use synthetic IDs, paths, messages, usage values, and artifacts in tests/docs.

Any proposal that widens foreground tools, retention, child delegation, speech eligibility, or control authority requires a threat-model update and adversarial tests.

## Prior-art and novelty claims

Prefer primary official sources. Record publisher, title, URL, and access date. State exactly which pattern a source demonstrates.

Do not claim that Zyra is the first voice agent, first supervisor, first multi-agent coding tool, or first background-task voice system. The project contribution is the complete open integration and its implementable contracts.

## Decision records

Create or amend an ADR when changing a load-bearing choice:

- canonical conversation identity;
- model-role topology;
- foreground capability boundary;
- task/ledger authority;
- narration ownership;
- continuity source of truth;
- permission/involvement separation.

A superseding ADR links the previous record and preserves history.

## Evaluation expectations

Every behavioral change names:

- narrow contract/unit tests;
- state/reducer or routing scenarios;
- security/privacy cases;
- recovery behavior;
- provider tests when applicable;
- accessibility impact;
- evidence and rollback.

Run `npm run test:voice-agent-contracts` for the machine-readable package. Live provider testing supplements deterministic tests. It does not replace them.

## Pull-request checklist

- [ ] Scope and status are explicit.
- [ ] Architecture index and cross-links are current.
- [ ] Mermaid blocks validate.
- [ ] JSON Schemas compile and examples validate.
- [ ] No broken relative links.
- [ ] Provider facts have primary-source citations and access dates.
- [ ] Proposals are not written as implemented behavior.
- [ ] Permission and involvement remain separate.
- [ ] Voice and agent-work usage remain separate.
- [ ] Privacy check and secret scan pass.
- [ ] Relevant focused tests pass.
- [ ] Migration and rollback are described.
- [ ] No private or proprietary material is included.

## Discussion principles

Challenge invariants with concrete failure cases and evidence. Preserve established terms. Prefer a small deep seam with a deterministic fake over speculative abstraction. Keep one primary execution path until a second proven adapter or workflow justifies more complexity.
