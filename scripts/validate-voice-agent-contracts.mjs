import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = path.join(repositoryRoot, 'docs', 'architecture', 'voice-agent');
const schemaRoot = path.join(packageRoot, 'schemas');
const exampleRoot = path.join(packageRoot, 'examples');

const exampleSchemas = new Map([
  ['task.json', 'task.schema.json'],
  ['execution-attempt.json', 'execution-attempt.schema.json'],
  ['legacy-migration-foreground-route.json', 'foreground-route.schema.json'],
  ['operation-intent.json', 'operation-intent.schema.json'],
  ['canonical-message-operation-intent.json', 'operation-intent.schema.json'],
  ['completion-candidate.json', 'completion-candidate.schema.json'],
  ['context-revision.json', 'context-revision.schema.json'],
  ['decision-request.json', 'decision-request.schema.json'],
  ['approval-request.json', 'approval-request.schema.json'],
  ['approval-request-resolved.json', 'approval-request.schema.json'],
  ['approval-context-revision.json', 'context-revision.schema.json'],
  ['capability-lease.json', 'capability-lease.schema.json'],
  ['capability-lease-consumed.json', 'capability-lease.schema.json'],
  ['delegation-packet.json', 'delegation-packet.schema.json'],
  ['resume-packet.json', 'resume-packet.schema.json'],
  ['resume-delta.json', 'resume-delta.schema.json'],
  ['narration-item.json', 'narration-item.schema.json'],
  ['narration-delivery.json', 'narration-delivery.schema.json'],
  ['usage-snapshot.json', 'usage-snapshot.schema.json'],
  ['provider-capabilities.json', 'provider-capabilities.schema.json'],
  ['strong-provider-capabilities.json', 'provider-capabilities.schema.json'],
]);

const readJson = async (filename) => JSON.parse(await fs.readFile(filename, 'utf8'));
const clone = (value) => structuredClone(value);
const canonicalizeFixture = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalizeFixture).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalizeFixture(value[key])}`).join(',')}}`;
};

const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false, strictRequired: false });
addFormats(ajv);

const schemaFiles = (await fs.readdir(schemaRoot))
  .filter((name) => name.endsWith('.schema.json'))
  .sort();
const schemas = new Map();
for (const filename of schemaFiles) {
  const schema = await readJson(path.join(schemaRoot, filename));
  schemas.set(filename, schema);
  ajv.addSchema(schema);
}

const failures = [];
let rejectionCaseCount = 0;
const validate = (schemaFilename, value, label) => {
  const schema = schemas.get(schemaFilename);
  const validator = schema && ajv.getSchema(schema.$id);
  if (!validator) {
    failures.push(`${label}: no compiled validator for ${schemaFilename}`);
    return false;
  }
  if (validator(value)) return true;
  failures.push(`${label}: ${ajv.errorsText(validator.errors, { separator: '\n  ' })}`);
  return false;
};

for (const [exampleFilename, schemaFilename] of exampleSchemas) {
  const value = await readJson(path.join(exampleRoot, exampleFilename));
  validate(schemaFilename, value, exampleFilename);
}

const eventStream = await readJson(path.join(exampleRoot, 'task-events.json'));
for (const [index, event] of eventStream.entries()) {
  validate('task-event.schema.json', event, `task-events.json[${index}]`);
}
const attemptEventStream = await readJson(path.join(exampleRoot, 'attempt-events.json'));
for (const [index, event] of attemptEventStream.entries()) {
  validate('attempt-event.schema.json', event, `attempt-events.json[${index}]`);
}
const narrationDeliveryRevisions = await readJson(path.join(exampleRoot, 'narration-delivery-revisions.json'));
for (const [index, deliveryRevision] of narrationDeliveryRevisions.entries()) {
  validate('narration-delivery.schema.json', deliveryRevision, `narration-delivery-revisions.json[${index}]`);
}
const foregroundRoutes = await readJson(path.join(exampleRoot, 'foreground-routes.json'));
for (const [index, routeRevision] of foregroundRoutes.entries()) {
  validate('foreground-route.schema.json', routeRevision, `foreground-routes.json[${index}]`);
}
const narrationForegroundRoutes = await readJson(path.join(exampleRoot, 'narration-foreground-routes.json'));
for (const [index, routeRevision] of narrationForegroundRoutes.entries()) {
  validate('foreground-route.schema.json', routeRevision, `narration-foreground-routes.json[${index}]`);
}
const legacyMessageRouteBindings = await readJson(path.join(exampleRoot, 'legacy-message-route-bindings.json'));
const legacySourceText = await fs.readFile(path.join(exampleRoot, 'legacy-source-session.jsonl'), 'utf8');
const legacySourceLines = legacySourceText.split(/\r?\n/);
if (legacySourceLines.at(-1) === '') legacySourceLines.pop();
for (const [index, binding] of legacyMessageRouteBindings.entries()) {
  validate('legacy-message-route-binding.schema.json', binding, `legacy-message-route-bindings.json[${index}]`);
}

const jsonExamples = (await fs.readdir(exampleRoot))
  .filter((name) => name.endsWith('.json'))
  .sort();
const mappedExamples = new Set([
  ...exampleSchemas.keys(),
  'task-events.json',
  'attempt-events.json',
  'narration-delivery-revisions.json',
  'foreground-routes.json',
  'narration-foreground-routes.json',
  'legacy-message-route-bindings.json',
]);
for (const filename of jsonExamples) {
  if (!mappedExamples.has(filename)) failures.push(`${filename}: example has no schema mapping`);
}

const expectRejected = (schemaFilename, value, label) => {
  rejectionCaseCount += 1;
  const schema = schemas.get(schemaFilename);
  const validator = schema && ajv.getSchema(schema.$id);
  if (!validator) {
    failures.push(`${label}: no compiled validator for ${schemaFilename}`);
    return;
  }
  if (validator(value)) failures.push(`${label}: invalid mutation was accepted`);
};

const assertSemantic = (condition, label) => {
  if (!condition) failures.push(label);
};
const expectSemanticRejected = (errors, label) => {
  rejectionCaseCount += 1;
  if (errors.length === 0) failures.push(`${label}: invalid semantic mutation was accepted`);
};
const immutableFieldsMatch = (before, after, mutableFields) => {
  const beforeCopy = clone(before);
  const afterCopy = clone(after);
  for (const field of mutableFields) {
    delete beforeCopy[field];
    delete afterCopy[field];
  }
  return canonicalizeFixture(beforeCopy) === canonicalizeFixture(afterCopy);
};
const attemptTransitionErrors = (event) => {
  const errors = [];
  const stateTransitions = {
    'attempt.created': { previous: [null], resulting: 'created' },
    'attempt.queued': { previous: ['created'], resulting: 'queued' },
    'attempt.starting': { previous: ['queued'], resulting: 'starting' },
    'attempt.running': { previous: ['starting', 'parking'], resulting: 'running' },
    'attempt.parking': { previous: ['running'], resulting: 'parking' },
    'attempt.parked': { previous: ['parking'], resulting: 'parked' },
    'attempt.completed': { previous: ['running'], resulting: 'completed' },
    'attempt.failed': { previous: ['starting', 'running', 'parking'], resulting: 'failed' },
    'attempt.cancelled': { previous: ['created', 'queued', 'starting', 'running', 'parking'], resulting: 'cancelled' },
    'attempt.interrupted': { previous: ['running'], resulting: 'interrupted' },
  };
  const transition = stateTransitions[event.event_type];
  if (transition) {
    if (!transition.previous.includes(event.previous_state)) errors.push('illegal previous attempt state');
    if (event.resulting_state !== transition.resulting) errors.push('illegal resulting attempt state');
  } else if (['attempt.authority_updated', 'attempt.checkpointed'].includes(event.event_type)) {
    if (event.previous_state !== event.resulting_state) errors.push('authority/checkpoint event changed state');
  } else {
    errors.push('unknown attempt event');
  }
  for (const field of ['conversation_id', 'task_id', 'primary_agent_run_id', 'attempt_id', 'context_version']) {
    if (event[field] !== event.attempt[field]) errors.push(`${field} differs from attempt snapshot`);
  }
  if (event.resulting_state !== event.attempt.state) errors.push('resulting state differs from attempt snapshot');
  return errors;
};
const leaseAccountingErrors = (value) => {
  const errors = [];
  if (value.actions_used > value.max_actions) errors.push('actions_used exceeds max_actions');
  if (value.status === 'active' && value.actions_used >= value.max_actions) errors.push('active lease has no remaining action');
  if (value.status === 'consumed' && value.actions_used !== value.max_actions) errors.push('consumed lease count differs from max_actions');
  if (!/^[a-f0-9]{64}$/.test(value.action_hash)) errors.push('action hash is not lowercase SHA-256');
  return errors;
};
const foregroundRouteSetErrors = (routes) => {
  const errors = [];
  const byRoute = new Map();
  for (const route of routes) {
    const revisions = byRoute.get(route.foreground_route_id) ?? [];
    revisions.push(route);
    byRoute.set(route.foreground_route_id, revisions);
  }
  const latest = [];
  for (const [routeId, revisions] of byRoute) {
    revisions.sort((left, right) => left.revision - right.revision);
    if (revisions.length > 2) errors.push(`${routeId} has revisions after terminal state`);
    for (const [index, revision] of revisions.entries()) {
      if (revision.revision !== index + 1) errors.push(`${routeId} revisions are not contiguous`);
      if (revision.previous_revision !== (index === 0 ? null : index)) errors.push(`${routeId} has an invalid previous revision`);
      if (Date.parse(revision.created_at) > Date.parse(revision.updated_at)) errors.push(`${routeId} revision time precedes creation`);
      if (index === 0 && revision.status !== 'active') errors.push(`${routeId} does not begin active`);
      if (index > 0) {
        if (revisions[index - 1].status !== 'active' || !['superseded', 'released', 'failed'].includes(revision.status)) {
          errors.push(`${routeId} has an illegal status transition`);
        }
        if (revision.terminal_at !== revision.updated_at) errors.push(`${routeId} terminal time differs from its terminal revision`);
        if (Date.parse(revisions[index - 1].updated_at) > Date.parse(revision.updated_at)) errors.push(`${routeId} revision time moved backwards`);
        if (!immutableFieldsMatch(revisions[0], revision, ['revision', 'previous_revision', 'status', 'superseded_by_route_id', 'updated_at', 'terminal_at'])) {
          errors.push(`${routeId} changed immutable route fields`);
        }
      }
    }
    latest.push(revisions.at(-1));
  }
  const byConversation = new Map();
  for (const route of latest) {
    const conversationRoutes = byConversation.get(route.conversation_id) ?? [];
    conversationRoutes.push(route);
    byConversation.set(route.conversation_id, conversationRoutes);
  }
  for (const [conversationId, routesForConversation] of byConversation) {
    routesForConversation.sort((left, right) => left.route_epoch - right.route_epoch);
    const active = routesForConversation.filter((route) => route.status === 'active');
    if (active.length !== 1) errors.push(`${conversationId} does not have exactly one active foreground route`);
    const epochs = routesForConversation.map((route) => route.route_epoch);
    const expectedEpochs = [...Array(epochs.length)].map((_, index) => index + 1);
    if (canonicalizeFixture(epochs) !== canonicalizeFixture(expectedEpochs)) errors.push(`${conversationId} route epochs are not contiguous`);
    for (const [index, route] of routesForConversation.entries()) {
      if (index === 0) {
        if (route.surface_mode !== 'chat' || !['conversation_open', 'migration'].includes(route.activation_reason) || route.supersedes_route_id !== null) {
          errors.push(`${conversationId} does not begin with an initial Chat route`);
        }
        continue;
      }
      const predecessor = routesForConversation[index - 1];
      if (route.supersedes_route_id !== predecessor.foreground_route_id || predecessor.status !== 'superseded' || predecessor.superseded_by_route_id !== route.foreground_route_id) {
        errors.push(`${route.foreground_route_id} is not atomically linked to its predecessor`);
      }
      if (predecessor.terminal_at !== route.created_at) errors.push(`${route.foreground_route_id} overlaps or leaves a gap after its predecessor`);
      const legalReason =
        (route.activation_reason === 'start_voice' && predecessor.surface_mode === 'chat' && route.surface_mode === 'voice') ||
        (route.activation_reason === 'replace_voice_session' && predecessor.surface_mode === 'voice' && route.surface_mode === 'voice') ||
        (route.activation_reason === 'exit_voice' && predecessor.surface_mode === 'voice' && route.surface_mode === 'chat') ||
        (route.activation_reason === 'voice_preparation_failed' && route.surface_mode === 'chat') ||
        (route.activation_reason === 'recovery' && route.surface_mode === 'chat');
      if (!legalReason) errors.push(`${route.foreground_route_id} has an illegal predecessor/surface/activation-reason combination`);
    }
    for (const route of routesForConversation.filter((candidate) => candidate.status === 'superseded')) {
      const successor = routesForConversation.find((candidate) => candidate.foreground_route_id === route.superseded_by_route_id);
      if (!successor || successor.supersedes_route_id !== route.foreground_route_id || successor.route_epoch !== route.route_epoch + 1) {
        errors.push(`${route.foreground_route_id} has an incoherent successor`);
      }
    }
  }
  return errors;
};

