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
  ['operation-intent.json', 'operation-intent.schema.json'],
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

const jsonExamples = (await fs.readdir(exampleRoot))
  .filter((name) => name.endsWith('.json'))
  .sort();
const mappedExamples = new Set([
  ...exampleSchemas.keys(),
  'task-events.json',
  'attempt-events.json',
  'narration-delivery-revisions.json',
]);
for (const filename of jsonExamples) {
  if (!mappedExamples.has(filename)) failures.push(`${filename}: example has no schema mapping`);
}

const expectRejected = (schemaFilename, value, label) => {
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
if (
  operation.action_hash !== lease.action_hash ||
  operation.capability_lease_id !== lease.lease_id ||
  operation.attempt_id !== lease.attempt_id ||
  consumedLease.actions_used !== 1 ||
  consumedLease.terminal_at !== operation.terminal_at
) {
  failures.push('operation fixture is not bound to its capability lease');
}
const unknownOperationWithReceipt = clone(operation);
unknownOperationWithReceipt.status = 'outcome_unknown';
unknownOperationWithReceipt.unknown_reason = 'The connection closed before reconciliation.';
expectRejected('operation-intent.schema.json', unknownOperationWithReceipt, 'negative: unknown operation with fabricated receipt');

const narration = await readJson(path.join(exampleRoot, 'narration-item.json'));
const narrationWithoutSafety = clone(narration);
delete narrationWithoutSafety.contains_sensitive_detail;
expectRejected('narration-item.schema.json', narrationWithoutSafety, 'negative: narration without redaction verdict');

const delivery = await readJson(path.join(exampleRoot, 'narration-delivery.json'));
const expectedDeliveryStates = ['prepared', 'speech_requested', 'speaking', 'completed'];
for (const [index, deliveryRevision] of narrationDeliveryRevisions.entries()) {
  assertSemantic(deliveryRevision.status === expectedDeliveryStates[index], `narration delivery revision ${index + 1} has an illegal state`);
  assertSemantic(deliveryRevision.revision === index + 1, `narration delivery revision ${index + 1} is not contiguous`);
  assertSemantic(deliveryRevision.previous_revision === (index === 0 ? null : index), `narration delivery revision ${index + 1} has the wrong predecessor`);
  if (index > 0) {
    assertSemantic(
      immutableFieldsMatch(narrationDeliveryRevisions[0], deliveryRevision, [
        'revision', 'previous_revision', 'status', 'canonical_message_status', 'canonical_commit_receipt_id', 'speech_status',
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
if (delivery.narration_id !== narration.narration_id || delivery.final_text_sha256 !== fixtureTextHash) {
  failures.push('narration delivery fixture does not bind to the fixture utterance');
}
const completedWithoutPhysicalIdentity = clone(delivery);
completedWithoutPhysicalIdentity.provider_item_id = null;
expectRejected('narration-delivery.schema.json', completedWithoutPhysicalIdentity, 'negative: completed speech omits provider item identity');
const completedWithoutMessage = clone(delivery);
completedWithoutMessage.canonical_message_status = 'pending';
expectRejected('narration-delivery.schema.json', completedWithoutMessage, 'negative: completed delivery without canonical commit');

const resumePacket = await readJson(path.join(exampleRoot, 'resume-packet.json'));
const packetForHash = clone(resumePacket);
const expectedPacketHash = packetForHash.packet_integrity.canonical_sha256;
delete packetForHash.packet_integrity.canonical_sha256;
const computedPacketHash = createHash('sha256').update(canonicalizeFixture(packetForHash)).digest('hex');
if (expectedPacketHash !== computedPacketHash) failures.push('resume-packet fixture integrity hash is stale');
const resumeDelta = await readJson(path.join(exampleRoot, 'resume-delta.json'));
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
  `Validated ${schemaFiles.length} schemas, ${exampleSchemas.size + 3} example files, ` +
  `${eventStream.length} task events, ${attemptEventStream.length} attempt-event records, and 24 rejection cases.`,
);
