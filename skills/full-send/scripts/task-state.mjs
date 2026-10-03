import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';

const [command, idArg, ...rest] = process.argv.slice(2);
const args = command === 'init' ? [idArg, ...rest].filter(Boolean) : rest;
function values(flag) { return args.flatMap((value, i) => value === flag && args[i + 1] ? [args[i + 1]] : []); }
function value(flag) { return values(flag).at(-1); }
const project = path.resolve(value('--project') || process.cwd());
const directory = path.join(project, '.zyra', 'agent-runs', 'full-send');
const id = command === 'init' ? `task-${randomUUID()}` : idArg;
if (!/^task-[a-f0-9-]{36}$/.test(String(id))) throw new Error('A valid task ID is required.');
const file = path.join(directory, `${id}.json`);
const now = new Date().toISOString();
let record;
if (command === 'init') {
  const criteria = values('--criterion');
  if (!value('--title') || !criteria.length) throw new Error('Infer a title and at least one acceptance criterion before init.');
  record = { version: 1, id, project, title: value('--title'), status: 'working', createdAt: now,
    finishPoint: value('--finish') || 'locally verified', constraints: values('--constraint'),
    criteria: criteria.map(text => ({ text, verified: false })), pending: [], evidence: [], notes: [] };
} else {
  record = JSON.parse(readFileSync(file, 'utf8'));
  if (command === 'show') { process.stdout.write(`${JSON.stringify(record, null, 2)}\n`); process.exit(0); }
  if (command !== 'checkpoint' && command !== 'finish') throw new Error('Use init, checkpoint, show or finish.');
  if (record.status === 'complete') throw new Error('This task is already complete. Create a new record for new work.');
  const evidence = values('--evidence');
  const verified = values('--verified');
  if (verified.length && !evidence.length) throw new Error('Verification requires an evidence reference or check result.');
  for (const index of verified) {
    const number = Number(index);
    if (!Number.isInteger(number) || !record.criteria[number - 1]) throw new Error('Unknown criterion number.');
    record.criteria[number - 1] = { ...record.criteria[number - 1], verified: true, evidence, verifiedAt: now };
  }
  record.evidence.push(...evidence.map(text => ({ text, at: now })));
  record.notes.push(...values('--note').map(text => ({ text, at: now })));
  if (args.includes('--clear-pending')) record.pending = [];
  record.pending.push(...values('--pending'));
  if (command === 'finish') {
    if (record.pending.length || record.criteria.some(criterion => !criterion.verified)) throw new Error('Task has pending gates or unverified criteria.');
    if (!value('--summary')) throw new Error('A result summary is required.');
    record.status = 'complete'; record.summary = value('--summary'); record.completedAt = now;
  }
}
record.updatedAt = now;
mkdirSync(directory, { recursive: true });
const temporary = `${file}.${randomUUID()}.tmp`;
writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
renameSync(temporary, file);
process.stdout.write(`${JSON.stringify({ id, status: record.status, file, pending: record.pending })}\n`);