assertSemantic(foregroundRouteSetErrors(foregroundRoutes).length === 0, 'foreground-route fixture violates exclusivity, revision, or handoff semantics');
const activeForegroundRoute = foregroundRoutes.find((route) => route.status === 'active' && route.surface_mode === 'voice');
const initialChatRoute = foregroundRoutes.find((route) => route.revision === 1 && route.surface_mode === 'chat');
const supersededChatRoute = foregroundRoutes.find((route) => route.status === 'superseded' && route.surface_mode === 'chat');
assertSemantic(
  activeForegroundRoute?.surface_mode === 'voice' &&
    activeForegroundRoute?.response_owner === 'realtime_foreground' &&
    supersededChatRoute?.surface_mode === 'chat' &&
    supersededChatRoute?.response_owner === 'strong_primary' &&
    supersededChatRoute?.superseded_by_route_id === activeForegroundRoute?.foreground_route_id &&
    activeForegroundRoute?.supersedes_route_id === supersededChatRoute?.foreground_route_id &&
    Date.parse(supersededChatRoute?.terminal_at) === Date.parse(activeForegroundRoute?.created_at),
  'foreground-route fixture does not represent an atomic Chat-to-Voice handoff',
);
const chatOwnedByRealtime = clone(foregroundRoutes[0]);
chatOwnedByRealtime.response_owner = 'realtime_foreground';
expectRejected('foreground-route.schema.json', chatOwnedByRealtime, 'negative: Chat route owned by realtime');
const voiceWithoutPhysicalSession = clone(activeForegroundRoute);
voiceWithoutPhysicalSession.realtime_session_id = null;
expectRejected('foreground-route.schema.json', voiceWithoutPhysicalSession, 'negative: active Voice route without physical session');
const recoveredVoiceRoute = clone(activeForegroundRoute);
recoveredVoiceRoute.activation_reason = 'recovery';
expectRejected('foreground-route.schema.json', recoveredVoiceRoute, 'negative: recovery directly activates Voice');
const replacementAfterChat = clone(foregroundRoutes);
replacementAfterChat.find((route) => route.surface_mode === 'voice').activation_reason = 'replace_voice_session';
expectSemanticRejected(foregroundRouteSetErrors(replacementAfterChat), 'negative: replace-Voice activation follows Chat');
const overlappingRouteHandoff = clone(foregroundRoutes);
const overlappingPredecessor = overlappingRouteHandoff.find((route) => route.status === 'superseded');
overlappingPredecessor.updated_at = '2026-08-02T12:04:01Z';
overlappingPredecessor.terminal_at = '2026-08-02T12:04:01Z';
expectSemanticRejected(foregroundRouteSetErrors(overlappingRouteHandoff), 'negative: foreground route ownership lifetimes overlap');
const duplicateActiveRoutes = clone(foregroundRoutes);
duplicateActiveRoutes[1].status = 'active';
duplicateActiveRoutes[1].superseded_by_route_id = null;
duplicateActiveRoutes[1].terminal_at = null;
expectSemanticRejected(foregroundRouteSetErrors(duplicateActiveRoutes), 'negative: concurrent Chat and Voice foreground owners');
const reactivatedTerminalRoute = clone(foregroundRoutes);
reactivatedTerminalRoute.push({
  ...clone(supersededChatRoute),
  revision: 3,
  previous_revision: 2,
  status: 'active',
  superseded_by_route_id: null,
  updated_at: '2026-08-02T12:04:01Z',
  terminal_at: null,
});
expectRejected('foreground-route.schema.json', reactivatedTerminalRoute.at(-1), 'negative: terminal foreground route record reactivated by schema');
expectSemanticRejected(foregroundRouteSetErrors(reactivatedTerminalRoute), 'negative: terminal foreground route reactivation');

const legacyMigrationRoute = await readJson(path.join(exampleRoot, 'legacy-migration-foreground-route.json'));
assertSemantic(foregroundRouteSetErrors([legacyMigrationRoute]).length === 0, 'legacy migration does not create one valid initial Chat route');
const legacyBindingErrors = (bindings, route) => {
  const errors = [];
  if (route.activation_reason !== 'migration' || route.surface_mode !== 'chat' || route.route_epoch !== 1) errors.push('legacy bindings do not target an initial migration Chat route');
  if (new Set(bindings.map((binding) => binding.message_id)).size !== bindings.length) errors.push('legacy message binding IDs are not unique');
  if (new Set(bindings.map((binding) => binding.source_sequence)).size !== bindings.length) errors.push('legacy source sequences are not unique');
  if (new Set(bindings.map((binding) => binding.migration_id)).size !== 1) errors.push('legacy bindings do not share one migration ID');
  if (new Set(bindings.map((binding) => binding.source_session_ref)).size !== 1) errors.push('legacy bindings do not share one source session');
  if (legacySourceLines.length !== bindings.length) errors.push('legacy bindings do not cover every source record exactly once');
  const manifestHashes = new Set(bindings.map((binding) => binding.migration_manifest_sha256));
  if (manifestHashes.size !== 1) errors.push('legacy bindings do not share one migration manifest');
  const ordered = [...bindings].sort((left, right) => left.source_sequence - right.source_sequence);
  const expectedSequences = [...Array(ordered.length)].map((_, index) => index + 1);
  if (canonicalizeFixture(ordered.map((binding) => binding.source_sequence)) !== canonicalizeFixture(expectedSequences)) errors.push('legacy source sequences are not contiguous');
  for (const binding of bindings) {
    if (binding.conversation_id !== route.conversation_id || binding.foreground_route_id !== route.foreground_route_id || binding.route_epoch !== route.route_epoch) errors.push(`${binding.binding_id} differs from migration route identity`);
    if (Date.parse(binding.message_created_at) < Date.parse(route.created_at) || Date.parse(binding.bound_at) < Date.parse(binding.message_created_at)) errors.push(`${binding.binding_id} has invalid source/binding time`);
    if (binding.role === 'assistant' && !binding.canonical_commit_receipt_id) errors.push(`${binding.binding_id} omits legacy assistant commit receipt`);
    if (binding.role === 'user' && binding.canonical_commit_receipt_id !== null) errors.push(`${binding.binding_id} gives a user message an assistant receipt`);
    const sourceLine = legacySourceLines[binding.source_sequence - 1];
    if (!sourceLine) continue;
    const sourceHash = createHash('sha256').update(sourceLine).digest('hex');
    if (sourceHash !== binding.source_record_sha256) errors.push(`${binding.binding_id} source record hash differs`);
    const sourceRecord = JSON.parse(sourceLine);
    for (const field of ['message_id', 'role', 'modality', 'created_at']) {
      const bindingField = field === 'created_at' ? 'message_created_at' : field;
      if (sourceRecord[field] !== binding[bindingField]) errors.push(`${binding.binding_id} source field ${field} differs`);
    }
  }
  const manifest = {
    migration_id: ordered[0]?.migration_id,
    source_session_ref: ordered[0]?.source_session_ref,
    records: ordered.map((binding) => ({ source_sequence: binding.source_sequence, source_record_sha256: binding.source_record_sha256 })),
  };
  const computedManifestHash = createHash('sha256').update(canonicalizeFixture(manifest)).digest('hex');
  if (manifestHashes.size === 1 && !manifestHashes.has(computedManifestHash)) errors.push('legacy migration manifest hash differs from ordered source records');
  return errors;
};
assertSemantic(legacyBindingErrors(legacyMessageRouteBindings, legacyMigrationRoute).length === 0, 'legacy message-route binding fixture is incoherent');
const legacyBindingWrongRoute = clone(legacyMessageRouteBindings);
legacyBindingWrongRoute[0].foreground_route_id = 'foreground_route_other';
expectSemanticRejected(legacyBindingErrors(legacyBindingWrongRoute, legacyMigrationRoute), 'negative: legacy message binding targets another route');
const legacyBindingWithFalseHash = clone(legacyMessageRouteBindings);
legacyBindingWithFalseHash[0].source_record_sha256 = 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd';
expectSemanticRejected(legacyBindingErrors(legacyBindingWithFalseHash, legacyMigrationRoute), 'negative: legacy source record hash is fabricated');
const legacyBindingWithFalseManifest = clone(legacyMessageRouteBindings);
legacyBindingWithFalseManifest[0].migration_manifest_sha256 = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
legacyBindingWithFalseManifest[1].migration_manifest_sha256 = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
expectSemanticRejected(legacyBindingErrors(legacyBindingWithFalseManifest, legacyMigrationRoute), 'negative: legacy migration manifest hash is fabricated');
const legacyAssistantWithoutReceipt = clone(legacyMessageRouteBindings[1]);
legacyAssistantWithoutReceipt.canonical_commit_receipt_id = null;
expectRejected('legacy-message-route-binding.schema.json', legacyAssistantWithoutReceipt, 'negative: legacy assistant binding omits migration receipt');

