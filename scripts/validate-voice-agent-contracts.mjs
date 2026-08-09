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
const reduceTaskState = (currentState, eventType) => {
  const terminal = new Set(['completed', 'failed', 'cancelled']);
  if (eventType === 'task.proposed') return currentState === null ? { state: 'proposed', error: null } : { state: currentState, error: 'task.proposed does not create a new task' };
  if (terminal.has(currentState)) return { state: currentState, error: `${eventType} follows terminal task state` };
  const transition = {
    'task.queued': { from: ['proposed', 'waiting_for_user', 'waiting_for_approval', 'paused', 'verifying'], to: 'queued' },
    'task.resumed': { from: ['waiting_for_user', 'waiting_for_approval', 'paused', 'verifying'], to: 'queued' },
    'task.decision_resolved': { from: ['waiting_for_user'], to: 'queued' },
    'task.approval_resolved': { from: ['waiting_for_approval'], to: 'queued' },
    'task.started': { from: ['queued'], to: 'running' },
    'task.decision_required': { from: ['running', 'verifying'], to: 'waiting_for_user' },
    'task.approval_required': { from: ['running', 'verifying'], to: 'waiting_for_approval' },
    'task.paused': { from: ['queued', 'running', 'waiting_for_user', 'waiting_for_approval', 'verifying'], to: 'paused' },
    'task.verification_started': { from: ['running'], to: 'verifying' },
    'task.completed': { from: ['verifying'], to: 'completed' },
    'task.failed': { from: ['proposed', 'queued', 'running', 'waiting_for_user', 'waiting_for_approval', 'paused', 'verifying'], to: 'failed' },
    'task.cancelled': { from: ['proposed', 'queued', 'running', 'waiting_for_user', 'waiting_for_approval', 'paused', 'verifying'], to: 'cancelled' },
  }[eventType];
  if (!transition) return { state: currentState, error: null };
  if (!transition.from.includes(currentState)) return { state: currentState, error: `${eventType} cannot follow ${currentState}` };
  return { state: transition.to, error: null };
};
const taskMatchesAcquiredAttempt = (taskRecord, attempt) => {
  if (!taskRecord || !attempt) return false;
  if (
    taskRecord.task_id !== attempt.task_id ||
    taskRecord.current_attempt_id !== attempt.attempt_id ||
    taskRecord.primary_agent_run_id !== attempt.primary_agent_run_id ||
    attempt.slot_lease.status !== 'acquired'
  ) return false;
  if (attempt.state === 'starting') return ['queued', 'running'].includes(taskRecord.state);
  if (['running', 'parking'].includes(attempt.state)) return taskRecord.state === 'running';
  return false;
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
const timestampWithinForegroundRoute = (route, timestamp) =>
  Date.parse(timestamp) >= Date.parse(route.created_at) &&
  (route.terminal_at === null || Date.parse(timestamp) < Date.parse(route.terminal_at));
const latestForegroundRouteHeads = (routes) => {
  const heads = new Map();
  for (const route of routes) {
    const key = `${route.foreground_route_id}:${route.route_epoch}`;
    const current = heads.get(key);
    if (!current || route.revision > current.revision) heads.set(key, route);
  }
  return heads;
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
const unsafeResolvedApprovalRevision = clone(resolvedApproval);
unsafeResolvedApprovalRevision.resolution.resolved_request_revision = Number.MAX_SAFE_INTEGER + 1;
expectRejected('approval-request.schema.json', unsafeResolvedApprovalRevision, 'negative: approval resolution accepts unsafe resolved-request revision');
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
const unsafeRevisionOperation = clone(operation);
unsafeRevisionOperation.revision = Number.MAX_SAFE_INTEGER + 1;
expectRejected('operation-intent.schema.json', unsafeRevisionOperation, 'negative: operation accepts unsafe revision integer');
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
const operationImmutableIdentityHash = (record) => {
  const immutable = clone(record);
  for (const field of ['revision', 'previous_revision', 'status', 'dispatched_at', 'terminal_at', 'receipt', 'unknown_reason']) delete immutable[field];
  return createHash('sha256').update(canonicalizeFixture(immutable)).digest('hex');
};
const canonicalMessageBindingErrors = (value, route = supersededChatRoute) => {
  const errors = [];
  if (!route) return ['canonical message operation has no matching foreground route'];
  if (value.conversation_id !== route.conversation_id) errors.push('canonical message operation conversation differs from route');
  if (value.foreground_route_id !== route.foreground_route_id) errors.push('canonical message operation route differs');
  if (value.foreground_route_epoch !== route.route_epoch) errors.push('canonical message operation epoch differs');
  if (value.foreground_owner_claim_id !== route.owner_claim_id) errors.push('canonical message operation owner claim differs');
  for (const [label, timestamp] of [
    ['intent', value.intent_at],
    ['dispatch', value.dispatched_at],
    ['terminal result', value.terminal_at],
    ['receipt observation', value.receipt?.observed_at],
  ]) {
    if (timestamp !== null && timestamp !== undefined && !timestampWithinForegroundRoute(route, timestamp)) {
      errors.push(`canonical message operation ${label} falls outside the half-open route lifetime`);
    }
  }
  if (value.receipt && (value.receipt.result_ref?.kind !== 'message' || value.receipt.result_ref?.id !== value.canonical_message_id)) errors.push('canonical message receipt differs from message identity');
  return errors;
};
assertSemantic(canonicalMessageBindingErrors(canonicalMessageOperation).length === 0, 'canonical Chat message operation is not bound to its foreground route');
const canonicalOperationWithoutRouteClaim = clone(canonicalMessageOperation);
canonicalOperationWithoutRouteClaim.foreground_owner_claim_id = null;
expectRejected('operation-intent.schema.json', canonicalOperationWithoutRouteClaim, 'negative: canonical message operation without route claim');
const staleCanonicalMessageOperation = clone(canonicalMessageOperation);
staleCanonicalMessageOperation.foreground_route_epoch = activeForegroundRoute.route_epoch;
expectSemanticRejected(canonicalMessageBindingErrors(staleCanonicalMessageOperation), 'negative: canonical message operation uses stale/mismatched route epoch');
const canonicalOperationAtHandoff = clone(canonicalMessageOperation);
canonicalOperationAtHandoff.terminal_at = supersededChatRoute.terminal_at;
expectSemanticRejected(canonicalMessageBindingErrors(canonicalOperationAtHandoff), 'negative: old-route canonical operation terminates at half-open handoff boundary');
const canonicalReceiptAtHandoff = clone(canonicalMessageOperation);
canonicalReceiptAtHandoff.receipt.observed_at = supersededChatRoute.terminal_at;
expectSemanticRejected(canonicalMessageBindingErrors(canonicalReceiptAtHandoff), 'negative: old-route canonical receipt is observed at half-open handoff boundary');
const reorderedOldRouteHead = latestForegroundRouteHeads([clone(supersededChatRoute), clone(initialChatRoute)]).get(`${initialChatRoute.foreground_route_id}:${initialChatRoute.route_epoch}`);
assertSemantic(reorderedOldRouteHead?.revision === supersededChatRoute.revision && reorderedOldRouteHead?.status === 'superseded', 'route head selection depends on input revision order');
expectSemanticRejected(canonicalMessageBindingErrors(canonicalOperationAtHandoff, reorderedOldRouteHead), 'negative: reordered route revisions hide old-route handoff boundary');

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
const previousResumePacket = clone(resumePacket);
previousResumePacket.schema_version = 2;
delete previousResumePacket.safety_state.writer_lock.writer_lock_ids;
expectRejected('resume-packet.schema.json', previousResumePacket, 'negative: v2 resume packet validated as v3 without regeneration');
const writerIdentityFreePacket = clone(resumePacket);
delete writerIdentityFreePacket.safety_state.writer_lock.writer_lock_ids;
expectRejected('resume-packet.schema.json', writerIdentityFreePacket, 'negative: resume writer-lock projection omits exact lock IDs');
const attemptHeadFreePacket = clone(resumePacket);
delete attemptHeadFreePacket.active_tasks[0].current_attempt_event_sequence;
expectRejected('resume-packet.schema.json', attemptHeadFreePacket, 'negative: resume active task omits current attempt event-sequence head');
const taskHeadFreePacket = clone(resumePacket);
delete taskHeadFreePacket.active_tasks[0].task_revision;
expectRejected('resume-packet.schema.json', taskHeadFreePacket, 'negative: resume active task omits canonical task-revision head');
const unsafeIntegerPacket = clone(resumePacket);
unsafeIntegerPacket.source_watermarks.conversation_sequence = Number.MAX_SAFE_INTEGER + 1;
expectRejected('resume-packet.schema.json', unsafeIntegerPacket, 'negative: resume packet accepts unsafe integer watermark');
const terminalOperationHeadWithoutReceipt = clone(resumePacket);
terminalOperationHeadWithoutReceipt.operation_revision_index[0].assigned_receipt_id = null;
expectRejected('resume-packet.schema.json', terminalOperationHeadWithoutReceipt, 'negative: terminal operation tombstone omits assigned receipt identity');
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
const previousResumeDelta = clone(resumeDelta);
previousResumeDelta.schema_version = 2;
delete previousResumeDelta.safety_state.writer_lock.writer_lock_ids;
expectRejected('resume-delta.schema.json', previousResumeDelta, 'negative: v2 resume delta validated as v3 without regeneration');
const unsafeIntegerDelta = clone(resumeDelta);
unsafeIntegerDelta.to_watermarks.conversation_sequence = Number.MAX_SAFE_INTEGER + 1;
expectRejected('resume-delta.schema.json', unsafeIntegerDelta, 'negative: resume delta accepts unsafe integer watermark');
const unsafeMessageSequenceDelta = clone(resumeDelta);
unsafeMessageSequenceDelta.changes.find((change) => change.change_type === 'conversation_message').record.conversation_sequence = Number.MAX_SAFE_INTEGER + 1;
expectRejected('resume-delta.schema.json', unsafeMessageSequenceDelta, 'negative: resume delta accepts unsafe conversation-message sequence');
const computeResumePacketHash = (packet) => {
  const packetForIntegrity = clone(packet);
  delete packetForIntegrity.packet_integrity.canonical_sha256;
  return createHash('sha256').update(canonicalizeFixture(packetForIntegrity)).digest('hex');
};
const computeResumeDeltaHash = (delta) => {
  const deltaForIntegrity = clone(delta);
  delete deltaForIntegrity.canonical_sha256;
  return createHash('sha256').update(canonicalizeFixture(deltaForIntegrity)).digest('hex');
};
const rehashResumePacket = (packet) => {
  packet.packet_integrity.canonical_sha256 = computeResumePacketHash(packet);
  return packet;
};
const rehashResumeDelta = (delta) => {
  delta.canonical_sha256 = computeResumeDeltaHash(delta);
  return delta;
};
const resumeAuthorityErrors = (packet, delta) => {
  const errors = [];
  if (delta.base_packet_id !== packet.packet_id) errors.push('delta base packet ID differs from packet');
  if (delta.from_context_version !== packet.context_version) errors.push('delta starting context differs from packet');
  if (canonicalizeFixture(delta.from_watermarks) !== canonicalizeFixture(packet.source_watermarks)) errors.push('delta starting watermarks differ from packet');
  for (const [watermark, before] of Object.entries(delta.from_watermarks)) {
    if (delta.to_watermarks[watermark] < before) errors.push(`delta watermark ${watermark} moves backwards`);
  }
  for (const change of delta.changes) {
    if ('conversation_id' in change.record && change.record.conversation_id !== packet.conversation_id) errors.push(`${change.change_type} record belongs to another conversation`);
  }
  const taskIds = packet.active_tasks.map((taskRecord) => taskRecord.task_id);
  if (new Set(taskIds).size !== taskIds.length) errors.push('resume packet repeats an active task ID');
  const packetTaskHeads = new Map(packet.active_tasks.map((taskRecord) => [taskRecord.task_id, clone(taskRecord)]));
  for (const taskRecord of packet.active_tasks) {
    if (taskRecord.task_event_sequence > packet.source_watermarks.task_sequence) errors.push(`active task ${taskRecord.task_id} event head exceeds packet task watermark`);
  }
  const finalTaskHeads = new Map([...packetTaskHeads].map(([taskId, taskRecord]) => [taskId, clone(taskRecord)]));
  const taskEvents = delta.changes.filter((change) => change.change_type === 'task_event').map((change) => change.record);
  const fromTaskSequence = delta.from_watermarks.task_sequence;
  const toTaskSequence = delta.to_watermarks.task_sequence;
  const seenTaskEventIds = new Set();
  for (const [index, event] of taskEvents.entries()) {
    if (event.conversation_id !== packet.conversation_id) errors.push(`task event ${event.event_id} belongs to another conversation`);
    if (seenTaskEventIds.has(event.event_id)) errors.push(`task event ${event.event_id} is duplicated`);
    seenTaskEventIds.add(event.event_id);
    if (event.sequence <= fromTaskSequence || event.sequence > toTaskSequence) errors.push(`task event ${event.event_id} falls outside delta task-sequence watermarks`);
    if (index > 0 && event.sequence <= taskEvents[index - 1].sequence) errors.push('task events in resume delta are not in increasing canonical sequence order');
    const priorTask = finalTaskHeads.get(event.task_id) ?? null;
    if (priorTask) {
      if (event.task_revision !== priorTask.task_revision + 1) errors.push(`task event ${event.event_id} does not continue task revision`);
      if (event.sequence <= priorTask.task_event_sequence) errors.push(`task event ${event.event_id} does not follow the packet/delta task head`);
    } else {
      const proposedTask = event.payload?.task;
      if (event.event_type !== 'task.proposed' || event.task_revision !== 1 || !proposedTask || proposedTask.task_id !== event.task_id || proposedTask.conversation_id !== event.conversation_id || proposedTask.state !== 'proposed') {
        errors.push(`task event ${event.event_id} has no packet head and does not create a valid proposed task`);
      }
    }
    const reduced = reduceTaskState(priorTask?.state ?? null, event.event_type);
    if (reduced.error) errors.push(`task event ${event.event_id}: ${reduced.error}`);
    const nextTask = priorTask ? clone(priorTask) : {
      task_id: event.task_id,
      title: event.payload?.task?.title ?? event.task_id,
      state: 'proposed',
      task_revision: 0,
      task_event_sequence: 0,
      latest_verified_activity: '',
      required_context_version: event.context_version,
      current_attempt_id: null,
      current_attempt_state: null,
      current_attempt_event_sequence: null,
      primary_agent_run_id: null,
    };
    nextTask.state = reduced.state;
    nextTask.task_revision = event.task_revision;
    nextTask.task_event_sequence = event.sequence;
    if (event.event_type === 'task.started') {
      nextTask.current_attempt_id = event.payload.attempt_id;
      nextTask.current_attempt_state = 'starting';
      nextTask.current_attempt_event_sequence = null;
      nextTask.primary_agent_run_id = event.payload.agent_run_id;
    }
    if (['waiting_for_user', 'waiting_for_approval', 'paused', 'verifying', 'completed', 'failed', 'cancelled'].includes(nextTask.state)) {
      nextTask.current_attempt_id = null;
      nextTask.current_attempt_state = null;
      nextTask.current_attempt_event_sequence = null;
    }
    finalTaskHeads.set(event.task_id, nextTask);
  }
  if (taskEvents.length === 0 && toTaskSequence !== fromTaskSequence) errors.push('task watermark advanced without task events');
  if (taskEvents.length > 0 && taskEvents.at(-1).sequence !== toTaskSequence) errors.push('delta task watermark does not equal the final included task-event sequence');
  const knownTaskIds = new Set(finalTaskHeads.keys());
  for (const change of delta.changes.filter((candidate) => ['decision_request', 'approval_request', 'operation_intent'].includes(candidate.change_type))) {
    if (change.record.task_id !== null && !knownTaskIds.has(change.record.task_id)) errors.push(`${change.change_type} record targets an unknown task`);
  }
  const packetTaskByAttempt = new Map();
  for (const taskRecord of packet.active_tasks) {
    const hasAttempt = taskRecord.current_attempt_id !== null;
    if (hasAttempt !== (taskRecord.current_attempt_state !== null) || hasAttempt !== (taskRecord.current_attempt_event_sequence !== null)) errors.push(`active task ${taskRecord.task_id} has an incomplete current-attempt head`);
    if (hasAttempt) {
      if (packetTaskByAttempt.has(taskRecord.current_attempt_id)) errors.push(`active tasks repeat current attempt ${taskRecord.current_attempt_id}`);
      packetTaskByAttempt.set(taskRecord.current_attempt_id, taskRecord);
      if (taskRecord.current_attempt_event_sequence > packet.source_watermarks.attempt_sequence) errors.push(`active task ${taskRecord.task_id} attempt head exceeds packet watermark`);
    }
  }
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
  const revisionedIdentityFieldByType = {
    decision_request: 'decision_request_id',
    approval_request: 'approval_request_id',
    capability_lease: 'lease_id',
    operation_intent: 'operation_id',
    narration_delivery: 'delivery_id',
  };
  const seenRevisionedRecordKeys = new Set();
  const operationIdByIdempotencyKey = new Map();
  const operationIdByCanonicalMessageId = new Map();
  const operationIdByReceiptId = new Map();
  const operationHeadById = new Map();
  const operationNaturalIdentityById = new Map();
  if (packet.operation_revision_index.length !== packet.source_watermarks.operation_sequence) errors.push('packet operation revision index does not losslessly cover its watermark');
  if (delta.to_watermarks.operation_sequence > 256) errors.push('resulting operation revision index exceeds the critical v3 capacity');
  for (const [index, head] of packet.operation_revision_index.entries()) {
    const receiptRequired = ['succeeded', 'failed', 'cancelled'].includes(head.status);
    if (receiptRequired !== (head.assigned_receipt_id !== null)) errors.push(`packet operation ${head.operation_id} has receipt identity inconsistent with status ${head.status}`);
    if (head.source_sequence !== index + 1) errors.push('packet operation revision index has a gap or reorder');
    const priorHead = operationHeadById.get(head.operation_id);
    if (priorHead) {
      if (['succeeded', 'failed', 'cancelled', 'outcome_unknown'].includes(priorHead.status)) errors.push(`packet operation ${head.operation_id} revises a terminal tombstone`);
      const legalNextStatuses = {
        intended: ['dispatched', 'failed', 'cancelled'],
        dispatched: ['succeeded', 'failed', 'cancelled', 'outcome_unknown'],
      }[priorHead.status] ?? [];
      if (!legalNextStatuses.includes(head.status)) errors.push(`packet operation ${head.operation_id} has illegal status transition`);
      if (head.revision !== priorHead.revision + 1) errors.push(`packet operation ${head.operation_id} has a revision gap`);
      if (head.immutable_identity_sha256 !== priorHead.immutable_identity_sha256) errors.push(`packet operation ${head.operation_id} changes immutable identity`);
      if (
        head.idempotency_key !== priorHead.idempotency_key ||
        head.canonical_message_id !== priorHead.canonical_message_id ||
        (priorHead.assigned_receipt_id !== null && head.assigned_receipt_id !== priorHead.assigned_receipt_id)
      ) errors.push(`packet operation ${head.operation_id} changes natural identity`);
    } else if (head.revision !== 1) {
      errors.push(`packet operation ${head.operation_id} begins after revision 1`);
    }
    operationHeadById.set(head.operation_id, clone(head));
    operationNaturalIdentityById.set(head.operation_id, {
      idempotency_key: head.idempotency_key,
      canonical_message_id: head.canonical_message_id,
      receipt_id: head.assigned_receipt_id,
    });
    for (const [naturalKey, registry, label] of [
      [head.idempotency_key, operationIdByIdempotencyKey, 'idempotency key'],
      [head.canonical_message_id, operationIdByCanonicalMessageId, 'canonical message ID'],
      [head.assigned_receipt_id, operationIdByReceiptId, 'receipt ID'],
    ]) {
      if (naturalKey === null) continue;
      const existingOperationId = registry.get(naturalKey);
      if (existingOperationId && existingOperationId !== head.operation_id) errors.push(`operation revision ${head.operation_id} aliases ${label} owned by ${existingOperationId}`);
      else registry.set(naturalKey, head.operation_id);
    }
  }
  for (const change of delta.changes) {
    const identityField = revisionedIdentityFieldByType[change.change_type];
    if (!identityField) continue;
    const key = `${change.change_type}:${change.record[identityField]}:${change.record.revision}`;
    if (seenRevisionedRecordKeys.has(key)) errors.push(`${change.change_type} repeats canonical record identity/revision ${key}`);
    seenRevisionedRecordKeys.add(key);
    if (change.change_type === 'operation_intent') {
      const operation = change.record;
      const priorOperationHead = operationHeadById.get(operation.operation_id);
      const immutableIdentitySha256 = operationImmutableIdentityHash(operation);
      if (priorOperationHead) {
        if (['succeeded', 'failed', 'cancelled', 'outcome_unknown'].includes(priorOperationHead.status)) errors.push(`operation ${operation.operation_id} revises terminal operation head`);
        const legalNextStatuses = {
          intended: ['dispatched', 'failed', 'cancelled'],
          dispatched: ['succeeded', 'failed', 'cancelled', 'outcome_unknown'],
        }[priorOperationHead.status] ?? [];
        if (!legalNextStatuses.includes(operation.status)) errors.push(`operation ${operation.operation_id} has illegal status transition ${priorOperationHead.status} -> ${operation.status}`);
        if (operation.previous_revision !== priorOperationHead.revision || operation.revision !== priorOperationHead.revision + 1) errors.push(`operation ${operation.operation_id} does not continue packet/delta revision head`);
        if (operation.revision > Number.MAX_SAFE_INTEGER || operation.previous_revision > Number.MAX_SAFE_INTEGER) errors.push(`operation ${operation.operation_id} uses unsafe revision integer`);
        if (priorOperationHead.immutable_identity_sha256 !== immutableIdentitySha256) errors.push(`operation ${operation.operation_id} changes immutable identity across revisions`);
      } else if (operation.previous_revision !== null || operation.revision !== 1) {
        errors.push(`operation ${operation.operation_id} begins after revision 1 without an active packet head`);
      }
      const existingNaturalIdentity = operationNaturalIdentityById.get(operation.operation_id);
      const nextReceiptId = operation.receipt?.receipt_id ?? null;
      if (existingNaturalIdentity) {
        if (
          existingNaturalIdentity.idempotency_key !== operation.idempotency_key ||
          existingNaturalIdentity.canonical_message_id !== operation.canonical_message_id ||
          (existingNaturalIdentity.receipt_id !== null && existingNaturalIdentity.receipt_id !== nextReceiptId)
        ) errors.push(`operation ${operation.operation_id} changes immutable natural identity across revisions`);
        if (existingNaturalIdentity.receipt_id === null && nextReceiptId !== null) existingNaturalIdentity.receipt_id = nextReceiptId;
      } else {
        operationNaturalIdentityById.set(operation.operation_id, {
          idempotency_key: operation.idempotency_key,
          canonical_message_id: operation.canonical_message_id,
          receipt_id: nextReceiptId,
        });
      }
      operationHeadById.set(operation.operation_id, {
        source_sequence: change.source_sequence,
        revision: operation.revision,
        status: operation.status,
        immutable_identity_sha256: immutableIdentitySha256,
        idempotency_key: operation.idempotency_key,
        canonical_message_id: operation.canonical_message_id,
        assigned_receipt_id: nextReceiptId,
      });
      for (const [naturalKey, registry, label] of [
        [operation.idempotency_key, operationIdByIdempotencyKey, 'idempotency key'],
        [operation.canonical_message_id, operationIdByCanonicalMessageId, 'canonical message ID'],
        [operation.receipt?.receipt_id ?? null, operationIdByReceiptId, 'receipt ID'],
      ]) {
        if (naturalKey === null) continue;
        const existingOperationId = registry.get(naturalKey);
        if (existingOperationId && existingOperationId !== operation.operation_id) errors.push(`operation ${operation.operation_id} aliases ${label} owned by ${existingOperationId}`);
        else registry.set(naturalKey, operation.operation_id);
      }
    }
  }
  const streamChangeCounts = {
    conversation_sequence: delta.changes.filter((change) => change.change_type === 'conversation_message').length,
    context_sequence: contextChanges.length,
    decision_sequence: delta.changes.filter((change) => change.change_type === 'decision_request').length,
    approval_sequence: delta.changes.filter((change) => change.change_type === 'approval_request').length,
    capability_lease_sequence: leaseChanges.length,
    operation_sequence: delta.changes.filter((change) => change.change_type === 'operation_intent').length,
    narration_delivery_sequence: delta.changes.filter((change) => change.change_type === 'narration_delivery').length,
  };
  for (const [watermark, recordCount] of Object.entries(streamChangeCounts)) {
    const advance = delta.to_watermarks[watermark] - delta.from_watermarks[watermark];
    if (advance !== recordCount) errors.push(`${watermark} advance does not equal included record count`);
  }
  const sequencedRevisionStreams = {
    decision_request: 'decision_sequence',
    approval_request: 'approval_sequence',
    capability_lease: 'capability_lease_sequence',
    operation_intent: 'operation_sequence',
    narration_delivery: 'narration_delivery_sequence',
  };
  for (const [changeType, watermark] of Object.entries(sequencedRevisionStreams)) {
    const changes = delta.changes.filter((change) => change.change_type === changeType);
    for (const [index, change] of changes.entries()) {
      if (change.source_sequence !== delta.from_watermarks[watermark] + index + 1) errors.push(`${changeType} source sequence does not losslessly continue ${watermark}`);
    }
  }
  if (delta.to_watermarks.agent_checkpoint_sequence !== delta.from_watermarks.agent_checkpoint_sequence) errors.push('agent checkpoint watermark advanced without a supported checkpoint delta record');
  if (delta.to_context_version - delta.from_context_version !== contextChanges.length) errors.push('context version advance does not equal included context revision count');
  if (delta.to_context_version !== delta.to_watermarks.context_sequence) errors.push('delta context version differs from context watermark');
  for (const [index, revision] of contextChanges.entries()) {
    const expectedVersion = delta.from_context_version + index + 1;
    if (revision.version !== expectedVersion || revision.parent_version !== expectedVersion - 1) errors.push(`context revision ${revision.revision_id} does not form a contiguous delta chain`);
  }
  const fromAttemptSequence = delta.from_watermarks.attempt_sequence;
  const toAttemptSequence = delta.to_watermarks.attempt_sequence;
  const seenAttemptEventIds = new Set();
  const seenAttemptIdempotencyKeys = new Set();
  const priorAttemptEventByAttempt = new Map();
  for (const [index, event] of attemptEvents.entries()) {
    if (event.conversation_id !== packet.conversation_id || event.attempt.conversation_id !== packet.conversation_id) errors.push(`attempt event ${event.event_id} belongs to another conversation`);
    if (!knownTaskIds.has(event.task_id) || event.task_id !== event.attempt.task_id || event.attempt_id !== event.attempt.attempt_id) errors.push(`attempt event ${event.event_id} has unrelated task/attempt identity`);
    for (const transitionError of attemptTransitionErrors(event)) errors.push(`attempt event ${event.event_id}: ${transitionError}`);
    if (seenAttemptEventIds.has(event.event_id)) errors.push(`attempt event ${event.event_id} is duplicated`);
    seenAttemptEventIds.add(event.event_id);
    if (seenAttemptIdempotencyKeys.has(event.idempotency_key)) errors.push(`attempt event ${event.event_id} repeats an idempotency key`);
    seenAttemptIdempotencyKeys.add(event.idempotency_key);
    if (event.sequence <= fromAttemptSequence || event.sequence > toAttemptSequence) errors.push(`attempt event ${event.event_id} falls outside delta attempt-sequence watermarks`);
    if (index > 0 && event.sequence <= attemptEvents[index - 1].sequence) errors.push('attempt events in resume delta are not in increasing canonical sequence order');
    const priorEvent = priorAttemptEventByAttempt.get(event.attempt_id);
    if (priorEvent) {
      if (event.previous_state !== priorEvent.resulting_state) errors.push(`attempt event ${event.event_id} does not continue the prior resulting state`);
      if (Date.parse(event.occurred_at) < Date.parse(priorEvent.occurred_at)) errors.push(`attempt event ${event.event_id} moves event time backwards`);
      if (!immutableFieldsMatch(priorEvent.attempt, event.attempt, [
        'state', 'context_version', 'slot_lease', 'writer_lock_ids', 'capability_lease_ids', 'checkpoint_ref', 'failure', 'updated_at', 'terminal_at',
      ])) errors.push(`attempt event ${event.event_id} changes immutable attempt lineage`);
    } else {
      const packetTaskHead = packetTaskByAttempt.get(event.attempt_id);
      if (packetTaskHead) {
        if (event.task_id !== packetTaskHead.task_id || event.primary_agent_run_id !== packetTaskHead.primary_agent_run_id) errors.push(`attempt event ${event.event_id} reassigns the packet attempt lineage`);
        if (event.sequence <= packetTaskHead.current_attempt_event_sequence) errors.push(`attempt event ${event.event_id} does not follow the packet attempt head`);
        if (event.previous_state !== packetTaskHead.current_attempt_state) errors.push(`attempt event ${event.event_id} does not continue the packet attempt state`);
      } else if (event.event_type !== 'attempt.created' || event.previous_state !== null) {
        errors.push(`attempt event ${event.event_id} has no packet head and does not begin a new attempt`);
      }
    }
    priorAttemptEventByAttempt.set(event.attempt_id, event);
  }
  const fromControllerSequence = Math.max(packet.source_watermarks.task_sequence, packet.source_watermarks.attempt_sequence);
  const toControllerSequence = Math.max(delta.to_watermarks.task_sequence, delta.to_watermarks.attempt_sequence);
  const controllerEventChanges = delta.changes.filter((change) => ['task_event', 'attempt_event'].includes(change.change_type));
  const controllerEventSequences = controllerEventChanges.map((change) => change.record.sequence);
  const controllerEventIds = controllerEventChanges.map((change) => change.record.event_id);
  if (new Set(controllerEventIds).size !== controllerEventIds.length) errors.push('task/attempt records reuse a global controller event ID');
  const controllerSequenceAdvance = toControllerSequence - fromControllerSequence;
  let controllerCoverageValid = controllerSequenceAdvance >= 0 && controllerSequenceAdvance === controllerEventSequences.length;
  for (let index = 0; controllerCoverageValid && index < controllerEventSequences.length; index += 1) {
    if (controllerEventSequences[index] !== fromControllerSequence + index + 1) controllerCoverageValid = false;
  }
  if (!controllerCoverageValid) errors.push('task/attempt controller events do not losslessly cover the packet-to-delta sequence interval');
  for (const [attemptId, finalEvent] of priorAttemptEventByAttempt) {
    const taskHead = finalTaskHeads.get(finalEvent.task_id);
    if (!taskHead || taskHead.current_attempt_id !== attemptId) continue;
    if (['parked', 'completed', 'failed', 'cancelled', 'interrupted'].includes(finalEvent.attempt.state)) {
      taskHead.current_attempt_id = null;
      taskHead.current_attempt_state = null;
      taskHead.current_attempt_event_sequence = null;
    } else {
      taskHead.current_attempt_state = finalEvent.attempt.state;
      taskHead.current_attempt_event_sequence = finalEvent.sequence;
      taskHead.primary_agent_run_id = finalEvent.primary_agent_run_id;
    }
  }
  const transactionGroups = [];
  const closedTransactionIds = new Set();
  let openTransaction = null;
  for (const change of delta.changes.filter((candidate) => ['task_event', 'attempt_event'].includes(candidate.change_type))) {
    const transactionId = change.record.transaction_id;
    if (!openTransaction || openTransaction.transaction_id !== transactionId) {
      if (openTransaction) closedTransactionIds.add(openTransaction.transaction_id);
      if (closedTransactionIds.has(transactionId)) errors.push(`transaction ${transactionId} is split across noncontiguous event groups`);
      openTransaction = { transaction_id: transactionId, changes: [] };
      transactionGroups.push(openTransaction);
    }
    openTransaction.changes.push(change);
  }
  const transactionTaskHeads = new Map([...packetTaskHeads].map(([taskId, taskRecord]) => [taskId, clone(taskRecord)]));
  const transactionAttemptHeads = new Map();
  for (const taskRecord of packet.active_tasks.filter((candidate) => candidate.current_attempt_id !== null)) {
    const ownsSlot = taskRecord.current_attempt_id === slotAttemptId;
    transactionAttemptHeads.set(taskRecord.current_attempt_id, {
      attempt_id: taskRecord.current_attempt_id,
      task_id: taskRecord.task_id,
      primary_agent_run_id: taskRecord.primary_agent_run_id,
      state: taskRecord.current_attempt_state,
      slot_lease: { status: ownsSlot ? 'acquired' : 'none' },
      writer_lock_ids: ownsSlot ? clone(packet.safety_state.writer_lock?.writer_lock_ids ?? []) : [],
      capability_lease_ids: ownsSlot ? clone(packet.safety_state.active_capability_lease_ids) : [],
    });
  }
  for (const group of transactionGroups) {
    for (const change of group.changes.filter((candidate) => candidate.change_type === 'task_event')) {
      const event = change.record;
      const priorTask = transactionTaskHeads.get(event.task_id) ?? null;
      const reduced = reduceTaskState(priorTask?.state ?? null, event.event_type);
      const nextTask = priorTask ? clone(priorTask) : {
        task_id: event.task_id,
        state: 'proposed',
        task_revision: 0,
        task_event_sequence: 0,
        current_attempt_id: null,
        current_attempt_state: null,
        current_attempt_event_sequence: null,
        primary_agent_run_id: null,
      };
      nextTask.state = reduced.state;
      nextTask.task_revision = event.task_revision;
      nextTask.task_event_sequence = event.sequence;
      if (event.event_type === 'task.started') {
        nextTask.current_attempt_id = event.payload.attempt_id;
        nextTask.current_attempt_state = 'starting';
        nextTask.current_attempt_event_sequence = null;
        nextTask.primary_agent_run_id = event.payload.agent_run_id;
      }
      if (['waiting_for_user', 'waiting_for_approval', 'paused', 'verifying', 'completed', 'failed', 'cancelled'].includes(nextTask.state)) {
        nextTask.current_attempt_id = null;
        nextTask.current_attempt_state = null;
        nextTask.current_attempt_event_sequence = null;
      }
      transactionTaskHeads.set(event.task_id, nextTask);
    }
    for (const change of group.changes.filter((candidate) => candidate.change_type === 'attempt_event')) transactionAttemptHeads.set(change.record.attempt_id, clone(change.record.attempt));
    for (const change of group.changes.filter((candidate) => candidate.change_type === 'attempt_event')) {
      const event = change.record;
      const taskHead = transactionTaskHeads.get(event.task_id);
      if (!taskHead || taskHead.current_attempt_id !== event.attempt_id) continue;
      if (['parked', 'completed', 'failed', 'cancelled', 'interrupted'].includes(event.attempt.state)) {
        taskHead.current_attempt_id = null;
        taskHead.current_attempt_state = null;
        taskHead.current_attempt_event_sequence = null;
      } else {
        taskHead.current_attempt_state = event.attempt.state;
        taskHead.current_attempt_event_sequence = event.sequence;
        taskHead.primary_agent_run_id = event.primary_agent_run_id;
      }
    }
    const acquiredHeads = [...transactionAttemptHeads.values()].filter((attempt) => attempt.slot_lease.status === 'acquired');
    const runningHeads = [...transactionTaskHeads.values()].filter((taskRecord) => taskRecord.state === 'running');
    if (acquiredHeads.length > 1) errors.push(`transaction ${group.transaction_id} leaves overlapping acquired attempts`);
    if (runningHeads.length > 1) errors.push(`transaction ${group.transaction_id} leaves multiple running tasks`);
    const acquiredHead = acquiredHeads.length === 1 ? acquiredHeads[0] : null;
    const authorityTaskHead = acquiredHead ? transactionTaskHeads.get(acquiredHead.task_id) : null;
    if (acquiredHead) {
      if (!taskMatchesAcquiredAttempt(authorityTaskHead, acquiredHead)) errors.push(`transaction ${group.transaction_id} exposes task/attempt authority mismatch`);
      for (const runningHead of runningHeads) {
        if (runningHead.current_attempt_id !== acquiredHead.attempt_id) errors.push(`transaction ${group.transaction_id} leaves a running task outside the acquired slot`);
      }
    } else if (runningHeads.length > 0) {
      errors.push(`transaction ${group.transaction_id} leaves a running task without acquired attempt authority`);
    }
    for (const attempt of transactionAttemptHeads.values()) {
      if (attempt.attempt_id !== acquiredHead?.attempt_id && (attempt.writer_lock_ids.length > 0 || attempt.capability_lease_ids.length > 0)) errors.push(`transaction ${group.transaction_id} leaves authority on non-slot attempt ${attempt.attempt_id}`);
    }
  }
  let simulatedSlotAttemptId = slotAttemptId;
  for (const change of delta.changes) {
    if (change.change_type === 'attempt_event') {
      const attempt = change.record.attempt;
      if (attempt.slot_lease.status === 'acquired') {
        if (simulatedSlotAttemptId !== null && simulatedSlotAttemptId !== attempt.attempt_id) errors.push(`attempt ${attempt.attempt_id} transiently overlaps acquired slot owner ${simulatedSlotAttemptId}`);
        else simulatedSlotAttemptId = attempt.attempt_id;
      } else if (simulatedSlotAttemptId === attempt.attempt_id && ['none', 'released'].includes(attempt.slot_lease.status)) {
        simulatedSlotAttemptId = null;
      }
      if (attempt.attempt_id !== simulatedSlotAttemptId && (attempt.writer_lock_ids.length > 0 || attempt.capability_lease_ids.length > 0)) errors.push(`attempt ${attempt.attempt_id} transiently holds authority without the simulated slot`);
    }
    if (change.change_type === 'capability_lease' && change.record.status === 'active' && change.record.attempt_id !== simulatedSlotAttemptId) {
      errors.push(`active lease ${change.record.lease_id} is issued to a transient non-slot attempt`);
    }
  }
  for (const leaseRecord of leaseChanges) {
    if (leaseRecord.conversation_id !== packet.conversation_id || !knownTaskIds.has(leaseRecord.task_id)) errors.push(`capability lease ${leaseRecord.lease_id} belongs to another conversation/task`);
    if (leaseRecord.permission_epoch !== delta.safety_state.permission_epoch) errors.push(`capability lease ${leaseRecord.lease_id} permission epoch differs from safety state`);
  }
  for (const revision of contextChanges) {
    if (revision.conversation_id !== packet.conversation_id) errors.push(`context revision ${revision.revision_id} belongs to another conversation`);
  }
  if (attemptEvents.length === 0 && toAttemptSequence !== fromAttemptSequence) errors.push('attempt watermark advanced without attempt events');
  if (attemptEvents.length > 0 && attemptEvents.at(-1).sequence !== toAttemptSequence) errors.push('delta attempt watermark does not equal the final included attempt-event sequence');
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
  const finalAttemptAuthority = new Map();
  for (const taskRecord of packet.active_tasks.filter((candidate) => candidate.current_attempt_id !== null)) {
    const ownsPacketSlot = taskRecord.current_attempt_id === oldSlotAttemptId;
    finalAttemptAuthority.set(taskRecord.current_attempt_id, {
      attempt_id: taskRecord.current_attempt_id,
      task_id: taskRecord.task_id,
      primary_agent_run_id: taskRecord.primary_agent_run_id,
      state: taskRecord.current_attempt_state,
      slot_lease: { status: ownsPacketSlot ? 'acquired' : 'none' },
      writer_lock_ids: ownsPacketSlot ? clone(packet.safety_state.writer_lock?.writer_lock_ids ?? []) : [],
      capability_lease_ids: ownsPacketSlot ? clone(packet.safety_state.active_capability_lease_ids) : [],
    });
  }
  for (const event of attemptEvents) finalAttemptAuthority.set(event.attempt_id, event.attempt);
  const acquiredAttemptIds = [...finalAttemptAuthority.values()]
    .filter((attempt) => attempt.slot_lease.status === 'acquired')
    .map((attempt) => attempt.attempt_id)
    .sort();
  const projectedAcquiredAttemptIds = newSlotAttemptId === null ? [] : [newSlotAttemptId];
  if (canonicalizeFixture(acquiredAttemptIds) !== canonicalizeFixture(projectedAcquiredAttemptIds)) errors.push('final attempt heads contain hidden or missing acquired primary-slot authority');
  const finalSlotAttempt = newSlotAttemptId === null ? null : finalAttemptAuthority.get(newSlotAttemptId);
  const finalCapabilityLeaseIds = [...(finalSlotAttempt?.capability_lease_ids ?? [])].sort();
  const projectedCapabilityLeaseIds = [...delta.safety_state.active_capability_lease_ids].sort();
  if (canonicalizeFixture(finalCapabilityLeaseIds) !== canonicalizeFixture(projectedCapabilityLeaseIds)) errors.push('final slot attempt capability leases differ from resulting safety projection');
  for (const attempt of finalAttemptAuthority.values()) {
    if (attempt.attempt_id !== newSlotAttemptId && (attempt.writer_lock_ids.length > 0 || attempt.capability_lease_ids.length > 0)) errors.push(`non-slot attempt ${attempt.attempt_id} retains hidden lock or lease authority`);
  }
  const finalRunningTasks = [...finalTaskHeads.values()].filter((taskRecord) => taskRecord.state === 'running');
  if (finalRunningTasks.length > 1) errors.push('resulting task heads contain more than one running strong-primary task');
  if (newSlotAttemptId !== null) {
    const finalSlotHead = finalAttemptAuthority.get(newSlotAttemptId);
    const finalSlotTask = finalSlotHead ? finalTaskHeads.get(finalSlotHead.task_id) : null;
    if (!taskMatchesAcquiredAttempt(finalSlotTask, finalSlotHead)) errors.push('resulting primary slot does not match the reduced task/current-attempt lineage');
  } else if (finalRunningTasks.length > 0) {
    errors.push('resulting running task has no projected primary slot owner');
  }
  for (const taskRecord of finalRunningTasks) {
    if (taskRecord.current_attempt_id !== newSlotAttemptId) errors.push(`running task ${taskRecord.task_id} differs from resulting primary slot owner`);
  }
  const targetAttemptId = newSlotAttemptId ?? (slotChanged ? oldSlotAttemptId : null);
  const relevantAttemptEvents = targetAttemptId === null ? [] : attemptEvents.filter((event) => event.attempt_id === targetAttemptId);
  if ((slotChanged || writerChanged) && relevantAttemptEvents.length === 0) errors.push('slot/writer authority change has no event for the affected attempt');
  if (relevantAttemptEvents.length > 0) {
    const latestAttempt = relevantAttemptEvents.at(-1).attempt;
    const expectedSlot = latestAttempt.slot_lease.status === 'acquired' ? latestAttempt.attempt_id : null;
    if (newSlotAttemptId !== expectedSlot) errors.push('delta safety slot differs from resulting attempt authority');
    const expectedWriterLockIds = [...latestAttempt.writer_lock_ids].sort();
    const projectedWriterLockIds = [...(delta.safety_state.writer_lock?.writer_lock_ids ?? [])].sort();
    if (canonicalizeFixture(projectedWriterLockIds) !== canonicalizeFixture(expectedWriterLockIds)) errors.push('delta writer-lock IDs differ from resulting attempt snapshot');
    if (delta.safety_state.writer_lock) {
      if (delta.safety_state.writer_lock.attempt_id !== expectedSlot || delta.safety_state.writer_lock.task_id !== latestAttempt.task_id) errors.push('delta writer lock differs from resulting attempt authority');
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
  if (packet.packet_integrity.canonical_sha256 !== computeResumePacketHash(packet)) errors.push('resume packet integrity hash mismatch');
  if (delta.canonical_sha256 !== computeResumeDeltaHash(delta)) errors.push('resume delta integrity hash mismatch');
  if (packet.foreground_route.conversation_id !== packet.conversation_id) errors.push('packet foreground route belongs to another conversation');
  if (packet.source_watermarks.foreground_route_epoch !== packet.foreground_route.route_epoch) errors.push('packet foreground route watermark differs from active epoch');
  if (delta.conversation_id !== packet.conversation_id) errors.push('delta conversation differs from packet');
  const routeChanges = delta.changes.filter((change) => change.change_type === 'foreground_route').map((change) => change.record);
  const combinedRouteHistory = [...clone(foregroundRoutes), clone(legacyMigrationRoute), ...clone(routeChanges)];
  const combinedRouteErrors = foregroundRouteSetErrors(combinedRouteHistory);
  for (const error of combinedRouteErrors) errors.push(`delta route history: ${error}`);
  const knownRoutes = latestForegroundRouteHeads(combinedRouteHistory);
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
    if (change.change_type === 'operation_intent' && change.record.operation_class === 'canonical_message_commit') {
      const operationRoute = knownRoutes.get(`${change.record.foreground_route_id}:${change.record.foreground_route_epoch}`);
      for (const error of canonicalMessageBindingErrors(change.record, operationRoute)) errors.push(`delta canonical message operation ${change.record.operation_id}: ${error}`);
      if (change.record.receipt) {
        commitReceipts.set(change.record.receipt.receipt_id, {
          message_id: change.record.canonical_message_id,
          route_id: change.record.foreground_route_id,
          route_epoch: change.record.foreground_route_epoch,
          owner_claim_id: change.record.foreground_owner_claim_id,
          committed_at: change.record.receipt.observed_at,
        });
      }
    }
    if (change.change_type === 'narration_delivery') {
      const narrationRoute = knownRoutes.get(`${change.record.foreground_route_id}:${change.record.foreground_route_epoch}`);
      if (!narrationRoute) errors.push(`delta narration delivery ${change.record.delivery_id} has no matching foreground route`);
      else for (const error of narrationDeliveryBindingErrors(change.record, narrationRoute)) errors.push(`delta narration delivery ${change.record.delivery_id}: ${error}`);
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
  const packetMessageIds = packet.recent_verbatim_turns.map((message) => message.message_id);
  const packetMessageSequences = packet.recent_verbatim_turns.map((message) => message.conversation_sequence);
  if (new Set(packetMessageIds).size !== packetMessageIds.length) errors.push('packet recent messages repeat a message ID');
  for (let index = 1; index < packetMessageSequences.length; index += 1) {
    if (packetMessageSequences[index] <= packetMessageSequences[index - 1]) errors.push('packet recent messages are not in increasing conversation sequence order');
  }
  if (packetMessageSequences.length > 0 && packetMessageSequences.at(-1) !== packet.source_watermarks.conversation_sequence) errors.push('packet recent messages do not end at the conversation watermark');
  const deltaMessages = delta.changes.filter((candidate) => candidate.change_type === 'conversation_message').map((change) => change.record);
  const deltaConversationAdvance = delta.to_watermarks.conversation_sequence - delta.from_watermarks.conversation_sequence;
  let conversationCoverageValid = deltaConversationAdvance >= 0 && deltaConversationAdvance === deltaMessages.length;
  for (let index = 0; conversationCoverageValid && index < deltaMessages.length; index += 1) {
    if (deltaMessages[index].conversation_sequence !== delta.from_watermarks.conversation_sequence + index + 1) conversationCoverageValid = false;
  }
  if (!conversationCoverageValid) errors.push('delta messages do not losslessly cover the conversation watermark interval');
  const allMessageIds = [...packetMessageIds, ...deltaMessages.map((message) => message.message_id)];
  if (new Set(allMessageIds).size !== allMessageIds.length) errors.push('packet/delta messages reuse a canonical message ID');
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
  for (const message of deltaMessages) validateMessage(message, delta.conversation_id, 'delta message');
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
      conversation_sequence: binding.source_sequence,
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
  operation_revision_index: [],
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
      conversation_sequence: 3,
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
assertSemantic(resumeProjectionErrors(legacyPacketProjection, legacyDeltaProjection).length === 0, 'verified legacy message bindings do not satisfy resume v3 route/receipt validation');
assertSemantic(resumeProjectionErrors(resumePacket, resumeDelta).length === 0, 'resume packet/delta foreground ownership is incoherent');
const stalePacketIntegrity = clone(resumePacket);
stalePacketIntegrity.packet_integrity.canonical_sha256 = '0'.repeat(64);
expectSemanticRejected(resumeProjectionErrors(stalePacketIntegrity, resumeDelta), 'negative: resume packet integrity hash mismatch is accepted');
const staleDeltaIntegrity = clone(resumeDelta);
staleDeltaIntegrity.canonical_sha256 = '0'.repeat(64);
expectSemanticRejected(resumeProjectionErrors(resumePacket, staleDeltaIntegrity), 'negative: resume delta integrity hash mismatch is accepted');
const omittedContextRecordDelta = clone(resumeDelta);
omittedContextRecordDelta.changes = omittedContextRecordDelta.changes.filter((change) => change.change_type !== 'context_revision');
expectSemanticRejected(resumeProjectionErrors(resumePacket, omittedContextRecordDelta), 'negative: context watermark advances while context revision is omitted');
const jumpedContextWatermarkDelta = clone(resumeDelta);
jumpedContextWatermarkDelta.to_context_version = 9;
jumpedContextWatermarkDelta.to_watermarks.context_sequence = 9;
expectSemanticRejected(resumeProjectionErrors(resumePacket, jumpedContextWatermarkDelta), 'negative: context watermark jumps past the sole included revision');
const backwardsConversationWatermarkDelta = clone(resumeDelta);
backwardsConversationWatermarkDelta.to_watermarks.conversation_sequence = 17;
expectSemanticRejected(resumeProjectionErrors(resumePacket, backwardsConversationWatermarkDelta), 'negative: conversation watermark moves backwards');
const omittedOperationRecordDelta = clone(resumeDelta);
omittedOperationRecordDelta.to_watermarks.operation_sequence = 2;
expectSemanticRejected(resumeProjectionErrors(resumePacket, omittedOperationRecordDelta), 'negative: operation watermark advances without an operation record');
const operationIndexOverflowDelta = clone(resumeDelta);
operationIndexOverflowDelta.from_context_version = resumePacket.context_version;
operationIndexOverflowDelta.to_context_version = resumePacket.context_version;
operationIndexOverflowDelta.from_watermarks = clone(resumePacket.source_watermarks);
operationIndexOverflowDelta.to_watermarks = { ...clone(resumePacket.source_watermarks), operation_sequence: 257 };
operationIndexOverflowDelta.changes = [];
for (let sourceSequence = 2; sourceSequence <= 257; sourceSequence += 1) {
  const overflowOperation = clone(operation);
  overflowOperation.operation_id = `operation_capacity_${sourceSequence}`;
  overflowOperation.conversation_id = 'chat_resume_demo';
  overflowOperation.task_id = 'task_resume_voice_docs';
  overflowOperation.attempt_id = 'attempt_resume_01';
  overflowOperation.idempotency_key = `task_resume_voice_docs:attempt_resume_01:capacity_${sourceSequence}`;
  overflowOperation.protected_payload_ref = `capacity_payload_${sourceSequence}`;
  overflowOperation.receipt.receipt_id = `receipt_capacity_${sourceSequence}`;
  operationIndexOverflowDelta.changes.push({ change_type: 'operation_intent', source_sequence: sourceSequence, record: overflowOperation });
}
rehashResumeDelta(operationIndexOverflowDelta);
validate('resume-delta.schema.json', operationIndexOverflowDelta, 'synthetic operation-index-overflow delta');
expectSemanticRejected(resumeProjectionErrors(resumePacket, operationIndexOverflowDelta), 'negative: resulting critical operation revision index exceeds 256 entries');
const reopenedTerminalOperationDelta = clone(resumeDelta);
const reopenedTerminalOperation = clone(canonicalMessageOperation);
reopenedTerminalOperation.status = 'intended';
reopenedTerminalOperation.dispatched_at = null;
reopenedTerminalOperation.terminal_at = null;
reopenedTerminalOperation.receipt = null;
reopenedTerminalOperationDelta.to_watermarks.operation_sequence = 2;
reopenedTerminalOperationDelta.changes.push({ change_type: 'operation_intent', source_sequence: 2, record: reopenedTerminalOperation });
validate('resume-delta.schema.json', reopenedTerminalOperationDelta, 'synthetic reopened terminal-operation delta');
expectSemanticRejected(resumeProjectionErrors(resumePacket, reopenedTerminalOperationDelta), 'negative: terminal operation tombstone is reused as revision-1 intended work');
const unsupportedCheckpointAdvanceDelta = clone(resumeDelta);
unsupportedCheckpointAdvanceDelta.to_watermarks.agent_checkpoint_sequence += 1;
expectSemanticRejected(resumeProjectionErrors(resumePacket, unsupportedCheckpointAdvanceDelta), 'negative: checkpoint watermark advances without a checkpoint delta record type');
const hugeControllerWatermarkDelta = clone(resumeDelta);
hugeControllerWatermarkDelta.to_watermarks.task_sequence = hugeControllerWatermarkDelta.from_watermarks.task_sequence + (2 ** 32);
expectSemanticRejected(resumeProjectionErrors(resumePacket, hugeControllerWatermarkDelta), 'negative: unbounded controller watermark gap must reject without allocation');
const hugeConversationWatermarkDelta = clone(resumeDelta);
hugeConversationWatermarkDelta.to_watermarks.conversation_sequence = hugeConversationWatermarkDelta.from_watermarks.conversation_sequence + (2 ** 32);
expectSemanticRejected(resumeProjectionErrors(resumePacket, hugeConversationWatermarkDelta), 'negative: unbounded conversation watermark gap must reject without allocation');
const foreignDecisionDelta = clone(resumeDelta);
const foreignDecisionRecord = await readJson(path.join(exampleRoot, 'decision-request.json'));
foreignDecisionRecord.conversation_id = 'chat_other';
foreignDecisionDelta.to_watermarks.decision_sequence += 1;
foreignDecisionDelta.changes.push({ change_type: 'decision_request', source_sequence: 4, record: foreignDecisionRecord });
validate('resume-delta.schema.json', foreignDecisionDelta, 'synthetic foreign-decision resume delta');
expectSemanticRejected(resumeProjectionErrors(resumePacket, foreignDecisionDelta), 'negative: foreign-conversation decision advances resume watermark');
const duplicateConversationMessageDelta = clone(resumeDelta);
const duplicatedPacketMessage = clone(resumePacket.recent_verbatim_turns.at(-1));
duplicatedPacketMessage.conversation_sequence = 19;
duplicateConversationMessageDelta.changes.find((change) => change.change_type === 'conversation_message').record = duplicatedPacketMessage;
validate('resume-delta.schema.json', duplicateConversationMessageDelta, 'synthetic duplicate-message resume delta');
expectSemanticRejected(resumeProjectionErrors(resumePacket, duplicateConversationMessageDelta), 'negative: duplicate canonical message replaces omitted conversation sequence');
const duplicateOperationRecordsDelta = clone(resumeDelta);
duplicateOperationRecordsDelta.to_watermarks.operation_sequence = 3;
duplicateOperationRecordsDelta.changes.push(
  { change_type: 'operation_intent', source_sequence: 2, record: clone(canonicalMessageOperation) },
  { change_type: 'operation_intent', source_sequence: 3, record: clone(canonicalMessageOperation) },
);
validate('resume-delta.schema.json', duplicateOperationRecordsDelta, 'synthetic duplicate-operation resume delta');
expectSemanticRejected(resumeProjectionErrors(resumePacket, duplicateOperationRecordsDelta), 'negative: duplicate operation revision replaces omitted operation record');
const aliasedOperationRecordsDelta = clone(duplicateOperationRecordsDelta);
aliasedOperationRecordsDelta.changes.at(-1).record.operation_id = 'operation_chat_message_commit_alias';
expectSemanticRejected(resumeProjectionErrors(resumePacket, aliasedOperationRecordsDelta), 'negative: aliased operation ID reuses canonical idempotency/message/receipt identity');
const mutatedOperationLineageDelta = clone(resumeDelta);
const mutatedOperationRevision = clone(canonicalMessageOperation);
mutatedOperationRevision.revision = 2;
mutatedOperationRevision.previous_revision = 1;
mutatedOperationRevision.idempotency_key = 'chat_resume_demo:foreground_route_chat_01:message_resume_assistant_mutated';
mutatedOperationRevision.canonical_message_id = 'message_resume_assistant_mutated';
mutatedOperationRevision.receipt.receipt_id = 'receipt_chat_message_commit_mutated';
mutatedOperationRevision.receipt.result_ref.id = mutatedOperationRevision.canonical_message_id;
mutatedOperationLineageDelta.to_watermarks.operation_sequence = 2;
mutatedOperationLineageDelta.changes.push({ change_type: 'operation_intent', source_sequence: 2, record: mutatedOperationRevision });
validate('resume-delta.schema.json', mutatedOperationLineageDelta, 'synthetic mutated-operation-lineage resume delta');
expectSemanticRejected(resumeProjectionErrors(resumePacket, mutatedOperationLineageDelta), 'negative: later operation revision replaces immutable natural identities');
const activeOperationPacket = clone(resumePacket);
activeOperationPacket.source_watermarks.operation_sequence = 2;
activeOperationPacket.operation_revision_index.push({
  operation_id: 'operation_resume_active_01',
  source_sequence: 2,
  revision: 1,
  status: 'dispatched',
  idempotency_key: 'task_resume_voice_docs:attempt_resume_01:active_operation',
  canonical_message_id: null,
  assigned_receipt_id: null,
});
const continuedActiveOperationDelta = clone(resumeDelta);
continuedActiveOperationDelta.from_watermarks.operation_sequence = 2;
continuedActiveOperationDelta.to_watermarks.operation_sequence = 3;
const continuedActiveOperation = clone(operation);
continuedActiveOperation.operation_id = 'operation_resume_active_01';
continuedActiveOperation.revision = 2;
continuedActiveOperation.previous_revision = 1;
continuedActiveOperation.conversation_id = 'chat_resume_demo';
continuedActiveOperation.task_id = 'task_resume_voice_docs';
continuedActiveOperation.attempt_id = 'attempt_resume_01';
continuedActiveOperation.idempotency_key = 'task_resume_voice_docs:attempt_resume_01:active_operation';
continuedActiveOperation.canonical_message_id = null;
activeOperationPacket.operation_revision_index.at(-1).immutable_identity_sha256 = operationImmutableIdentityHash(continuedActiveOperation);
continuedActiveOperationDelta.changes.push({ change_type: 'operation_intent', source_sequence: 3, record: continuedActiveOperation });
rehashResumePacket(activeOperationPacket);
rehashResumeDelta(continuedActiveOperationDelta);
validate('resume-packet.schema.json', activeOperationPacket, 'synthetic packet with active operation head');
validate('resume-delta.schema.json', continuedActiveOperationDelta, 'synthetic continued active-operation delta');
assertSemantic(resumeProjectionErrors(activeOperationPacket, continuedActiveOperationDelta).length === 0, 'valid operation revision does not continue active packet head');
const omittedTerminalTombstonePacket = clone(activeOperationPacket);
omittedTerminalTombstonePacket.operation_revision_index.shift();
expectSemanticRejected(resumeProjectionErrors(omittedTerminalTombstonePacket, continuedActiveOperationDelta), 'negative: packet omits lower terminal operation tombstone while retaining later head');
const regressedOperationStatusDelta = clone(continuedActiveOperationDelta);
const regressedOperation = regressedOperationStatusDelta.changes.at(-1).record;
regressedOperation.status = 'intended';
regressedOperation.dispatched_at = null;
regressedOperation.terminal_at = null;
regressedOperation.receipt = null;
validate('resume-delta.schema.json', regressedOperationStatusDelta, 'synthetic regressed-operation-status delta');
expectSemanticRejected(resumeProjectionErrors(activeOperationPacket, regressedOperationStatusDelta), 'negative: dispatched operation regresses to intended and becomes replayable');
const mutatedCrossPacketOperationDelta = clone(continuedActiveOperationDelta);
mutatedCrossPacketOperationDelta.changes.at(-1).record.idempotency_key = 'task_resume_voice_docs:attempt_resume_01:mutated_cross_packet';
expectSemanticRejected(resumeProjectionErrors(activeOperationPacket, mutatedCrossPacketOperationDelta), 'negative: cross-packet operation revision changes active-head natural identity');
const mutatedImmutableOperationDelta = clone(continuedActiveOperationDelta);
mutatedImmutableOperationDelta.changes.at(-1).record.adapter_id = 'mutated_adapter';
expectSemanticRejected(resumeProjectionErrors(activeOperationPacket, mutatedImmutableOperationDelta), 'negative: cross-packet operation revision changes immutable route/action identity hash');
const gappedOperationSourceDelta = clone(resumeDelta);
const gappedSourceOperation = clone(operation);
gappedSourceOperation.conversation_id = 'chat_resume_demo';
gappedSourceOperation.task_id = 'task_resume_voice_docs';
gappedSourceOperation.attempt_id = 'attempt_resume_01';
gappedOperationSourceDelta.to_watermarks.operation_sequence = 2;
gappedOperationSourceDelta.changes.push({ change_type: 'operation_intent', source_sequence: 3, record: gappedSourceOperation });
validate('resume-delta.schema.json', gappedOperationSourceDelta, 'synthetic gapped-operation-source resume delta');
expectSemanticRejected(resumeProjectionErrors(resumePacket, gappedOperationSourceDelta), 'negative: operation source sequence skips its watermark successor');
const duplicateApprovalRecordsDelta = clone(resumeDelta);
const duplicateResumeApproval = clone(approval);
duplicateResumeApproval.conversation_id = 'chat_resume_demo';
duplicateResumeApproval.task_id = 'task_resume_voice_docs';
duplicateResumeApproval.requesting_attempt_id = 'attempt_resume_01';
duplicateApprovalRecordsDelta.to_watermarks.approval_sequence = 2;
duplicateApprovalRecordsDelta.changes.push(
  { change_type: 'approval_request', source_sequence: 1, record: clone(duplicateResumeApproval) },
  { change_type: 'approval_request', source_sequence: 2, record: clone(duplicateResumeApproval) },
);
validate('resume-delta.schema.json', duplicateApprovalRecordsDelta, 'synthetic duplicate-approval resume delta');
expectSemanticRejected(resumeProjectionErrors(resumePacket, duplicateApprovalRecordsDelta), 'negative: duplicate approval revision replaces omitted approval record');
const validTaskProgressDelta = clone(resumeDelta);
const resumeTaskProgressEvent = clone(progressEvent);
resumeTaskProgressEvent.event_id = 'event_resume_task_progress_12';
resumeTaskProgressEvent.transaction_id = 'tx_resume_task_progress_12';
resumeTaskProgressEvent.sequence = 12;
resumeTaskProgressEvent.task_revision = 10;
resumeTaskProgressEvent.conversation_id = 'chat_resume_demo';
resumeTaskProgressEvent.task_id = 'task_resume_voice_docs';
resumeTaskProgressEvent.context_version = 7;
validTaskProgressDelta.to_watermarks.task_sequence = 12;
validTaskProgressDelta.changes.push({ change_type: 'task_event', record: resumeTaskProgressEvent });
validate('resume-delta.schema.json', validTaskProgressDelta, 'synthetic valid task-progress resume delta');
assertSemantic(resumeAuthorityErrors(resumePacket, validTaskProgressDelta).length === 0, 'valid task progress does not continue packet task head');
const gappedTaskWatermarkDelta = clone(validTaskProgressDelta);
gappedTaskWatermarkDelta.changes.at(-1).record.sequence = 13;
gappedTaskWatermarkDelta.to_watermarks.task_sequence = 13;
expectSemanticRejected(resumeAuthorityErrors(resumePacket, gappedTaskWatermarkDelta), 'negative: task watermark skips an omitted controller event');
const taskCompletedWithLiveAuthorityDelta = clone(resumeDelta);
const prematureTaskCompletedEvent = clone(finalTaskEvent);
prematureTaskCompletedEvent.event_id = 'event_resume_task_completed_12';
prematureTaskCompletedEvent.transaction_id = 'tx_resume_task_completed_12';
prematureTaskCompletedEvent.sequence = 12;
prematureTaskCompletedEvent.task_revision = 10;
prematureTaskCompletedEvent.conversation_id = 'chat_resume_demo';
prematureTaskCompletedEvent.task_id = 'task_resume_voice_docs';
prematureTaskCompletedEvent.context_version = 7;
taskCompletedWithLiveAuthorityDelta.to_watermarks.task_sequence = 12;
taskCompletedWithLiveAuthorityDelta.changes.push({ change_type: 'task_event', record: prematureTaskCompletedEvent });
validate('resume-delta.schema.json', taskCompletedWithLiveAuthorityDelta, 'synthetic premature task-completed resume delta');
expectSemanticRejected(resumeAuthorityErrors(resumePacket, taskCompletedWithLiveAuthorityDelta), 'negative: task completes while its attempt retains slot and writer authority');
const atomicVerificationDelta = clone(resumeDelta);
const resumeAttemptCompletedEvent = clone(terminalAttemptEvent);
resumeAttemptCompletedEvent.event_id = 'attempt_event_resume_completed_12';
resumeAttemptCompletedEvent.sequence = 12;
resumeAttemptCompletedEvent.conversation_id = 'chat_resume_demo';
resumeAttemptCompletedEvent.task_id = 'task_resume_voice_docs';
resumeAttemptCompletedEvent.primary_agent_run_id = 'agent_run_resume_01';
resumeAttemptCompletedEvent.attempt_id = 'attempt_resume_01';
resumeAttemptCompletedEvent.context_version = 7;
resumeAttemptCompletedEvent.idempotency_key = 'task_resume_voice_docs:attempt_resume_01:completed_12';
resumeAttemptCompletedEvent.attempt.conversation_id = 'chat_resume_demo';
resumeAttemptCompletedEvent.attempt.task_id = 'task_resume_voice_docs';
resumeAttemptCompletedEvent.attempt.primary_agent_run_id = 'agent_run_resume_01';
resumeAttemptCompletedEvent.attempt.attempt_id = 'attempt_resume_01';
resumeAttemptCompletedEvent.attempt.context_version = 7;
resumeAttemptCompletedEvent.attempt.slot_lease.lease_id = 'primary_slot_chat_resume_demo';
const resumeVerificationStartedEvent = clone(verificationEvent);
resumeVerificationStartedEvent.event_id = 'event_resume_verification_started_13';
resumeVerificationStartedEvent.sequence = 13;
resumeVerificationStartedEvent.task_revision = 10;
resumeVerificationStartedEvent.conversation_id = 'chat_resume_demo';
resumeVerificationStartedEvent.task_id = 'task_resume_voice_docs';
resumeVerificationStartedEvent.context_version = 7;
resumeVerificationStartedEvent.transaction_id = 'tx_resume_verification_atomic';
resumeAttemptCompletedEvent.transaction_id = resumeVerificationStartedEvent.transaction_id;
atomicVerificationDelta.to_watermarks.task_sequence = 13;
atomicVerificationDelta.to_watermarks.attempt_sequence = 12;
atomicVerificationDelta.changes.push(
  { change_type: 'attempt_event', record: resumeAttemptCompletedEvent },
  { change_type: 'task_event', record: resumeVerificationStartedEvent },
);
atomicVerificationDelta.safety_state.primary_slot_attempt_id = null;
atomicVerificationDelta.safety_state.writer_lock = null;
validate('resume-delta.schema.json', atomicVerificationDelta, 'synthetic atomic verification resume delta');
assertSemantic(resumeAuthorityErrors(resumePacket, atomicVerificationDelta).length === 0, 'atomic attempt completion and task verification transition is rejected');
const collidingControllerEventIdDelta = clone(atomicVerificationDelta);
collidingControllerEventIdDelta.changes.find((change) => change.change_type === 'task_event').record.event_id = collidingControllerEventIdDelta.changes.find((change) => change.change_type === 'attempt_event').record.event_id;
expectSemanticRejected(resumeAuthorityErrors(resumePacket, collidingControllerEventIdDelta), 'negative: task and attempt records reuse one global controller event ID');
const splitVerificationDelta = clone(atomicVerificationDelta);
splitVerificationDelta.changes.find((change) => change.change_type === 'attempt_event').record.transaction_id = 'tx_resume_attempt_release_split';
expectSemanticRejected(resumeAuthorityErrors(resumePacket, splitVerificationDelta), 'negative: attempt authority releases before task verification in another transaction');
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
unrelatedAttemptAuthorityDelta.safety_state.writer_lock = { task_id: runningAttemptEvent.task_id, attempt_id: runningAttemptEvent.attempt_id, writer_lock_ids: clone(runningAttemptEvent.attempt.writer_lock_ids), scope: 'unrelated scope' };
expectSemanticRejected(resumeAuthorityErrors(resumePacket, unrelatedAttemptAuthorityDelta), 'negative: unrelated attempt event changes resume authority');
const mismatchedWriterIdentityDelta = clone(resumeDelta);
const writerIdentityAttemptEvent = clone(runningAttemptEvent);
writerIdentityAttemptEvent.event_id = 'attempt_event_resume_writer_identity';
writerIdentityAttemptEvent.transaction_id = 'tx_resume_writer_identity';
writerIdentityAttemptEvent.sequence = 12;
writerIdentityAttemptEvent.event_type = 'attempt.authority_updated';
writerIdentityAttemptEvent.previous_state = 'running';
writerIdentityAttemptEvent.resulting_state = 'running';
writerIdentityAttemptEvent.idempotency_key = 'task_resume_voice_docs:attempt_resume_01:writer_identity_12';
writerIdentityAttemptEvent.conversation_id = 'chat_resume_demo';
writerIdentityAttemptEvent.task_id = 'task_resume_voice_docs';
writerIdentityAttemptEvent.primary_agent_run_id = 'agent_run_resume_01';
writerIdentityAttemptEvent.attempt_id = 'attempt_resume_01';
writerIdentityAttemptEvent.actor.id = 'agent_run_resume_01';
writerIdentityAttemptEvent.attempt.conversation_id = 'chat_resume_demo';
writerIdentityAttemptEvent.attempt.task_id = 'task_resume_voice_docs';
writerIdentityAttemptEvent.attempt.primary_agent_run_id = 'agent_run_resume_01';
writerIdentityAttemptEvent.attempt.attempt_id = 'attempt_resume_01';
writerIdentityAttemptEvent.attempt.slot_lease.lease_id = 'primary_slot_chat_resume_demo';
const staleWriterProjectionDelta = clone(resumeDelta);
const changedWriterSnapshotEvent = clone(writerIdentityAttemptEvent);
changedWriterSnapshotEvent.event_id = 'attempt_event_resume_writer_snapshot_changed';
changedWriterSnapshotEvent.transaction_id = 'tx_resume_writer_snapshot_changed';
changedWriterSnapshotEvent.attempt.writer_lock_ids = ['writer_lock_changed_without_projection'];
staleWriterProjectionDelta.to_watermarks.attempt_sequence += 1;
staleWriterProjectionDelta.changes.push({ change_type: 'attempt_event', record: changedWriterSnapshotEvent });
expectSemanticRejected(resumeAuthorityErrors(resumePacket, staleWriterProjectionDelta), 'negative: attempt snapshot changes writer-lock IDs while resume projection remains stale');
const reorderedWriterEventsDelta = clone(resumeDelta);
const earlierAppliedWriterEvent = clone(changedWriterSnapshotEvent);
earlierAppliedWriterEvent.event_id = 'attempt_event_resume_writer_sequence_21';
earlierAppliedWriterEvent.sequence = 21;
earlierAppliedWriterEvent.event_type = 'attempt.authority_updated';
earlierAppliedWriterEvent.previous_state = 'running';
earlierAppliedWriterEvent.resulting_state = 'running';
const laterAppliedWriterEvent = clone(writerIdentityAttemptEvent);
laterAppliedWriterEvent.event_id = 'attempt_event_resume_writer_sequence_20';
laterAppliedWriterEvent.sequence = 20;
laterAppliedWriterEvent.event_type = 'attempt.authority_updated';
laterAppliedWriterEvent.previous_state = 'running';
laterAppliedWriterEvent.resulting_state = 'running';
laterAppliedWriterEvent.attempt.writer_lock_ids = clone(resumePacket.safety_state.writer_lock.writer_lock_ids);
reorderedWriterEventsDelta.to_watermarks.attempt_sequence += 2;
reorderedWriterEventsDelta.changes.push(
  { change_type: 'attempt_event', record: earlierAppliedWriterEvent },
  { change_type: 'attempt_event', record: laterAppliedWriterEvent },
);
expectSemanticRejected(resumeAuthorityErrors(resumePacket, reorderedWriterEventsDelta), 'negative: resume attempt events are out of canonical sequence order');
const validIntermediateWriterEventsDelta = clone(resumeDelta);
const writerChangedAtSequence12 = clone(changedWriterSnapshotEvent);
writerChangedAtSequence12.event_id = 'attempt_event_resume_writer_changed_12';
writerChangedAtSequence12.sequence = 12;
writerChangedAtSequence12.idempotency_key = 'task_resume_voice_docs:attempt_resume_01:writer_changed_12';
writerChangedAtSequence12.occurred_at = '2026-08-02T12:06:00Z';
writerChangedAtSequence12.attempt.updated_at = '2026-08-02T12:06:00Z';
const writerRestoredAtSequence13 = clone(writerIdentityAttemptEvent);
writerRestoredAtSequence13.event_id = 'attempt_event_resume_writer_restored_13';
writerRestoredAtSequence13.sequence = 13;
writerRestoredAtSequence13.idempotency_key = 'task_resume_voice_docs:attempt_resume_01:writer_restored_13';
writerRestoredAtSequence13.occurred_at = '2026-08-02T12:06:01Z';
writerRestoredAtSequence13.attempt.updated_at = '2026-08-02T12:06:01Z';
writerRestoredAtSequence13.attempt.writer_lock_ids = clone(resumePacket.safety_state.writer_lock.writer_lock_ids);
validIntermediateWriterEventsDelta.to_watermarks.attempt_sequence = 13;
validIntermediateWriterEventsDelta.changes.push(
  { change_type: 'attempt_event', record: writerChangedAtSequence12 },
  { change_type: 'attempt_event', record: writerRestoredAtSequence13 },
);
assertSemantic(resumeAuthorityErrors(resumePacket, validIntermediateWriterEventsDelta).length === 0, 'ordered intermediate writer-lock snapshots do not reduce to the matching final projection');
const duplicateIdempotencyDelta = clone(validIntermediateWriterEventsDelta);
duplicateIdempotencyDelta.changes.at(-1).record.idempotency_key = duplicateIdempotencyDelta.changes.at(-2).record.idempotency_key;
expectSemanticRejected(resumeAuthorityErrors(resumePacket, duplicateIdempotencyDelta), 'negative: resume attempt events repeat an idempotency key');
const hiddenAuthorityDelta = clone(resumeDelta);
const hiddenAttemptEvents = clone(attemptEventStream.slice(0, 4));
for (const [index, event] of hiddenAttemptEvents.entries()) {
  event.event_id = `attempt_event_hidden_02_${index + 1}`;
  event.transaction_id = `tx_hidden_attempt_02_${index + 1}`;
  event.sequence = 12 + index;
  event.conversation_id = 'chat_resume_demo';
  event.task_id = 'task_resume_voice_docs';
  event.primary_agent_run_id = 'agent_run_resume_hidden_02';
  event.attempt_id = 'attempt_resume_hidden_02';
  event.idempotency_key = `task_resume_voice_docs:attempt_resume_hidden_02:${event.event_type}`;
  event.attempt.conversation_id = 'chat_resume_demo';
  event.attempt.task_id = 'task_resume_voice_docs';
  event.attempt.primary_agent_run_id = 'agent_run_resume_hidden_02';
  event.attempt.attempt_id = 'attempt_resume_hidden_02';
  event.attempt.ordinal = 2;
  event.attempt.resumes_attempt_id = 'attempt_resume_01';
  event.attempt.provider_session_id = 'provider_task_session_resume_hidden_02';
  if (event.attempt.slot_lease.lease_id !== null) event.attempt.slot_lease.lease_id = 'primary_slot_chat_resume_hidden_02';
  event.attempt.writer_lock_ids = event.event_type === 'attempt.running' ? ['writer_lock_resume_hidden_02'] : [];
}
hiddenAuthorityDelta.to_watermarks.attempt_sequence = 15;
hiddenAuthorityDelta.changes.push(...hiddenAttemptEvents.map((record) => ({ change_type: 'attempt_event', record })));
expectSemanticRejected(resumeAuthorityErrors(resumePacket, hiddenAuthorityDelta), 'negative: second attempt retains hidden acquired slot and writer authority outside safety projection');
const reassignedAttemptPacket = clone(resumePacket);
reassignedAttemptPacket.active_tasks.push({
  ...clone(resumePacket.active_tasks[0]),
  task_id: 'task_resume_other',
  state: 'queued',
  current_attempt_id: null,
  current_attempt_state: null,
  current_attempt_event_sequence: null,
  primary_agent_run_id: null,
});
reassignedAttemptPacket.safety_state.writer_lock = null;
const reassignedAttemptDelta = clone(resumeDelta);
reassignedAttemptDelta.safety_state.writer_lock = null;
reassignedAttemptDelta.to_watermarks.attempt_sequence = 12;
const reassignedAttemptEvent = clone(writerIdentityAttemptEvent);
reassignedAttemptEvent.event_id = 'attempt_event_resume_reassigned_lineage';
reassignedAttemptEvent.task_id = 'task_resume_other';
reassignedAttemptEvent.primary_agent_run_id = 'agent_run_resume_other';
reassignedAttemptEvent.idempotency_key = 'task_resume_other:attempt_resume_01:reassigned_lineage';
reassignedAttemptEvent.attempt.task_id = 'task_resume_other';
reassignedAttemptEvent.attempt.primary_agent_run_id = 'agent_run_resume_other';
reassignedAttemptEvent.attempt.writer_lock_ids = [];
reassignedAttemptDelta.changes.push({ change_type: 'attempt_event', record: reassignedAttemptEvent });
expectSemanticRejected(resumeAuthorityErrors(reassignedAttemptPacket, reassignedAttemptDelta), 'negative: existing attempt ID is reassigned to another packet task and primary lineage');
mismatchedWriterIdentityDelta.to_watermarks.attempt_sequence += 1;
mismatchedWriterIdentityDelta.changes.push({ change_type: 'attempt_event', record: writerIdentityAttemptEvent });
mismatchedWriterIdentityDelta.safety_state.writer_lock.writer_lock_ids = ['writer_lock_invented'];
expectSemanticRejected(resumeAuthorityErrors(resumePacket, mismatchedWriterIdentityDelta), 'negative: resume writer-lock IDs differ from resulting attempt snapshot');
const matchingWriterIdentityDelta = clone(mismatchedWriterIdentityDelta);
matchingWriterIdentityDelta.safety_state.writer_lock.writer_lock_ids = clone(writerIdentityAttemptEvent.attempt.writer_lock_ids);
assertSemantic(resumeAuthorityErrors(resumePacket, matchingWriterIdentityDelta).length === 0, 'matching resume writer-lock IDs do not reproduce the resulting attempt snapshot');
const startingAttemptPacket = clone(resumePacket);
startingAttemptPacket.active_tasks[0].state = 'queued';
startingAttemptPacket.active_tasks[0].current_attempt_state = 'queued';
startingAttemptPacket.safety_state.primary_slot_attempt_id = null;
startingAttemptPacket.safety_state.writer_lock = null;
const startingAttemptDelta = clone(resumeDelta);
startingAttemptDelta.safety_state.primary_slot_attempt_id = 'attempt_resume_01';
startingAttemptDelta.safety_state.writer_lock = null;
startingAttemptDelta.to_watermarks.attempt_sequence = 12;
const resumeAttemptStartingEvent = clone(attemptEventStream.find((event) => event.event_type === 'attempt.starting'));
resumeAttemptStartingEvent.event_id = 'attempt_event_resume_starting_12';
resumeAttemptStartingEvent.transaction_id = 'tx_resume_starting_12';
resumeAttemptStartingEvent.sequence = 12;
resumeAttemptStartingEvent.conversation_id = 'chat_resume_demo';
resumeAttemptStartingEvent.task_id = 'task_resume_voice_docs';
resumeAttemptStartingEvent.primary_agent_run_id = 'agent_run_resume_01';
resumeAttemptStartingEvent.attempt_id = 'attempt_resume_01';
resumeAttemptStartingEvent.context_version = 7;
resumeAttemptStartingEvent.idempotency_key = 'task_resume_voice_docs:attempt_resume_01:starting_12';
resumeAttemptStartingEvent.attempt.conversation_id = 'chat_resume_demo';
resumeAttemptStartingEvent.attempt.task_id = 'task_resume_voice_docs';
resumeAttemptStartingEvent.attempt.primary_agent_run_id = 'agent_run_resume_01';
resumeAttemptStartingEvent.attempt.attempt_id = 'attempt_resume_01';
resumeAttemptStartingEvent.attempt.context_version = 7;
resumeAttemptStartingEvent.attempt.slot_lease.lease_id = 'primary_slot_chat_resume_demo';
startingAttemptDelta.changes.push({ change_type: 'attempt_event', record: resumeAttemptStartingEvent });
assertSemantic(resumeAuthorityErrors(startingAttemptPacket, startingAttemptDelta).length === 0, 'queued task cannot atomically enter acquired starting-attempt state');
const staleAttemptSequenceDelta = clone(matchingWriterIdentityDelta);
staleAttemptSequenceDelta.changes.at(-1).record.sequence = 6;
expectSemanticRejected(resumeAuthorityErrors(resumePacket, staleAttemptSequenceDelta), 'negative: stale attempt event sequence precedes the packet watermark');
const gappedAttemptWatermarkDelta = clone(matchingWriterIdentityDelta);
gappedAttemptWatermarkDelta.changes.at(-1).record.sequence = 13;
gappedAttemptWatermarkDelta.to_watermarks.attempt_sequence = 13;
expectSemanticRejected(resumeAuthorityErrors(resumePacket, gappedAttemptWatermarkDelta), 'negative: attempt watermark skips an omitted controller event');
const discontinuousPacketHeadDelta = clone(matchingWriterIdentityDelta);
discontinuousPacketHeadDelta.changes.at(-1).record.event_type = 'attempt.running';
discontinuousPacketHeadDelta.changes.at(-1).record.previous_state = 'starting';
expectSemanticRejected(resumeAuthorityErrors(resumePacket, discontinuousPacketHeadDelta), 'negative: first resume attempt event does not continue packet attempt state');
const mismatchedFromWatermarkDelta = clone(resumeDelta);
mismatchedFromWatermarkDelta.from_watermarks.attempt_sequence -= 1;
expectSemanticRejected(resumeAuthorityErrors(resumePacket, mismatchedFromWatermarkDelta), 'negative: resume delta starts from a watermark other than its packet');
const hiddenAttemptLeaseDelta = clone(matchingWriterIdentityDelta);
hiddenAttemptLeaseDelta.changes.at(-1).record.attempt.capability_lease_ids = ['lease_hidden_attempt_authority'];
expectSemanticRejected(resumeAuthorityErrors(resumePacket, hiddenAttemptLeaseDelta), 'negative: active-slot attempt snapshot retains a hidden capability lease');
const missingWriterProjectionDelta = clone(matchingWriterIdentityDelta);
missingWriterProjectionDelta.safety_state.writer_lock = null;
expectSemanticRejected(resumeAuthorityErrors(resumePacket, missingWriterProjectionDelta), 'negative: resume writer-lock projection is null while resulting attempt retains locks');
const inventedWriterProjectionDelta = clone(matchingWriterIdentityDelta);
inventedWriterProjectionDelta.changes.at(-1).record.attempt.writer_lock_ids = [];
inventedWriterProjectionDelta.safety_state.writer_lock.writer_lock_ids = ['writer_lock_invented'];
expectSemanticRejected(resumeAuthorityErrors(resumePacket, inventedWriterProjectionDelta), 'negative: resume writer-lock projection invents a lock absent from resulting attempt');
const multipleWriterIdentityDelta = clone(matchingWriterIdentityDelta);
multipleWriterIdentityDelta.changes.at(-1).record.attempt.writer_lock_ids = ['writer_lock_docs', 'writer_lock_docs_secondary'];
multipleWriterIdentityDelta.safety_state.writer_lock.writer_lock_ids = ['writer_lock_docs_secondary', 'writer_lock_docs'];
assertSemantic(resumeAuthorityErrors(resumePacket, multipleWriterIdentityDelta).length === 0, 'matching multiple writer-lock IDs are not compared as one exact set');
const partialWriterIdentityDelta = clone(multipleWriterIdentityDelta);
partialWriterIdentityDelta.safety_state.writer_lock.writer_lock_ids = ['writer_lock_docs'];
expectSemanticRejected(resumeAuthorityErrors(resumePacket, partialWriterIdentityDelta), 'negative: resume writer-lock projection omits one resulting lock ID');
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
incompleteSlotHandoffDelta.safety_state.writer_lock = { task_id: 'task_resume_voice_docs', attempt_id: 'attempt_resume_02', writer_lock_ids: clone(acquiredReplacementAttempt.attempt.writer_lock_ids), scope: 'documentation worktree' };
expectSemanticRejected(resumeAuthorityErrors(resumePacket, incompleteSlotHandoffDelta), 'negative: new slot acquired without releasing old attempt authority');
const unrelatedLeaseAuthorityDelta = clone(resumeDelta);
unrelatedLeaseAuthorityDelta.to_watermarks.capability_lease_sequence += 1;
unrelatedLeaseAuthorityDelta.changes.push({ change_type: 'capability_lease', source_sequence: 1, record: clone(lease) });
unrelatedLeaseAuthorityDelta.safety_state.active_capability_lease_ids = [lease.lease_id];
expectSemanticRejected(resumeAuthorityErrors(resumePacket, unrelatedLeaseAuthorityDelta), 'negative: unrelated lease record changes resume authority');
const transientHiddenLeaseDelta = clone(resumeDelta);
const hiddenActiveLease = clone(lease);
hiddenActiveLease.lease_id = 'lease_hidden_transient';
hiddenActiveLease.approval_request_id = 'approval_hidden_transient';
hiddenActiveLease.conversation_id = 'chat_resume_demo';
hiddenActiveLease.task_id = 'task_resume_voice_docs';
hiddenActiveLease.attempt_id = 'attempt_resume_hidden_lease';
const hiddenConsumedLease = clone(consumedLease);
hiddenConsumedLease.lease_id = hiddenActiveLease.lease_id;
hiddenConsumedLease.approval_request_id = hiddenActiveLease.approval_request_id;
hiddenConsumedLease.conversation_id = hiddenActiveLease.conversation_id;
hiddenConsumedLease.task_id = hiddenActiveLease.task_id;
hiddenConsumedLease.attempt_id = hiddenActiveLease.attempt_id;
transientHiddenLeaseDelta.to_watermarks.capability_lease_sequence = 2;
transientHiddenLeaseDelta.changes.push(
  { change_type: 'capability_lease', source_sequence: 1, record: hiddenActiveLease },
  { change_type: 'capability_lease', source_sequence: 2, record: hiddenConsumedLease },
);
expectSemanticRejected(resumeAuthorityErrors(resumePacket, transientHiddenLeaseDelta), 'negative: non-slot attempt acquires and consumes a transient hidden capability lease');
const leasePacket = clone(resumePacket);
leasePacket.conversation_id = 'chat_approval_demo';
leasePacket.active_tasks = [{
  ...clone(resumePacket.active_tasks[0]),
  task_id: 'task_approval_demo',
  current_attempt_id: 'attempt_approval_02',
  primary_agent_run_id: 'agent_run_approval_02',
}];
leasePacket.safety_state.primary_slot_attempt_id = 'attempt_approval_02';
leasePacket.safety_state.writer_lock = { task_id: 'task_approval_demo', attempt_id: 'attempt_approval_02', writer_lock_ids: ['writer_lock_approval_push'], scope: 'documentation push' };
leasePacket.safety_state.active_capability_lease_ids = [lease.lease_id];
leasePacket.safety_state.permission_epoch = lease.permission_epoch;
const leaseTerminalDelta = clone(resumeDelta);
leaseTerminalDelta.conversation_id = 'chat_approval_demo';
leaseTerminalDelta.from_context_version = leasePacket.context_version;
leaseTerminalDelta.to_context_version = leasePacket.context_version;
leaseTerminalDelta.from_watermarks = clone(leasePacket.source_watermarks);
leaseTerminalDelta.to_watermarks = { ...clone(leasePacket.source_watermarks), capability_lease_sequence: leasePacket.source_watermarks.capability_lease_sequence + 1 };
const leaseReleaseAttemptEvent = clone(writerIdentityAttemptEvent);
leaseReleaseAttemptEvent.event_id = 'attempt_event_approval_lease_released';
leaseReleaseAttemptEvent.transaction_id = 'tx_approval_lease_released';
leaseReleaseAttemptEvent.conversation_id = 'chat_approval_demo';
leaseReleaseAttemptEvent.task_id = 'task_approval_demo';
leaseReleaseAttemptEvent.primary_agent_run_id = 'agent_run_approval_02';
leaseReleaseAttemptEvent.attempt_id = 'attempt_approval_02';
leaseReleaseAttemptEvent.idempotency_key = 'task_approval_demo:attempt_approval_02:lease_released';
leaseReleaseAttemptEvent.attempt.conversation_id = 'chat_approval_demo';
leaseReleaseAttemptEvent.attempt.task_id = 'task_approval_demo';
leaseReleaseAttemptEvent.attempt.primary_agent_run_id = 'agent_run_approval_02';
leaseReleaseAttemptEvent.attempt.attempt_id = 'attempt_approval_02';
leaseReleaseAttemptEvent.attempt.slot_lease.lease_id = 'primary_slot_chat_approval_demo';
leaseReleaseAttemptEvent.attempt.writer_lock_ids = ['writer_lock_approval_push'];
leaseReleaseAttemptEvent.attempt.capability_lease_ids = [];
leaseTerminalDelta.to_watermarks.attempt_sequence += 1;
leaseTerminalDelta.changes = [
  { change_type: 'attempt_event', record: leaseReleaseAttemptEvent },
  { change_type: 'capability_lease', source_sequence: 1, record: clone(consumedLease) },
];
leaseTerminalDelta.safety_state = clone(leasePacket.safety_state);
leaseTerminalDelta.safety_state.active_capability_lease_ids = [];
assertSemantic(resumeAuthorityErrors(leasePacket, leaseTerminalDelta).length === 0, 'valid terminal lease revision cannot release resume authority');
const mismatchedLeaseTerminalDelta = clone(leaseTerminalDelta);
mismatchedLeaseTerminalDelta.changes.find((change) => change.change_type === 'capability_lease').record.task_id = 'task_other';
expectSemanticRejected(resumeAuthorityErrors(leasePacket, mismatchedLeaseTerminalDelta), 'negative: terminal lease revision changes prior task/attempt identity');
const oldRouteOperationDelta = clone(resumeDelta);
const boundaryOperation = clone(canonicalMessageOperation);
boundaryOperation.operation_id = 'operation_chat_message_commit_boundary';
boundaryOperation.canonical_message_id = 'message_resume_assistant_boundary';
boundaryOperation.idempotency_key = 'chat_resume_demo:foreground_route_chat_01:message_resume_assistant_boundary';
boundaryOperation.protected_payload_ref = 'message_payload_resume_assistant_boundary';
boundaryOperation.receipt.receipt_id = 'receipt_chat_message_commit_boundary';
boundaryOperation.receipt.result_ref.id = 'message_resume_assistant_boundary';
boundaryOperation.intent_at = supersededChatRoute.terminal_at;
boundaryOperation.dispatched_at = supersededChatRoute.terminal_at;
boundaryOperation.terminal_at = supersededChatRoute.terminal_at;
boundaryOperation.receipt.observed_at = supersededChatRoute.terminal_at;
oldRouteOperationDelta.to_watermarks.operation_sequence += 1;
oldRouteOperationDelta.changes.push({ change_type: 'operation_intent', source_sequence: 2, record: boundaryOperation });
validate('resume-delta.schema.json', oldRouteOperationDelta, 'synthetic old-route boundary operation delta');
expectSemanticRejected(resumeProjectionErrors(resumePacket, oldRouteOperationDelta), 'negative: resume delta accepts old-route canonical operation at handoff boundary');
const pendingOldRouteOperationDelta = clone(resumeDelta);
const pendingBoundaryOperation = clone(boundaryOperation);
pendingBoundaryOperation.operation_id = 'operation_chat_message_dispatch_boundary';
pendingBoundaryOperation.canonical_message_id = 'message_resume_assistant_dispatch_boundary';
pendingBoundaryOperation.idempotency_key = 'chat_resume_demo:foreground_route_chat_01:message_resume_assistant_dispatch_boundary';
pendingBoundaryOperation.protected_payload_ref = 'message_payload_resume_assistant_dispatch_boundary';
pendingBoundaryOperation.status = 'dispatched';
pendingBoundaryOperation.terminal_at = null;
pendingBoundaryOperation.receipt = null;
pendingOldRouteOperationDelta.to_watermarks.operation_sequence += 1;
pendingOldRouteOperationDelta.changes.push({ change_type: 'operation_intent', source_sequence: 2, record: pendingBoundaryOperation });
validate('resume-delta.schema.json', pendingOldRouteOperationDelta, 'synthetic pending old-route boundary operation delta');
expectSemanticRejected(resumeProjectionErrors(resumePacket, pendingOldRouteOperationDelta), 'negative: resume delta accepts pending old-route canonical dispatch at handoff boundary');
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
