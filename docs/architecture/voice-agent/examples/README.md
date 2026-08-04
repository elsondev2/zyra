# Voice-agent contract examples

All examples use synthetic identifiers, paths, content, and usage values. The current fixture set covers Product Phase One. Product Phase Two fixtures begin at roadmap milestone 9 alongside its versioned schemas; the required scenario set is already normative in [Phase Two acceptance scenarios](../relationship-first-interaction.md#phase-two-acceptance-scenarios).

| Example | Schema |
|---|---|
| [`foreground-routes.json`](foreground-routes.json) | Each array entry validates against [`foreground-route.schema.json`](../schemas/foreground-route.schema.json) |
| [`legacy-migration-foreground-route.json`](legacy-migration-foreground-route.json) | [`foreground-route.schema.json`](../schemas/foreground-route.schema.json) |
| [`legacy-message-route-bindings.json`](legacy-message-route-bindings.json) | Each array entry validates against [`legacy-message-route-binding.schema.json`](../schemas/legacy-message-route-binding.schema.json) |
| [`legacy-source-session.jsonl`](legacy-source-session.jsonl) | Synthetic immutable source JSONL whose exact line hashes and ordered manifest are verified by the migration fixture |
| [`task.json`](task.json) | [`task.schema.json`](../schemas/task.schema.json) |
| [`task-events.json`](task-events.json) | Each array entry validates against [`task-event.schema.json`](../schemas/task-event.schema.json) |
| [`execution-attempt.json`](execution-attempt.json) | [`execution-attempt.schema.json`](../schemas/execution-attempt.schema.json) |
| [`attempt-events.json`](attempt-events.json) | Each array entry validates against [`attempt-event.schema.json`](../schemas/attempt-event.schema.json) |
| [`operation-intent.json`](operation-intent.json) | [`operation-intent.schema.json`](../schemas/operation-intent.schema.json) |
| [`canonical-message-operation-intent.json`](canonical-message-operation-intent.json) | [`operation-intent.schema.json`](../schemas/operation-intent.schema.json) |
| [`completion-candidate.json`](completion-candidate.json) | [`completion-candidate.schema.json`](../schemas/completion-candidate.schema.json) |
| [`context-revision.json`](context-revision.json) | [`context-revision.schema.json`](../schemas/context-revision.schema.json) |
| [`decision-request.json`](decision-request.json) | [`decision-request.schema.json`](../schemas/decision-request.schema.json) |
| [`approval-request.json`](approval-request.json) | [`approval-request.schema.json`](../schemas/approval-request.schema.json) |
| [`approval-request-resolved.json`](approval-request-resolved.json) | [`approval-request.schema.json`](../schemas/approval-request.schema.json) |
| [`approval-context-revision.json`](approval-context-revision.json) | [`context-revision.schema.json`](../schemas/context-revision.schema.json) |
| [`capability-lease.json`](capability-lease.json) | [`capability-lease.schema.json`](../schemas/capability-lease.schema.json) |
| [`capability-lease-consumed.json`](capability-lease-consumed.json) | [`capability-lease.schema.json`](../schemas/capability-lease.schema.json) |
| [`delegation-packet.json`](delegation-packet.json) | [`delegation-packet.schema.json`](../schemas/delegation-packet.schema.json) |
| [`resume-packet.json`](resume-packet.json) | [`resume-packet.schema.json`](../schemas/resume-packet.schema.json) v3 with exact conversation-message sequences, a complete operation revision index with terminal tombstones, task/current-attempt heads, and active writer-lock IDs |
| [`resume-delta.json`](resume-delta.json) | [`resume-delta.schema.json`](../schemas/resume-delta.schema.json) v3 with resulting authority projection |
| [`narration-item.json`](narration-item.json) | [`narration-item.schema.json`](../schemas/narration-item.schema.json) |
| [`narration-foreground-routes.json`](narration-foreground-routes.json) | Each array entry validates against [`foreground-route.schema.json`](../schemas/foreground-route.schema.json) — complete Chat-to-Voice history bound to narration delivery |
| [`narration-delivery.json`](narration-delivery.json) | [`narration-delivery.schema.json`](../schemas/narration-delivery.schema.json) |
| [`narration-delivery-revisions.json`](narration-delivery-revisions.json) | Each array entry validates against [`narration-delivery.schema.json`](../schemas/narration-delivery.schema.json) |
| [`usage-snapshot.json`](usage-snapshot.json) | [`usage-snapshot.schema.json`](../schemas/usage-snapshot.schema.json) |
| [`provider-capabilities.json`](provider-capabilities.json) | [`provider-capabilities.schema.json`](../schemas/provider-capabilities.schema.json) — realtime adapter |
| [`strong-provider-capabilities.json`](strong-provider-capabilities.json) | [`provider-capabilities.schema.json`](../schemas/provider-capabilities.schema.json) — strong-agent adapter |

The examples illustrate domain shape. They are not live account records, provider payloads, or production defaults.