const task = await readJson(path.join(exampleRoot, 'task.json'));
const delegationPacket = await readJson(path.join(exampleRoot, 'delegation-packet.json'));
const proposedTask = eventStream.find((event) => event.event_type === 'task.proposed')?.payload?.task;
const finalTaskEvent = eventStream.at(-1);
const taskRevisions = eventStream.map((event) => event.task_revision);
const controllerSequences = [...eventStream, ...attemptEventStream].map((event) => event.sequence).sort((a, b) => a - b);
assertSemantic(
  canonicalizeFixture(taskRevisions) === canonicalizeFixture([...Array(eventStream.length)].map((_, index) => index + 1)),
  'task event revisions are not contiguous',
);
assertSemantic(
  canonicalizeFixture(controllerSequences) === canonicalizeFixture([...Array(controllerSequences.length)].map((_, index) => index + 1)),
  'task/attempt controller sequences are not one contiguous timeline',
);
const taskStartedEvent = eventStream.find((event) => event.event_type === 'task.started');
const runningAttemptEvent = attemptEventStream.find((event) => event.event_type === 'attempt.running');
assertSemantic(
  taskStartedEvent?.transaction_id === runningAttemptEvent?.transaction_id,
  'attempt.running and task.started are not bound to one controller transaction',
);
assertSemantic(task.revision === finalTaskEvent?.task_revision, 'task snapshot revision does not match final task event');
assertSemantic(finalTaskEvent?.event_type === 'task.completed' && task.state === 'completed', 'task snapshot terminal state does not match event stream');
assertSemantic(task.updated_at === finalTaskEvent?.occurred_at && task.terminal_at === finalTaskEvent?.occurred_at, 'task terminal timestamps do not match completion event');
for (const field of ['task_id', 'conversation_id', 'title', 'verbatim_request', 'created_at']) {
  assertSemantic(task[field] === proposedTask?.[field], `task snapshot changed immutable field ${field}`);
}
const proposedCriterionContract = proposedTask?.acceptance_criteria.map(({ criterion_id, description }) => ({ criterion_id, description }));
assertSemantic(
  canonicalizeFixture(task.acceptance_criteria.map(({ criterion_id, description }) => ({ criterion_id, description }))) ===
    canonicalizeFixture(proposedCriterionContract),
  'task snapshot acceptance criteria differ from proposed task',
);
const delegationWithoutRole = clone(delegationPacket);
delete delegationWithoutRole.requested_role;
expectRejected('delegation-packet.schema.json', delegationWithoutRole, 'negative: delegation omits requested role');
const queuedTaskEvent = eventStream.find((event) => event.event_type === 'task.queued');
assertSemantic(
  delegationPacket.conversation_id === proposedTask?.conversation_id &&
    delegationPacket.task_id === proposedTask?.task_id &&
    delegationPacket.task_revision === queuedTaskEvent?.task_revision &&
    delegationPacket.task_state === 'queued' &&
    delegationPacket.attempt_id === attemptEventStream.at(-1)?.attempt_id &&
    delegationPacket.required_context_version === proposedTask?.required_context_version &&
    delegationPacket.verbatim_request === proposedTask?.verbatim_request &&
    canonicalizeFixture(delegationPacket.acceptance_criteria) === canonicalizeFixture(proposedCriterionContract) &&
    canonicalizeFixture(delegationPacket.constraints.map(({ constraint_id }) => constraint_id)) === canonicalizeFixture(proposedTask?.constraint_ids),
  'delegation packet does not preserve the proposed task contract',
);
assertSemantic(
  canonicalizeFixture(task.constraint_ids) === canonicalizeFixture(proposedTask?.constraint_ids),
  'task snapshot constraints differ from proposed task',
);
const contextEvent = eventStream.find((event) => event.event_type === 'task.context_updated');
const progressEvent = eventStream.findLast((event) => event.event_type === 'task.progressed');
assertSemantic(
  canonicalizeFixture(task.context_acknowledgements) === canonicalizeFixture(contextEvent?.payload?.acknowledgements),
  'task snapshot context acknowledgements differ from event stream',
);
assertSemantic(
  task.activity?.kind === progressEvent?.payload?.kind &&
    task.activity?.summary === progressEvent?.payload?.summary &&
    task.activity?.updated_at === progressEvent?.occurred_at,
  'task snapshot activity differs from latest progress event',
);
const completionCandidate = await readJson(path.join(exampleRoot, 'completion-candidate.json'));
const verificationEvent = eventStream.find((event) => event.event_type === 'task.verification_started');
const terminalAttemptEvent = attemptEventStream.at(-1);
assertSemantic(
  terminalAttemptEvent.resulting_state === 'completed' &&
    terminalAttemptEvent.attempt.slot_lease.status === 'released' &&
    terminalAttemptEvent.attempt.writer_lock_ids.length === 0 &&
    terminalAttemptEvent.attempt.capability_lease_ids.length === 0 &&
    Date.parse(terminalAttemptEvent.attempt.terminal_at) <= Date.parse(verificationEvent?.occurred_at) &&
    verificationEvent?.sequence === terminalAttemptEvent.sequence + 1 &&
    verificationEvent?.transaction_id === terminalAttemptEvent.transaction_id &&
    task.current_attempt_id === null,
  'task verification begins before the attempt durably completes and releases authority',
);
assertSemantic(
  verificationEvent?.payload?.completion_candidate_id === completionCandidate.candidate_id &&
    verificationEvent?.payload?.completion_candidate_ref?.id === completionCandidate.candidate_id &&
    verificationEvent?.payload?.completion_candidate_ref?.kind === 'completion_candidate',
  'verification event does not reference the completion candidate',
);
for (const field of ['conversation_id', 'task_id', 'attempt_id', 'context_version']) {
  assertSemantic(completionCandidate[field] === verificationEvent?.[field], `completion candidate ${field} differs from verification event`);
}
assertSemantic(
  completionCandidate.primary_agent_run_id === verificationEvent?.agent_run_id,
  'completion candidate primary run differs from verification event',
);
assertSemantic(
  canonicalizeFixture(completionCandidate.acceptance_results.map(({ criterion_id }) => criterion_id)) ===
    canonicalizeFixture(finalTaskEvent?.payload?.criterion_ids),
  'completion candidate criteria differ from terminal event',
);
const completionWithoutTests = clone(completionCandidate);
delete completionWithoutTests.tests;
expectRejected('completion-candidate.schema.json', completionWithoutTests, 'negative: completion candidate omits tests');
assertSemantic(
  canonicalizeFixture(completionCandidate.context_acknowledgements) === canonicalizeFixture(task.context_acknowledgements),
  'completion candidate context acknowledgements differ from terminal task snapshot',
);
const runningWithoutAttempt = clone(task);
runningWithoutAttempt.state = 'running';
runningWithoutAttempt.current_attempt_id = null;
runningWithoutAttempt.terminal_at = null;
runningWithoutAttempt.acceptance_criteria[0].status = 'pending';
runningWithoutAttempt.acceptance_criteria[0].evidence_refs = [];
expectRejected('task.schema.json', runningWithoutAttempt, 'negative: running task without attempt');
const falseCompletion = clone(task);
falseCompletion.acceptance_criteria[0].status = 'pending';
falseCompletion.acceptance_criteria[0].evidence_refs = [];
expectRejected('task.schema.json', falseCompletion, 'negative: completion with pending criterion');

const attempt = await readJson(path.join(exampleRoot, 'execution-attempt.json'));
for (const [index, event] of attemptEventStream.entries()) {
  assertSemantic(attemptTransitionErrors(event).length === 0, `attempt event fixture ${index + 1} violates transition/identity semantics`);
  assertSemantic(
    event.attempt.updated_at === event.occurred_at && Date.parse(event.attempt.created_at) <= Date.parse(event.occurred_at),
    `attempt event fixture ${index + 1} has invalid created/updated time`,
  );
  if (index > 0) {
    assertSemantic(event.previous_state === attemptEventStream[index - 1].resulting_state, `attempt event fixture ${index + 1} breaks the transition chain`);
    assertSemantic(Date.parse(attemptEventStream[index - 1].occurred_at) <= Date.parse(event.occurred_at), `attempt event fixture ${index + 1} moves time backwards`);
  }
}
const attemptEvent = attemptEventStream.at(-1);
assertSemantic(
  canonicalizeFixture(attemptEvent.attempt) === canonicalizeFixture({ ...attempt, updated_at: attemptEvent.attempt.updated_at }),
  'attempt event fixture does not match its resulting attempt snapshot',
);
const illegalPreviousAttemptState = clone(attemptEvent);
illegalPreviousAttemptState.previous_state = 'created';
expectSemanticRejected(attemptTransitionErrors(illegalPreviousAttemptState), 'negative: illegal attempt transition');
const mismatchedAttemptIdentity = clone(attemptEvent);
mismatchedAttemptIdentity.task_id = 'task_other';
expectSemanticRejected(attemptTransitionErrors(mismatchedAttemptIdentity), 'negative: attempt event envelope/snapshot identity mismatch');
const authorityEventChangingState = clone(attemptEvent);
authorityEventChangingState.event_type = 'attempt.authority_updated';
expectSemanticRejected(attemptTransitionErrors(authorityEventChangingState), 'negative: authority-only attempt event changes state');
const mismatchedAttemptEvent = clone(attemptEvent);
mismatchedAttemptEvent.event_type = 'attempt.parked';
expectRejected('attempt-event.schema.json', mismatchedAttemptEvent, 'negative: attempt event type mismatches resulting state');
const runningAttempt = attemptEventStream.find((event) => event.resulting_state === 'running')?.attempt;
const parkedWithLock = clone(runningAttempt);
parkedWithLock.state = 'parked';
parkedWithLock.terminal_at = '2026-08-02T12:10:00Z';
parkedWithLock.checkpoint_ref = { kind: 'checkpoint', id: 'checkpoint_demo' };
expectRejected('execution-attempt.schema.json', parkedWithLock, 'negative: parked attempt with held slot/lock');

const contextRevision = await readJson(path.join(exampleRoot, 'context-revision.json'));
const inheritedApprovalGrant = clone(contextRevision);
inheritedApprovalGrant.changes[0].kind = 'approval.reference.updated';
inheritedApprovalGrant.changes[0].content = {
  approval_request_id: 'approval_push_branch',
  status: 'resolved',
  granted_capability: 'git.push',
};
expectRejected('context-revision.schema.json', inheritedApprovalGrant, 'negative: approval grant embedded in context');

const approval = await readJson(path.join(exampleRoot, 'approval-request.json'));
const approvalWithoutDeclineBehavior = clone(approval);
delete approvalWithoutDeclineBehavior.decline_behavior;
expectRejected('approval-request.schema.json', approvalWithoutDeclineBehavior, 'negative: approval omits decline behavior');
const resolvedWithoutResolution = clone(approval);
resolvedWithoutResolution.status = 'resolved';
resolvedWithoutResolution.terminal_at = '2026-08-02T12:07:00Z';
expectRejected('approval-request.schema.json', resolvedWithoutResolution, 'negative: resolved approval without resolution');

const resolvedApproval = await readJson(path.join(exampleRoot, 'approval-request-resolved.json'));
const approvalContextRevision = await readJson(path.join(exampleRoot, 'approval-context-revision.json'));
const lease = await readJson(path.join(exampleRoot, 'capability-lease.json'));
const consumedLease = await readJson(path.join(exampleRoot, 'capability-lease-consumed.json'));
const approvalHashPayload = {
  action: approval.action,
  capability: approval.capability,
  preconditions: approval.preconditions,
  scope: approval.scope,
};
const computedActionHash = createHash('sha256').update(canonicalizeFixture(approvalHashPayload)).digest('hex');
if (
  approval.action_hash !== computedActionHash ||
  lease.action_hash !== computedActionHash ||
  resolvedApproval.approval_request_id !== approval.approval_request_id ||
  resolvedApproval.previous_revision !== approval.revision ||
  resolvedApproval.revision !== approval.revision + 1 ||
  !immutableFieldsMatch(approval, resolvedApproval, ['revision', 'previous_revision', 'status', 'resolution', 'terminal_at']) ||
  resolvedApproval.action !== approval.action ||
  resolvedApproval.action_hash !== approval.action_hash ||
  resolvedApproval.resolution?.resolved_request_revision !== approval.revision ||
  !approval.allowed_decisions.includes(resolvedApproval.resolution?.decision) ||
  resolvedApproval.resolution?.authorization_channel !== 'trusted_control' ||
  resolvedApproval.resolution?.capability_lease_id !== lease.lease_id ||
  resolvedApproval.resolution?.resolved_context_version !== approval.context_version + 1 ||
  approvalContextRevision.parent_version !== approval.context_version ||
  approvalContextRevision.version !== resolvedApproval.resolution?.resolved_context_version ||
  approvalContextRevision.changes?.[0]?.content?.approval_request_id !== approval.approval_request_id ||
  approvalContextRevision.changes?.[0]?.content?.status !== 'resolved' ||
  resolvedApproval.resolution?.resolved_context_version !== lease.issued_context_version ||
  lease.approval_request_id !== approval.approval_request_id ||
  lease.capability !== approval.capability ||
  canonicalizeFixture(resolvedApproval.scope) !== canonicalizeFixture(approval.scope) ||
  canonicalizeFixture(resolvedApproval.preconditions) !== canonicalizeFixture(approval.preconditions) ||
  canonicalizeFixture(lease.scope) !== canonicalizeFixture(approval.scope) ||
  canonicalizeFixture(lease.preconditions) !== canonicalizeFixture(approval.preconditions) ||
  (resolvedApproval.resolution?.decision === 'accept_once' && lease.grant_mode !== 'once') ||
  (resolvedApproval.resolution?.decision === 'accept_for_session' && lease.grant_mode !== 'session') ||
  lease.max_actions > approval.requested_session_max_actions ||
  (Date.parse(lease.expires_at) - Date.parse(lease.issued_at)) / 1000 > approval.requested_lease_duration_seconds
) {
  failures.push('approval/capability-lease fixture binding does not match canonical action payload');
}
assertSemantic(leaseAccountingErrors(lease).length === 0, 'active capability lease violates action accounting');
assertSemantic(leaseAccountingErrors(consumedLease).length === 0, 'consumed capability lease violates action accounting');
assertSemantic(
  consumedLease.previous_revision === lease.revision &&
    consumedLease.revision === lease.revision + 1 &&
    immutableFieldsMatch(lease, consumedLease, ['revision', 'previous_revision', 'status', 'actions_used', 'terminal_at', 'terminal_reason']),
  'consumed capability lease revision changed immutable grant fields',
);
const overusedLease = clone(lease);
overusedLease.actions_used = overusedLease.max_actions + 1;
expectSemanticRejected(leaseAccountingErrors(overusedLease), 'negative: capability lease overuse');
const leaseWithoutEpoch = clone(lease);
delete leaseWithoutEpoch.permission_epoch;
expectRejected('capability-lease.schema.json', leaseWithoutEpoch, 'negative: capability lease without permission epoch');

const operation = await readJson(path.join(exampleRoot, 'operation-intent.json'));
const legacyOperation = clone(operation);
legacyOperation.schema_version = 1;
expectRejected('operation-intent.schema.json', legacyOperation, 'negative: v1 operation validated as v2 without migration');
if (
  operation.action_hash !== lease.action_hash ||
  operation.capability_lease_id !== lease.lease_id ||
  operation.attempt_id !== lease.attempt_id ||
  consumedLease.actions_used !== 1 ||
  consumedLease.terminal_at !== operation.terminal_at
) {
  failures.push('operation fixture is not bound to its capability lease');
}
const canonicalMessageOperation = await readJson(path.join(exampleRoot, 'canonical-message-operation-intent.json'));
const canonicalMessageBindingErrors = (value) => {
  const errors = [];
  if (value.conversation_id !== initialChatRoute.conversation_id) errors.push('canonical message operation conversation differs from route');
  if (value.foreground_route_id !== initialChatRoute.foreground_route_id) errors.push('canonical message operation route differs');
  if (value.foreground_route_epoch !== initialChatRoute.route_epoch) errors.push('canonical message operation epoch differs');
  if (value.foreground_owner_claim_id !== initialChatRoute.owner_claim_id) errors.push('canonical message operation owner claim differs');
  if (Date.parse(value.terminal_at) > Date.parse(supersededChatRoute.terminal_at)) errors.push('canonical message operation completed after route handoff');
  if (value.receipt?.result_ref?.kind !== 'message' || value.receipt?.result_ref?.id !== value.canonical_message_id) errors.push('canonical message receipt differs from message identity');
  return errors;
};
assertSemantic(canonicalMessageBindingErrors(canonicalMessageOperation).length === 0, 'canonical Chat message operation is not bound to its foreground route');
const canonicalOperationWithoutRouteClaim = clone(canonicalMessageOperation);
canonicalOperationWithoutRouteClaim.foreground_owner_claim_id = null;
expectRejected('operation-intent.schema.json', canonicalOperationWithoutRouteClaim, 'negative: canonical message operation without route claim');
const staleCanonicalMessageOperation = clone(canonicalMessageOperation);
staleCanonicalMessageOperation.foreground_route_epoch = activeForegroundRoute.route_epoch;
expectSemanticRejected(canonicalMessageBindingErrors(staleCanonicalMessageOperation), 'negative: canonical message operation uses stale/mismatched route epoch');

const unknownOperationWithReceipt = clone(operation);
unknownOperationWithReceipt.status = 'outcome_unknown';
unknownOperationWithReceipt.unknown_reason = 'The connection closed before reconciliation.';
expectRejected('operation-intent.schema.json', unknownOperationWithReceipt, 'negative: unknown operation with fabricated receipt');

const narration = await readJson(path.join(exampleRoot, 'narration-item.json'));
const narrationWithoutSafety = clone(narration);
delete narrationWithoutSafety.contains_sensitive_detail;
expectRejected('narration-item.schema.json', narrationWithoutSafety, 'negative: narration without redaction verdict');

assertSemantic(foregroundRouteSetErrors(narrationForegroundRoutes).length === 0, 'narration scenario does not have one valid Chat-to-Voice route history');
const narrationForegroundRoute = narrationForegroundRoutes.find((route) => route.status === 'active' && route.surface_mode === 'voice');
const narrationDeliveryBindingErrors = (value, route) => {
  const errors = [];
  if (route.surface_mode !== 'voice' || route.response_owner !== 'realtime_foreground') errors.push('narration route is not a Voice route');
  if (value.conversation_id !== route.conversation_id) errors.push('narration delivery conversation differs from route');
  if (value.foreground_route_id !== route.foreground_route_id) errors.push('narration delivery route ID differs');
  if (value.foreground_route_epoch !== route.route_epoch) errors.push('narration delivery route epoch differs');
  if (value.foreground_owner_claim_id !== route.owner_claim_id) errors.push('narration delivery owner claim differs');
  if (value.session_generation !== null && value.session_generation !== route.realtime_session_generation) errors.push('narration delivery physical generation differs');
  if (Date.parse(value.created_at) < Date.parse(route.created_at)) errors.push('narration delivery predates its route');
  if (route.terminal_at !== null && Date.parse(value.updated_at) >= Date.parse(route.terminal_at)) errors.push('narration delivery changed after its route lifetime');
  return errors;
};
const delivery = await readJson(path.join(exampleRoot, 'narration-delivery.json'));
const legacyDelivery = clone(delivery);
legacyDelivery.schema_version = 1;
expectRejected('narration-delivery.schema.json', legacyDelivery, 'negative: v1 narration delivery validated as v2 without migration');
const expectedDeliveryStates = ['prepared', 'speech_requested', 'speaking', 'completed'];
const narrationDeliveryChainErrors = (revisions) => {
  const errors = [];
  const terminal = new Set(['completed', 'interrupted', 'failed', 'suppressed', 'outcome_unknown']);
  for (const [index, revision] of revisions.entries()) {
    const predecessor = index === 0 ? null : revisions[index - 1];
    if (revision.revision !== index + 1 || revision.previous_revision !== (predecessor ? predecessor.revision : null)) errors.push('narration revisions are not contiguous');
    if (revision.previous_status !== (predecessor ? predecessor.status : null)) errors.push('narration previous status differs from predecessor');
    if (predecessor && terminal.has(predecessor.status)) errors.push('terminal narration delivery was reopened');
  }
  return errors;
};
assertSemantic(narrationDeliveryChainErrors(narrationDeliveryRevisions).length === 0, 'narration delivery fixture has an illegal state chain');
for (const [index, deliveryRevision] of narrationDeliveryRevisions.entries()) {
  assertSemantic(narrationDeliveryBindingErrors(deliveryRevision, narrationForegroundRoute).length === 0, `narration delivery revision ${index + 1} is not bound to active Voice`);
  assertSemantic(deliveryRevision.status === expectedDeliveryStates[index], `narration delivery revision ${index + 1} has an illegal state`);
  assertSemantic(deliveryRevision.revision === index + 1, `narration delivery revision ${index + 1} is not contiguous`);
  assertSemantic(deliveryRevision.previous_revision === (index === 0 ? null : index), `narration delivery revision ${index + 1} has the wrong predecessor`);
  assertSemantic(deliveryRevision.previous_status === (index === 0 ? null : expectedDeliveryStates[index - 1]), `narration delivery revision ${index + 1} has the wrong previous status`);
  if (index > 0) {
    assertSemantic(
      immutableFieldsMatch(narrationDeliveryRevisions[0], deliveryRevision, [
        'revision', 'previous_revision', 'previous_status', 'status', 'canonical_message_status', 'canonical_commit_receipt_id', 'speech_status',
        'session_generation', 'speech_request_id', 'provider_item_id', 'playback_ms',
        'final_text_sha256', 'watermark_sequence', 'updated_at', 'terminal_at',
      ]),
      `narration delivery revision ${index + 1} changed immutable identity`,
    );
  }
}
assertSemantic(
  canonicalizeFixture(delivery) === canonicalizeFixture(narrationDeliveryRevisions.at(-1)),
  'terminal narration delivery fixture differs from its revision chain',
);
const fixtureTextHash = createHash('sha256').update(narration.suggested_utterance).digest('hex');
if (
  delivery.narration_id !== narration.narration_id ||
  delivery.conversation_id !== narration.conversation_id ||
  delivery.source_event_id !== narration.source_event_id ||
  !narrationForegroundRoute.attached_task_ids.includes(narration.task_id) ||
  delivery.final_text_sha256 !== fixtureTextHash
) {
  failures.push('narration delivery fixture does not bind to the narration, active route task context, and utterance');
}
const preparedDirectlyCompleted = clone(delivery);
preparedDirectlyCompleted.revision = 2;
preparedDirectlyCompleted.previous_revision = 1;
preparedDirectlyCompleted.previous_status = 'prepared';
expectRejected('narration-delivery.schema.json', preparedDirectlyCompleted, 'negative: narration jumps directly from prepared to completed');
const reopenedNarrationDelivery = {
  ...clone(narrationDeliveryRevisions[2]),
  revision: 5,
  previous_revision: 4,
  previous_status: 'completed',
};
expectRejected('narration-delivery.schema.json', reopenedNarrationDelivery, 'negative: terminal narration delivery reopens as speaking');
expectSemanticRejected(narrationDeliveryChainErrors([...narrationDeliveryRevisions, reopenedNarrationDelivery]), 'negative: terminal narration delivery chain reopens');
const deliveryWithoutForegroundClaim = clone(delivery);
delete deliveryWithoutForegroundClaim.foreground_owner_claim_id;
expectRejected('narration-delivery.schema.json', deliveryWithoutForegroundClaim, 'negative: narration delivery without foreground owner claim');
const deliveryWithWrongClaim = clone(delivery);
deliveryWithWrongClaim.foreground_owner_claim_id = 'foreground_claim_stale';
expectSemanticRejected(narrationDeliveryBindingErrors(deliveryWithWrongClaim, narrationForegroundRoute), 'negative: narration delivery with stale foreground owner claim');
const deliveryWithWrongGeneration = clone(delivery);
deliveryWithWrongGeneration.session_generation += 1;
expectSemanticRejected(narrationDeliveryBindingErrors(deliveryWithWrongGeneration, narrationForegroundRoute), 'negative: narration delivery with wrong physical session generation');
const historicalNarrationRoute = {
  ...clone(narrationForegroundRoute),
  status: 'superseded',
  revision: 2,
  previous_revision: 1,
  superseded_by_route_id: 'foreground_route_chat_demo_03',
  updated_at: '2026-08-02T12:31:00Z',
  terminal_at: '2026-08-02T12:31:00Z',
};
assertSemantic(narrationDeliveryBindingErrors(delivery, historicalNarrationRoute).length === 0, 'completed narration is invalidated by a later route handoff');
const routeEndedDuringNarration = { ...clone(historicalNarrationRoute), updated_at: '2026-08-02T12:30:03Z', terminal_at: '2026-08-02T12:30:03Z' };
expectSemanticRejected(narrationDeliveryBindingErrors(delivery, routeEndedDuringNarration), 'negative: narration delivery completes after its Voice route ended');
const completedWithoutPhysicalIdentity = clone(delivery);
completedWithoutPhysicalIdentity.provider_item_id = null;
expectRejected('narration-delivery.schema.json', completedWithoutPhysicalIdentity, 'negative: completed speech omits provider item identity');
const completedWithoutMessage = clone(delivery);
completedWithoutMessage.canonical_message_status = 'pending';
expectRejected('narration-delivery.schema.json', completedWithoutMessage, 'negative: completed delivery without canonical commit');

const resumePacket = await readJson(path.join(exampleRoot, 'resume-packet.json'));
const legacyResumePacket = clone(resumePacket);
legacyResumePacket.schema_version = 1;
expectRejected('resume-packet.schema.json', legacyResumePacket, 'negative: v1 resume packet validated as v2 without regeneration');
assertSemantic(
  canonicalizeFixture(resumePacket.foreground_route) === canonicalizeFixture(activeForegroundRoute) &&
    resumePacket.source_watermarks.foreground_route_epoch === activeForegroundRoute.route_epoch &&
    activeForegroundRoute.attached_task_ids.includes(resumePacket.active_tasks[0]?.task_id) &&
    resumePacket.recent_verbatim_turns.some((turn) => turn.message_id === canonicalMessageOperation.canonical_message_id && turn.role === 'assistant') &&
    resumePacket.active_tasks[0]?.state === 'running' &&
    resumePacket.safety_state.primary_slot_attempt_id === resumePacket.active_tasks[0]?.current_attempt_id,
  'resume packet does not preserve active Voice ownership while the strong attempt continues',
);
const packetForHash = clone(resumePacket);
const expectedPacketHash = packetForHash.packet_integrity.canonical_sha256;
delete packetForHash.packet_integrity.canonical_sha256;
const computedPacketHash = createHash('sha256').update(canonicalizeFixture(packetForHash)).digest('hex');
if (expectedPacketHash !== computedPacketHash) failures.push('resume-packet fixture integrity hash is stale');
const resumeDelta = await readJson(path.join(exampleRoot, 'resume-delta.json'));
const legacyResumeDelta = clone(resumeDelta);
legacyResumeDelta.schema_version = 1;
expectRejected('resume-delta.schema.json', legacyResumeDelta, 'negative: v1 resume delta validated as v2 without regeneration');
const resumeAuthorityErrors = (packet, delta) => {
  const errors = [];
  const taskIds = packet.active_tasks.map((taskRecord) => taskRecord.task_id);
  const knownTaskIds = new Set(taskIds);
  for (const change of delta.changes.filter((candidate) => candidate.change_type === 'task_event')) {
    if (change.record.conversation_id !== packet.conversation_id) errors.push(`task event ${change.record.event_id} belongs to another conversation`);
    knownTaskIds.add(change.record.task_id);
  }
  if (new Set(taskIds).size !== taskIds.length) errors.push('resume packet repeats an active task ID');
  const runningTasks = packet.active_tasks.filter((taskRecord) => taskRecord.state === 'running');
  if (runningTasks.length > 1) errors.push('resume packet has more than one running strong-primary task');
  const slotAttemptId = packet.safety_state.primary_slot_attempt_id;
  if (runningTasks.length === 1 && runningTasks[0].current_attempt_id !== slotAttemptId) errors.push('running task differs from primary slot owner');
  if (runningTasks.length === 0 && slotAttemptId !== null) {
    const taskWithSlot = packet.active_tasks.find((taskRecord) => taskRecord.current_attempt_id === slotAttemptId);
    if (!taskWithSlot) errors.push('primary slot owner has no active task/attempt projection');
  }
  const writerLock = packet.safety_state.writer_lock;
  if (writerLock) {
    if (writerLock.attempt_id !== slotAttemptId) errors.push('writer lock differs from primary slot owner');
    const lockTask = packet.active_tasks.find((taskRecord) => taskRecord.task_id === writerLock.task_id);
    if (!lockTask || lockTask.current_attempt_id !== writerLock.attempt_id) errors.push('writer lock differs from active task attempt');
  }
  const attemptEvents = delta.changes.filter((change) => change.change_type === 'attempt_event').map((change) => change.record);
  const leaseChanges = delta.changes.filter((change) => change.change_type === 'capability_lease').map((change) => change.record);
  const contextChanges = delta.changes.filter((change) => change.change_type === 'context_revision').map((change) => change.record);
  for (const event of attemptEvents) {
    if (event.conversation_id !== packet.conversation_id || event.attempt.conversation_id !== packet.conversation_id) errors.push(`attempt event ${event.event_id} belongs to another conversation`);
    if (!knownTaskIds.has(event.task_id) || event.task_id !== event.attempt.task_id || event.attempt_id !== event.attempt.attempt_id) errors.push(`attempt event ${event.event_id} has unrelated task/attempt identity`);
  }
  for (const leaseRecord of leaseChanges) {
    if (leaseRecord.conversation_id !== packet.conversation_id || !knownTaskIds.has(leaseRecord.task_id)) errors.push(`capability lease ${leaseRecord.lease_id} belongs to another conversation/task`);
    if (leaseRecord.permission_epoch !== delta.safety_state.permission_epoch) errors.push(`capability lease ${leaseRecord.lease_id} permission epoch differs from safety state`);
  }
  for (const revision of contextChanges) {
    if (revision.conversation_id !== packet.conversation_id) errors.push(`context revision ${revision.revision_id} belongs to another conversation`);
  }
  const attemptWatermarkDelta = delta.to_watermarks.attempt_sequence - delta.from_watermarks.attempt_sequence;
  const leaseWatermarkDelta = delta.to_watermarks.capability_lease_sequence - delta.from_watermarks.capability_lease_sequence;
  if (attemptWatermarkDelta !== attemptEvents.length) errors.push('attempt watermark delta does not equal complete attempt-event count');
  if (leaseWatermarkDelta !== leaseChanges.length) errors.push('capability-lease watermark delta does not equal complete lease-revision count');
  const oldSlotAttemptId = packet.safety_state.primary_slot_attempt_id;
  const newSlotAttemptId = delta.safety_state.primary_slot_attempt_id;
  const slotChanged = oldSlotAttemptId !== newSlotAttemptId;
  const writerChanged = canonicalizeFixture(packet.safety_state.writer_lock) !== canonicalizeFixture(delta.safety_state.writer_lock);
  const leasesChanged = canonicalizeFixture(packet.safety_state.active_capability_lease_ids) !== canonicalizeFixture(delta.safety_state.active_capability_lease_ids);
  const policySafetyChanged =
    packet.safety_state.permission_epoch !== delta.safety_state.permission_epoch ||
    packet.safety_state.emergency_stop_active !== delta.safety_state.emergency_stop_active ||
    packet.safety_state.revocation_watermark !== delta.safety_state.revocation_watermark;
  if ((slotChanged || writerChanged) && attemptEvents.length === 0) errors.push('slot/writer authority changed without attempt events');
  if (leasesChanged && leaseChanges.length === 0) errors.push('active capability leases changed without lease records');
  if (policySafetyChanged && attemptEvents.length === 0 && leaseChanges.length === 0 && contextChanges.length === 0) errors.push('permission/revocation safety changed without canonical records');
  if (slotChanged) {
    let releaseIndex = -1;
    let acquireIndex = -1;
    if (oldSlotAttemptId !== null) {
      releaseIndex = attemptEvents.findIndex((event) =>
        event.attempt_id === oldSlotAttemptId &&
        event.attempt.slot_lease.status === 'released' &&
        event.attempt.writer_lock_ids.length === 0 &&
        event.attempt.capability_lease_ids.length === 0);
      if (releaseIndex < 0) errors.push('old primary slot attempt lacks complete release event');
    }
    if (newSlotAttemptId !== null) {
      acquireIndex = attemptEvents.findIndex((event) => event.attempt_id === newSlotAttemptId && event.attempt.slot_lease.status === 'acquired');
      if (acquireIndex < 0) errors.push('new primary slot attempt lacks acquisition event');
    }
    if (releaseIndex >= 0 && acquireIndex >= 0 && releaseIndex >= acquireIndex) errors.push('new primary slot was acquired before old authority released');
  }
  if (slotChanged || writerChanged) {
    const targetAttemptId = newSlotAttemptId ?? oldSlotAttemptId;
    const relevantAttemptEvents = attemptEvents.filter((event) => event.attempt_id === targetAttemptId);
    if (relevantAttemptEvents.length === 0) {
      errors.push('slot/writer authority change has no event for the affected attempt');
    } else {
      const latestAttempt = relevantAttemptEvents.at(-1).attempt;
      const expectedSlot = latestAttempt.slot_lease.status === 'acquired' ? latestAttempt.attempt_id : null;
      if (newSlotAttemptId !== expectedSlot) errors.push('delta safety slot differs from resulting attempt authority');
      const expectsWriter = latestAttempt.writer_lock_ids.length > 0;
      if (Boolean(delta.safety_state.writer_lock) !== expectsWriter) errors.push('delta writer-lock presence differs from resulting attempt snapshot');
      if (delta.safety_state.writer_lock) {
        if (delta.safety_state.writer_lock.attempt_id !== expectedSlot || delta.safety_state.writer_lock.task_id !== latestAttempt.task_id) errors.push('delta writer lock differs from resulting attempt authority');
      }
    }
  }
  const canonicalLeaseHeads = new Map([[lease.lease_id, lease]]);
  for (const leaseId of packet.safety_state.active_capability_lease_ids) {
    const priorLease = canonicalLeaseHeads.get(leaseId);
    if (!priorLease || priorLease.status !== 'active') {
      errors.push(`packet active lease ${leaseId} has no canonical active head`);
      continue;
    }
    if (priorLease.conversation_id !== packet.conversation_id || priorLease.attempt_id !== oldSlotAttemptId || !knownTaskIds.has(priorLease.task_id)) errors.push(`packet active lease ${leaseId} differs from slot task/attempt identity`);
  }
  const expectedActiveLeases = new Set(packet.safety_state.active_capability_lease_ids);
  for (const leaseRecord of leaseChanges) {
    const priorLease = canonicalLeaseHeads.get(leaseRecord.lease_id);
    if (priorLease) {
      if (
        leaseRecord.previous_revision !== priorLease.revision ||
        leaseRecord.revision !== priorLease.revision + 1 ||
        !immutableFieldsMatch(priorLease, leaseRecord, ['revision', 'previous_revision', 'status', 'actions_used', 'terminal_at', 'terminal_reason'])
      ) errors.push(`capability lease ${leaseRecord.lease_id} revision does not continue the same authority identity`);
    } else if (leaseRecord.revision !== 1 || leaseRecord.previous_revision !== null || leaseRecord.status !== 'active') {
      errors.push(`capability lease ${leaseRecord.lease_id} appears without a valid issuance revision`);
    }
    canonicalLeaseHeads.set(leaseRecord.lease_id, leaseRecord);
    if (leaseRecord.status === 'active') expectedActiveLeases.add(leaseRecord.lease_id);
    else expectedActiveLeases.delete(leaseRecord.lease_id);
  }
  const actualActiveLeases = [...delta.safety_state.active_capability_lease_ids].sort();
  if (canonicalizeFixture([...expectedActiveLeases].sort()) !== canonicalizeFixture(actualActiveLeases)) errors.push('delta active lease IDs differ from complete lease revisions');
  const activeSlotTaskId =
    attemptEvents.findLast((event) => event.attempt_id === newSlotAttemptId)?.task_id ??
    packet.active_tasks.find((taskRecord) => taskRecord.current_attempt_id === newSlotAttemptId)?.task_id ??
    null;
  for (const activeLeaseId of delta.safety_state.active_capability_lease_ids) {
    const activeLease = canonicalLeaseHeads.get(activeLeaseId);
    if (!activeLease || activeLease.status !== 'active') {
      errors.push(`delta active lease ${activeLeaseId} lacks an active canonical head`);
      continue;
    }
    if (
      activeLease.conversation_id !== packet.conversation_id ||
      activeLease.task_id !== activeSlotTaskId ||
      activeLease.attempt_id !== newSlotAttemptId ||
      activeLease.permission_epoch !== delta.safety_state.permission_epoch
    ) errors.push(`active lease ${activeLeaseId} differs from primary slot identity or permission epoch`);
  }
  return errors;
};
const resumeProjectionErrors = (packet, delta) => {
  const errors = [...resumeAuthorityErrors(packet, delta)];
  if (packet.foreground_route.conversation_id !== packet.conversation_id) errors.push('packet foreground route belongs to another conversation');
  if (packet.source_watermarks.foreground_route_epoch !== packet.foreground_route.route_epoch) errors.push('packet foreground route watermark differs from active epoch');
  if (delta.conversation_id !== packet.conversation_id) errors.push('delta conversation differs from packet');
  const routeChanges = delta.changes.filter((change) => change.change_type === 'foreground_route').map((change) => change.record);
  const combinedRouteHistory = [...clone(foregroundRoutes), clone(legacyMigrationRoute), ...clone(routeChanges)];
  const combinedRouteErrors = foregroundRouteSetErrors(combinedRouteHistory);
  for (const error of combinedRouteErrors) errors.push(`delta route history: ${error}`);
  const knownRoutes = new Map(
    combinedRouteHistory.map((route) => [`${route.foreground_route_id}:${route.route_epoch}`, route]),
  );
  for (const route of routeChanges) {
    if (route.conversation_id !== delta.conversation_id) errors.push(`delta foreground route ${route.foreground_route_id} belongs to another conversation`);
  }
  const fromEpoch = delta.from_watermarks.foreground_route_epoch;
  const toEpoch = delta.to_watermarks.foreground_route_epoch;
  if (toEpoch > fromEpoch) {
    if (routeChanges.length === 0 || Math.max(...routeChanges.map((route) => route.route_epoch)) !== toEpoch) {
      errors.push('foreground route watermark advanced without a matching route record');
    }
  } else if (routeChanges.length > 0) {
    errors.push('foreground route record present without advancing the route epoch');
  }
  const commitReceipts = new Map([
    [canonicalMessageOperation.receipt.receipt_id, {
      message_id: canonicalMessageOperation.canonical_message_id,
      route_id: canonicalMessageOperation.foreground_route_id,
      route_epoch: canonicalMessageOperation.foreground_route_epoch,
      owner_claim_id: canonicalMessageOperation.foreground_owner_claim_id,
      committed_at: canonicalMessageOperation.receipt.observed_at,
    }],
    [delivery.canonical_commit_receipt_id, {
      message_id: delivery.canonical_message_id,
      route_id: delivery.foreground_route_id,
      route_epoch: delivery.foreground_route_epoch,
      owner_claim_id: delivery.foreground_owner_claim_id,
      committed_at: delivery.updated_at,
    }],
  ]);
  for (const binding of legacyMessageRouteBindings.filter((record) => record.role === 'assistant')) {
    commitReceipts.set(binding.canonical_commit_receipt_id, {
      message_id: binding.message_id,
      route_id: binding.foreground_route_id,
      route_epoch: binding.route_epoch,
      owner_claim_id: legacyMigrationRoute.owner_claim_id,
      committed_at: binding.bound_at,
    });
  }
  for (const change of delta.changes) {
    if (change.change_type === 'operation_intent' && change.record.operation_class === 'canonical_message_commit' && change.record.receipt) {
      commitReceipts.set(change.record.receipt.receipt_id, {
        message_id: change.record.canonical_message_id,
        route_id: change.record.foreground_route_id,
        route_epoch: change.record.foreground_route_epoch,
        owner_claim_id: change.record.foreground_owner_claim_id,
        committed_at: change.record.receipt.observed_at,
      });
    }
    if (change.change_type === 'narration_delivery' && change.record.canonical_commit_receipt_id) {
      commitReceipts.set(change.record.canonical_commit_receipt_id, {
        message_id: change.record.canonical_message_id,
        route_id: change.record.foreground_route_id,
        route_epoch: change.record.foreground_route_epoch,
        owner_claim_id: change.record.foreground_owner_claim_id,
        committed_at: change.record.updated_at,
      });
    }
  }
  const validateMessage = (message, conversationId, label) => {
    const route = knownRoutes.get(`${message.foreground_route_id}:${message.route_epoch}`);
    if (!route || route.conversation_id !== conversationId) {
      errors.push(`${label} ${message.message_id} has unknown/foreign route identity`);
      return;
    }
    const activeAt = (timestamp) =>
      Date.parse(timestamp) >= Date.parse(route.created_at) &&
      (route.terminal_at === null || Date.parse(timestamp) < Date.parse(route.terminal_at));
    if (message.role === 'user') {
      if (!activeAt(message.created_at)) errors.push(`${label} ${message.message_id} was accepted outside its route lifetime`);
      return;
    }
    const receipt = commitReceipts.get(message.canonical_commit_receipt_id);
    if (!receipt) {
      errors.push(`${label} ${message.message_id} has no canonical commit receipt`);
      return;
    }
    if (
      receipt.message_id !== message.message_id ||
      receipt.route_id !== message.foreground_route_id ||
      receipt.route_epoch !== message.route_epoch ||
      receipt.owner_claim_id !== route.owner_claim_id
    ) errors.push(`${label} ${message.message_id} receipt does not bind its route/message identity`);
    if (!activeAt(receipt.committed_at)) errors.push(`${label} ${message.message_id} committed outside its route lifetime`);
    if (Date.parse(message.created_at) > Date.parse(receipt.committed_at)) errors.push(`${label} ${message.message_id} timestamp follows its commit receipt`);
  };
  for (const turn of packet.recent_verbatim_turns) validateMessage(turn, packet.conversation_id, 'packet message');
  for (const change of delta.changes.filter((candidate) => candidate.change_type === 'conversation_message')) {
    validateMessage(change.record, delta.conversation_id, 'delta message');
  }
  return errors;
};
const legacyPacketProjection = {
  ...clone(resumePacket),
  packet_id: 'packet_legacy_projection_01',
  conversation_id: legacyMigrationRoute.conversation_id,
  context_version: 0,
  source_watermarks: {
    conversation_sequence: 2,
    foreground_route_epoch: 1,
    task_sequence: 0,
    attempt_sequence: 0,
    context_sequence: 0,
    decision_sequence: 0,
    approval_sequence: 0,
    capability_lease_sequence: 0,
    operation_sequence: 0,
    agent_checkpoint_sequence: 0,
    narration_delivery_sequence: 0,
  },
  foreground_route: clone(legacyMigrationRoute),
  current_focus: null,
  pending_user_items: [],
  active_tasks: [],
  constraints: [],
  decisions: [],
  recent_verbatim_turns: legacyMessageRouteBindings.map((binding) => {
    const source = JSON.parse(legacySourceLines[binding.source_sequence - 1]);
    return {
      message_id: binding.message_id,
      role: binding.role,
      modality: binding.modality,
      foreground_route_id: binding.foreground_route_id,
      route_epoch: binding.route_epoch,
      canonical_commit_receipt_id: binding.canonical_commit_receipt_id,
      content: source.content,
      created_at: binding.message_created_at,
    };
  }),
  retrieval_refs: [],
  safety_state: {
    permission_epoch: 0,
    emergency_stop_active: false,
    active_capability_lease_ids: [],
    revocation_watermark: 0,
    primary_slot_attempt_id: null,
    writer_lock: null,
  },
  narration_watermark: { terminal_sequence: 0, pending_delivery_ids: [], unknown_outcome_delivery_ids: [] },
  usage_summary: null,
  generated_at: '2026-08-02T13:00:00Z',
  packet_integrity: {
    critical_records_complete: true,
    canonical_sha256: resumePacket.packet_integrity.canonical_sha256,
    stale_after: '2026-08-02T13:05:00Z',
  },
};
const legacyPacketForHash = clone(legacyPacketProjection);
delete legacyPacketForHash.packet_integrity.canonical_sha256;
legacyPacketProjection.packet_integrity.canonical_sha256 = createHash('sha256').update(canonicalizeFixture(legacyPacketForHash)).digest('hex');
const legacyDeltaProjection = {
  ...clone(resumeDelta),
  delta_id: 'delta_legacy_projection_01',
  conversation_id: legacyMigrationRoute.conversation_id,
  base_packet_id: legacyPacketProjection.packet_id,
  from_context_version: 0,
  to_context_version: 0,
  from_watermarks: clone(legacyPacketProjection.source_watermarks),
  to_watermarks: { ...clone(legacyPacketProjection.source_watermarks), conversation_sequence: 3 },
  changes: [{
    change_type: 'conversation_message',
    record: {
      message_id: 'message_legacy_user_03',
      role: 'user',
      modality: 'text',
      foreground_route_id: legacyMigrationRoute.foreground_route_id,
      route_epoch: 1,
      canonical_commit_receipt_id: null,
      content: 'Continue in the migrated chat.',
      created_at: '2026-08-02T13:01:00Z',
    },
  }],
  safety_state: clone(legacyPacketProjection.safety_state),
  generated_at: '2026-08-02T13:01:00Z',
};
const legacyDeltaForHash = clone(legacyDeltaProjection);
delete legacyDeltaForHash.canonical_sha256;
legacyDeltaProjection.canonical_sha256 = createHash('sha256').update(canonicalizeFixture(legacyDeltaForHash)).digest('hex');
validate('resume-packet.schema.json', legacyPacketProjection, 'synthetic legacy resume packet');
validate('resume-delta.schema.json', legacyDeltaProjection, 'synthetic legacy resume delta');
assertSemantic(resumeProjectionErrors(legacyPacketProjection, legacyDeltaProjection).length === 0, 'verified legacy message bindings do not satisfy resume v2 route/receipt validation');
assertSemantic(resumeProjectionErrors(resumePacket, resumeDelta).length === 0, 'resume packet/delta foreground ownership is incoherent');
const foreignRoutePacket = clone(resumePacket);
foreignRoutePacket.foreground_route.conversation_id = 'chat_other';
expectSemanticRejected(resumeProjectionErrors(foreignRoutePacket, resumeDelta), 'negative: resume packet with foreign foreground route');
const multipleRunningTasksPacket = clone(resumePacket);
multipleRunningTasksPacket.active_tasks.push({
  ...clone(multipleRunningTasksPacket.active_tasks[0]),
  task_id: 'task_resume_other',
  current_attempt_id: 'attempt_resume_other',
  primary_agent_run_id: 'agent_run_resume_other',
});
expectRejected('resume-packet.schema.json', multipleRunningTasksPacket, 'negative: resume packet contains two running strong-primary tasks');
expectSemanticRejected(resumeAuthorityErrors(multipleRunningTasksPacket, resumeDelta), 'negative: multiple running tasks contradict one primary slot');
const mismatchedSlotPacket = clone(resumePacket);
mismatchedSlotPacket.safety_state.primary_slot_attempt_id = 'attempt_resume_other';
expectSemanticRejected(resumeAuthorityErrors(mismatchedSlotPacket, resumeDelta), 'negative: running task differs from canonical primary slot');
const unprovenSafetyDelta = clone(resumeDelta);
unprovenSafetyDelta.safety_state.primary_slot_attempt_id = 'attempt_resume_other';
unprovenSafetyDelta.safety_state.writer_lock.attempt_id = 'attempt_resume_other';
expectSemanticRejected(resumeAuthorityErrors(resumePacket, unprovenSafetyDelta), 'negative: safety slot changes without attempt event/watermark');
const unrelatedAttemptAuthorityDelta = clone(resumeDelta);
unrelatedAttemptAuthorityDelta.to_watermarks.attempt_sequence += 1;
unrelatedAttemptAuthorityDelta.changes.push({ change_type: 'attempt_event', record: clone(runningAttemptEvent) });
unrelatedAttemptAuthorityDelta.safety_state.primary_slot_attempt_id = runningAttemptEvent.attempt_id;
unrelatedAttemptAuthorityDelta.safety_state.writer_lock = { task_id: runningAttemptEvent.task_id, attempt_id: runningAttemptEvent.attempt_id, scope: 'unrelated scope' };
expectSemanticRejected(resumeAuthorityErrors(resumePacket, unrelatedAttemptAuthorityDelta), 'negative: unrelated attempt event changes resume authority');
const incompleteSlotHandoffDelta = clone(resumeDelta);
const acquiredReplacementAttempt = clone(runningAttemptEvent);
acquiredReplacementAttempt.event_id = 'attempt_event_resume_replacement_running';
acquiredReplacementAttempt.transaction_id = 'tx_resume_replacement';
acquiredReplacementAttempt.conversation_id = 'chat_resume_demo';
acquiredReplacementAttempt.task_id = 'task_resume_voice_docs';
acquiredReplacementAttempt.primary_agent_run_id = 'agent_run_resume_01';
acquiredReplacementAttempt.attempt_id = 'attempt_resume_02';
acquiredReplacementAttempt.actor.id = 'agent_run_resume_01';
acquiredReplacementAttempt.attempt.conversation_id = 'chat_resume_demo';
acquiredReplacementAttempt.attempt.task_id = 'task_resume_voice_docs';
acquiredReplacementAttempt.attempt.primary_agent_run_id = 'agent_run_resume_01';
acquiredReplacementAttempt.attempt.attempt_id = 'attempt_resume_02';
acquiredReplacementAttempt.attempt.slot_lease.lease_id = 'primary_slot_chat_resume_demo';
incompleteSlotHandoffDelta.to_watermarks.attempt_sequence += 1;
incompleteSlotHandoffDelta.changes.push({ change_type: 'attempt_event', record: acquiredReplacementAttempt });
incompleteSlotHandoffDelta.safety_state.primary_slot_attempt_id = 'attempt_resume_02';
incompleteSlotHandoffDelta.safety_state.writer_lock = { task_id: 'task_resume_voice_docs', attempt_id: 'attempt_resume_02', scope: 'documentation worktree' };
expectSemanticRejected(resumeAuthorityErrors(resumePacket, incompleteSlotHandoffDelta), 'negative: new slot acquired without releasing old attempt authority');
const unrelatedLeaseAuthorityDelta = clone(resumeDelta);
unrelatedLeaseAuthorityDelta.to_watermarks.capability_lease_sequence += 1;
unrelatedLeaseAuthorityDelta.changes.push({ change_type: 'capability_lease', record: clone(lease) });
unrelatedLeaseAuthorityDelta.safety_state.active_capability_lease_ids = [lease.lease_id];
expectSemanticRejected(resumeAuthorityErrors(resumePacket, unrelatedLeaseAuthorityDelta), 'negative: unrelated lease record changes resume authority');
const leasePacket = clone(resumePacket);
leasePacket.conversation_id = 'chat_approval_demo';
leasePacket.active_tasks = [{
  ...clone(resumePacket.active_tasks[0]),
  task_id: 'task_approval_demo',
  current_attempt_id: 'attempt_approval_02',
  primary_agent_run_id: 'agent_run_approval_02',
}];
leasePacket.safety_state.primary_slot_attempt_id = 'attempt_approval_02';
leasePacket.safety_state.writer_lock = { task_id: 'task_approval_demo', attempt_id: 'attempt_approval_02', scope: 'documentation push' };
leasePacket.safety_state.active_capability_lease_ids = [lease.lease_id];
leasePacket.safety_state.permission_epoch = lease.permission_epoch;
const leaseTerminalDelta = clone(resumeDelta);
leaseTerminalDelta.conversation_id = 'chat_approval_demo';
leaseTerminalDelta.from_watermarks = clone(leasePacket.source_watermarks);
leaseTerminalDelta.to_watermarks = { ...clone(leasePacket.source_watermarks), capability_lease_sequence: leasePacket.source_watermarks.capability_lease_sequence + 1 };
leaseTerminalDelta.changes = [{ change_type: 'capability_lease', record: clone(consumedLease) }];
leaseTerminalDelta.safety_state = clone(leasePacket.safety_state);
leaseTerminalDelta.safety_state.active_capability_lease_ids = [];
assertSemantic(resumeAuthorityErrors(leasePacket, leaseTerminalDelta).length === 0, 'valid terminal lease revision cannot release resume authority');
const mismatchedLeaseTerminalDelta = clone(leaseTerminalDelta);
mismatchedLeaseTerminalDelta.changes[0].record.task_id = 'task_other';
expectSemanticRejected(resumeAuthorityErrors(leasePacket, mismatchedLeaseTerminalDelta), 'negative: terminal lease revision changes prior task/attempt identity');
const foreignRouteDelta = clone(resumeDelta);
foreignRouteDelta.changes.push({ change_type: 'foreground_route', record: { ...clone(activeForegroundRoute), conversation_id: 'chat_other' } });
expectSemanticRejected(resumeProjectionErrors(resumePacket, foreignRouteDelta), 'negative: resume delta with foreign foreground route');
const unexplainedRouteWatermark = clone(resumeDelta);
unexplainedRouteWatermark.to_watermarks.foreground_route_epoch += 1;
expectSemanticRejected(resumeProjectionErrors(resumePacket, unexplainedRouteWatermark), 'negative: foreground route watermark advances without route record');
const concurrentOwnerDelta = clone(resumeDelta);
concurrentOwnerDelta.to_watermarks.foreground_route_epoch = activeForegroundRoute.route_epoch + 1;
concurrentOwnerDelta.changes.push({
  change_type: 'foreground_route',
  record: {
    ...clone(activeForegroundRoute),
    foreground_route_id: 'foreground_route_chat_03',
    revision: 1,
    previous_revision: null,
    route_epoch: 3,
    surface_mode: 'chat',
    response_owner: 'strong_primary',
    activation_reason: 'exit_voice',
    owner_claim_id: 'foreground_claim_chat_03',
    realtime_session_id: null,
    realtime_session_generation: null,
    supersedes_route_id: activeForegroundRoute.foreground_route_id,
    created_at: '2026-08-02T12:07:00Z',
    updated_at: '2026-08-02T12:07:00Z',
  },
});
expectSemanticRejected(resumeProjectionErrors(resumePacket, concurrentOwnerDelta), 'negative: route delta activates successor without terminating current owner');
const messageWithUnknownRoute = clone(resumeDelta);
const deltaMessage = messageWithUnknownRoute.changes.find((change) => change.change_type === 'conversation_message').record;
deltaMessage.foreground_route_id = 'foreground_route_unknown';
expectSemanticRejected(resumeProjectionErrors(resumePacket, messageWithUnknownRoute), 'negative: delta message with unknown foreground route');
const staleAssistantPacket = clone(resumePacket);
staleAssistantPacket.recent_verbatim_turns.find((turn) => turn.role === 'assistant').created_at = '2026-08-02T12:10:00Z';
expectSemanticRejected(resumeProjectionErrors(staleAssistantPacket, resumeDelta), 'negative: assistant message appears after its route terminated');
const unreceiptedAssistantPacket = clone(resumePacket);
unreceiptedAssistantPacket.recent_verbatim_turns.find((turn) => turn.role === 'assistant').canonical_commit_receipt_id = 'receipt_unknown';
expectSemanticRejected(resumeProjectionErrors(unreceiptedAssistantPacket, resumeDelta), 'negative: assistant message lacks a matching canonical commit receipt');
const userWithCommitReceipt = clone(resumeDelta);
userWithCommitReceipt.changes.find((change) => change.change_type === 'conversation_message').record.canonical_commit_receipt_id = 'receipt_chat_message_commit_01';
expectRejected('resume-delta.schema.json', userWithCommitReceipt, 'negative: user message carries assistant commit receipt');
const deltaForHash = clone(resumeDelta);
const expectedDeltaHash = deltaForHash.canonical_sha256;
delete deltaForHash.canonical_sha256;
const computedDeltaHash = createHash('sha256').update(canonicalizeFixture(deltaForHash)).digest('hex');
if (expectedDeltaHash !== computedDeltaHash) failures.push('resume-delta fixture integrity hash is stale');
assertSemantic(resumeDelta.base_packet_id === resumePacket.packet_id, 'resume delta base packet ID does not match packet');
assertSemantic(resumeDelta.conversation_id === resumePacket.conversation_id, 'resume delta conversation differs from packet');
assertSemantic(resumeDelta.from_context_version === resumePacket.context_version, 'resume delta starts at the wrong context version');
assertSemantic(
  canonicalizeFixture(resumeDelta.from_watermarks) === canonicalizeFixture(resumePacket.source_watermarks),
  'resume delta from-watermarks differ from packet source watermarks',
);
for (const [key, before] of Object.entries(resumeDelta.from_watermarks)) {
  assertSemantic(resumeDelta.to_watermarks[key] >= before, `resume delta watermark ${key} moved backwards`);
}
const deltaContextRevisions = resumeDelta.changes.filter((change) => change.change_type === 'context_revision').map((change) => change.record);
assertSemantic(
  deltaContextRevisions.length === 1 &&
    deltaContextRevisions[0].parent_version === resumeDelta.from_context_version &&
    deltaContextRevisions[0].version === resumeDelta.to_context_version,
  'resume delta context revision does not bridge from/to versions',
);
const decision = await readJson(path.join(exampleRoot, 'decision-request.json'));
const pendingDecision = resumePacket.pending_user_items.find((item) => item.kind === 'decision' && item.request_id === decision.decision_request_id);
const expectedPendingDecision = {
  kind: 'decision',
  request_id: decision.decision_request_id,
  record_revision: decision.revision,
  task_id: decision.task_id,
  context_version: decision.context_version,
  question: decision.question,
  why_user_needed: decision.why_user_needed,
  options: decision.options,
  recommended_option_id: decision.recommended_option_id,
  recommendation_rationale: decision.recommendation_rationale,
  involvement_mode: decision.involvement_mode,
  created_at: decision.created_at,
};
assertSemantic(
  canonicalizeFixture(pendingDecision) === canonicalizeFixture(expectedPendingDecision) &&
    decision.conversation_id === resumePacket.conversation_id,
  'resume packet does not preserve the exact pending decision revision',
);
const emergencyPacketWithAuthority = clone(resumePacket);
emergencyPacketWithAuthority.safety_state.emergency_stop_active = true;
expectRejected('resume-packet.schema.json', emergencyPacketWithAuthority, 'negative: emergency stop with active authority');
const truncatedCriticalState = clone(resumePacket);
truncatedCriticalState.truncation.critical_records_omitted = 1;
expectRejected('resume-packet.schema.json', truncatedCriticalState, 'negative: resume packet omits critical record');

const capabilities = await readJson(path.join(exampleRoot, 'provider-capabilities.json'));
const providerCapabilityReportErrors = (report, asOf = '2026-08-02T12:30:00Z') => {
  const errors = [];
  if (Date.parse(report.observed_at) >= Date.parse(report.expires_at)) errors.push('provider capability report does not expire after observation');
  if (Date.parse(asOf) < Date.parse(report.observed_at)) errors.push('provider capability report is evaluated before observation');
  if (Date.parse(asOf) >= Date.parse(report.expires_at)) errors.push('provider capability report is expired at evaluation time');
  const branch = report.adapter_role === 'realtime_foreground' ? report.realtime : report.primary_agent;
  for (const [name, capability] of Object.entries(branch)) {
    if (!capability || typeof capability !== 'object' || Array.isArray(capability) || !Object.hasOwn(capability, 'verified_at')) continue;
    if (capability.verified_at !== null && Date.parse(capability.verified_at) > Date.parse(report.observed_at)) errors.push(`capability ${name} was verified after report observation`);
    if (capability.verified_at !== null && Date.parse(capability.verified_at) >= Date.parse(report.expires_at)) errors.push(`capability ${name} evidence is outside report lifetime`);
  }
  return errors;
};
const legacyCapabilities = clone(capabilities);
legacyCapabilities.schema_version = 1;
expectRejected('provider-capabilities.schema.json', legacyCapabilities, 'negative: v1 provider report validated as v2 without reprobe');
const strongCapabilities = await readJson(path.join(exampleRoot, 'strong-provider-capabilities.json'));
assertSemantic(providerCapabilityReportErrors(capabilities).length === 0, 'realtime capability report has an invalid lifetime');
assertSemantic(providerCapabilityReportErrors(strongCapabilities).length === 0, 'strong capability report has an invalid lifetime');
assertSemantic(
  capabilities.adapter_role === 'realtime_foreground' &&
    capabilities.realtime && !capabilities.primary_agent &&
    strongCapabilities.adapter_role === 'strong_agent' &&
    strongCapabilities.primary_agent && !strongCapabilities.realtime &&
    capabilities.adapter_id !== strongCapabilities.adapter_id,
  'provider capability fixtures conflate realtime and strong adapters',
);
const conflatedCapabilities = clone(capabilities);
conflatedCapabilities.primary_agent = clone(strongCapabilities.primary_agent);
expectRejected('provider-capabilities.schema.json', conflatedCapabilities, 'negative: one capability report conflates realtime and strong adapters');
const expiredBeforeObservation = clone(capabilities);
expiredBeforeObservation.expires_at = '2026-08-02T11:59:59Z';
expectSemanticRejected(providerCapabilityReportErrors(expiredBeforeObservation), 'negative: provider report expires before observation');
const expiredAtEvaluation = clone(capabilities);
expiredAtEvaluation.expires_at = '2026-08-02T12:15:00Z';
expectSemanticRejected(providerCapabilityReportErrors(expiredAtEvaluation), 'negative: expired provider report is used for routing');
const futureCapabilityEvidence = clone(capabilities);
futureCapabilityEvidence.realtime.session.verified_at = '2026-08-02T12:00:01Z';
expectSemanticRejected(providerCapabilityReportErrors(futureCapabilityEvidence), 'negative: capability evidence is newer than report observation');
const unsupportedEvidence = clone(capabilities);
unsupportedEvidence.realtime.session.evidence = [];
unsupportedEvidence.realtime.session.verified_at = null;
expectRejected('provider-capabilities.schema.json', unsupportedEvidence, 'negative: claimed capability without evidence');

const resolvedDecisionWithoutAnswer = clone(decision);
resolvedDecisionWithoutAnswer.status = 'resolved';
resolvedDecisionWithoutAnswer.terminal_at = '2026-08-02T12:08:00Z';
expectRejected('decision-request.schema.json', resolvedDecisionWithoutAnswer, 'negative: resolved decision without answer');
const decisionWithUnknownSelection = clone(decision);
decisionWithUnknownSelection.revision = 2;
decisionWithUnknownSelection.previous_revision = 1;
decisionWithUnknownSelection.status = 'resolved';
decisionWithUnknownSelection.resolution = {
  selected_option_id: 'option_not_offered',
  resolved_by: { role: 'user', id: 'user_local' },
  resolved_at: '2026-08-02T12:08:00Z',
};
decisionWithUnknownSelection.terminal_at = '2026-08-02T12:08:00Z';
expectSemanticRejected(
  decision.options.some((option) => option.option_id === decisionWithUnknownSelection.resolution.selected_option_id) ? [] : ['selection not offered'],
  'negative: decision selects an unknown option',
);

const unknownEvent = clone(eventStream[0]);
unknownEvent.event_type = 'task.future_event';
expectRejected('task-event.schema.json', unknownEvent, 'negative: unknown event reaches reducer schema');

if (failures.length > 0) {
  console.error(`Voice-agent contract validation failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Validated ${schemaFiles.length} schemas, ${exampleSchemas.size + 7} example files, ` +
  `${eventStream.length} task events, ${attemptEventStream.length} attempt-event records, and ${rejectionCaseCount} rejection cases.`,
);
