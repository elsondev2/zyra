import path from 'node:path';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, realpath, rename, rm, rmdir, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { normalizeVisualizationInput, validateVisualizationId, validateVisualizationVersion, validateVisualizationResource, validateVisualizationTimestamp, MAX_VISUALIZATION_REVISIONS, MAX_VISUALIZATION_SOURCE, VISUALIZATION_ID_PATTERN } from './resources.mjs';

export const MAX_VISUALIZATION_MANIFEST_BYTES = 8 * 1024 * 1024;
export const MAX_VISUALIZATION_PROJECT_BYTES = 16 * 1024 * 1024;
export const MAX_VISUALIZATION_RESOURCES = 500;
export const VISUALIZATION_LOCK_STALE_MS = 30000;

const extension = { html: 'html', mermaid: 'mmd', scene3d: 'json' };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function missing(error) { return error?.code === 'ENOENT'; }
async function safeEntry(file, type, optional = false) {
  let stat;
  try { stat = await lstat(file); } catch (error) { if (optional && missing(error)) return false; throw error; }
  if (stat.isSymbolicLink() || (type === 'directory' ? !stat.isDirectory() : !stat.isFile())) throw new Error(`Unsafe visualization path: ${file}`);
  if (type === 'file' && stat.nlink > 1) throw new Error('Hard-linked visualization files are not allowed.');
  return true;
}
async function writeDurable(file, content) {
  const handle = await open(file, constants.O_NOFOLLOW ? constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW : 'wx', 0o600);
  let complete = false;
  try { await handle.writeFile(content, 'utf8'); await handle.sync(); complete = true; }
  finally {
    await handle.close();
    if (!complete) await unlink(file).catch(error => { if (!missing(error)) throw error; });
  }
}
async function readBounded(handle, maximum) {
  const chunks = []; let total = 0;
  while (true) {
    const buffer = Buffer.alloc(Math.min(64 * 1024, maximum + 1 - total));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
    if (!bytesRead) return Buffer.concat(chunks, total).toString('utf8');
    total += bytesRead;
    if (total > maximum) throw new Error('Oversized visualization manifest.');
    chunks.push(buffer.subarray(0, bytesRead));
  }
}
async function syncDirectory(directory) {
  let handle;
  try { handle = await open(directory, 'r'); await handle.sync(); }
  catch (error) { if (!['EINVAL', 'EISDIR', 'EPERM', 'EACCES', 'ENOTSUP'].includes(error?.code)) throw error; }
  finally { await handle?.close(); }
}
function originValue(value) {
  if (!value || typeof value.threadId !== 'string' || !value.threadId || value.threadId.length > 256
    || typeof value.messageId !== 'string' || !value.messageId || value.messageId.length > 256
    || !Number.isSafeInteger(value.offset) || value.offset < 0) throw new Error('Legacy import needs threadId, messageId and nonnegative offset provenance.');
  if (value.turnId !== undefined && (typeof value.turnId !== 'string' || value.turnId.length > 256)) throw new Error('Invalid origin turnId.');
  return { threadId: value.threadId, messageId: value.messageId, offset: value.offset, ...(value.turnId !== undefined ? { turnId: value.turnId } : {}) };
}
function importId(kind, origin) {
  const hex = createHash('sha256').update(JSON.stringify([kind, origin.threadId, origin.messageId, origin.offset])).digest('hex').slice(0, 32).split('');
  hex[12] = '5'; hex[16] = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
  const id = hex.join('');
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}
function revision(input, version, parentVersion, createdAt, changeNote = '', origin) {
  if (typeof changeNote !== 'string' || changeNote.length > 1200) throw new Error('changeNote must be at most 1200 characters.');
  return { version, parentVersion, source: input.source, title: input.title, summary: input.summary, createdAt, changeNote, height: input.height, ...(origin ? { origin } : {}) };
}
/** Project-local durable resources. A directory lock serializes writers across store instances/processes. */
export function createVisualizationStore({ cwd, threadId } = {}) {
  if (typeof cwd !== 'string' || !cwd || typeof threadId !== 'string' || !threadId || threadId.length > 256) throw new Error('Visualization store needs trusted cwd and threadId.');
  const project = path.resolve(cwd), data = path.join(project, '.zyra'), root = path.join(data, 'visualizations');
  const projectIdentity = realpath(project);
  async function ensureRoot(write = false) {
    if (await realpath(project) !== await projectIdentity) throw new Error('Visualization project destination changed.');
    for (const directory of [data, root]) {
      if (!await safeEntry(directory, 'directory', true)) {
        if (!write) return false;
        try { await mkdir(directory, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
        await safeEntry(directory, 'directory');
        await syncDirectory(path.dirname(directory));
      }
    }
    return true;
  }
  const directoryFor = id => path.join(root, validateVisualizationId(id));
  async function load(id) {
    id = validateVisualizationId(id);
    if (!await ensureRoot()) return null;
    const directory = directoryFor(id);
    if (!await safeEntry(directory, 'directory', true)) return null;
    const manifest = path.join(directory, 'resource.json');
    if (!await safeEntry(manifest, 'file', true)) return null;
    const handle = await open(manifest, constants.O_NOFOLLOW ? constants.O_RDONLY | constants.O_NOFOLLOW : 'r');
    let resource;
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.nlink > 1 || stat.size > MAX_VISUALIZATION_MANIFEST_BYTES) throw new Error('Invalid or oversized visualization manifest.');
      resource = JSON.parse(await readBounded(handle, MAX_VISUALIZATION_MANIFEST_BYTES));
    } finally { await handle.close(); }
    validateVisualizationResource(resource);
    if (resource.id !== id) throw new Error('Invalid visualization resource manifest ID.');
    for (let index = 0; index < resource.versions.length; index++) {
      const version = resource.versions[index];
      if (version.version !== index + 1 || (index === 0 ? version.parentVersion !== null : !Number.isInteger(version.parentVersion) || version.parentVersion < 1 || version.parentVersion > index)
        || typeof version.source !== 'string') throw new Error('Invalid visualization revision history.');
      const sourceFile = path.join(directory, `v${version.version}.${extension[resource.kind]}`);
      await safeEntry(sourceFile, 'file');
      const sourceHandle = await open(sourceFile, constants.O_NOFOLLOW ? constants.O_RDONLY | constants.O_NOFOLLOW : 'r');
      try {
        const stat = await sourceHandle.stat();
        if (!stat.isFile() || stat.nlink > 1 || stat.size > MAX_VISUALIZATION_SOURCE) throw new Error('Invalid or oversized visualization source file.');
        const actual = await readBounded(sourceHandle, MAX_VISUALIZATION_SOURCE);
        const expected = resource.kind === 'scene3d' ? `${JSON.stringify(JSON.parse(version.source), null, 2)}\n` : version.source;
        if (actual !== Buffer.from(expected, 'utf8').toString('utf8')) throw new Error('Visualization source file differs from its immutable revision.');
      } finally { await sourceHandle.close(); }
    }
    return resource;
  }
  async function readLockOwner(lock) {
    const ownerFile = path.join(lock, 'owner.json');
    try {
      if (!await safeEntry(lock, 'directory', true) || !await safeEntry(ownerFile, 'file', true)) return null;
      const handle = await open(ownerFile, constants.O_NOFOLLOW ? constants.O_RDONLY | constants.O_NOFOLLOW : 'r');
      let text;
      try { text = await readBounded(handle, 4096); } finally { await handle.close(); }
      let owner;
      try { owner = JSON.parse(text); } catch { return null; } // Initial owner publication may still be in flight.
      if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0 || !VISUALIZATION_ID_PATTERN.test(owner.token) || typeof owner.createdAt !== 'string' || !Number.isFinite(Date.parse(owner.createdAt))) return null;
      return owner;
    } catch (error) { if (missing(error)) return null; throw error; }
  }
  function ownerIsDead(owner) {
    try { process.kill(owner.pid, 0); return false; }
    catch (error) { return error.code === 'ESRCH'; } // Permission errors and reused/live PIDs never authorize recovery.
  }
  async function reapDeadLock(lock) {
    const owner = await readLockOwner(lock);
    if (!owner || Date.now() - Date.parse(owner.createdAt) < VISUALIZATION_LOCK_STALE_MS || !ownerIsDead(owner)) return false;
    const identity = await lstat(lock).catch(error => { if (missing(error)) return null; throw error; });
    if (!identity) return false;
    const claim = path.join(lock, '.reaping');
    try { await mkdir(claim, { mode: 0o700 }); }
    catch (error) { if (error.code === 'EEXIST' || missing(error)) return false; throw error; }
    let moved = false;
    try {
      const current = await readLockOwner(lock), stat = await lstat(lock).catch(error => { if (missing(error)) return null; throw error; });
      if (!current || current.token !== owner.token || !stat || stat.ino !== identity.ino || stat.dev !== identity.dev || !ownerIsDead(current)) return false;
      const quarantine = path.join(root, `.abandoned-${owner.token}-${randomUUID()}`);
      await rename(lock, quarantine); moved = true;
      await syncDirectory(root);
      await rm(quarantine, { recursive: true });
      return true;
    } finally { if (!moved) await rmdir(claim).catch(error => { if (!missing(error)) throw error; }); }
  }
  async function recoverUncommittedSources() {
    for (const id of await readdir(root)) {
      if (!VISUALIZATION_ID_PATTERN.test(id)) continue;
      const directory = directoryFor(id); await safeEntry(directory, 'directory');
      const resource = await load(id), entries = await readdir(directory);
      const removable = entries.filter(name => /^\.resource-[0-9a-f-]+\.tmp$/.test(name)
        || (/^v[1-9][0-9]*\.(?:html|mmd|json)$/.test(name) && (!resource || Number(name.match(/^v([0-9]+)/)[1]) > resource.latestVersion)));
      // An absent manifest can only be repaired when every entry is a known uncommitted artifact.
      if (!resource && removable.length !== entries.length) throw new Error('Incomplete visualization directory contains unknown files; explicit repair required.');
      for (const name of removable) { const file = path.join(directory, name); await safeEntry(file, 'file'); await unlink(file); }
      if (!resource) { await rmdir(directory); await syncDirectory(root); }
      else if (removable.length) await syncDirectory(directory);
    }
  }
  async function withLock(callback) {
    await ensureRoot(true);
    const lock = path.join(root, '.write-lock');
    const deadline = Date.now() + 10000;
    const owner = { pid: process.pid, token: randomUUID(), createdAt: new Date().toISOString() };
    while (true) {
      await ensureRoot();
      try { await mkdir(lock, { mode: 0o700 }); break; }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        // The holder may release between EEXIST and lstat; retry that normal race.
        if (!await safeEntry(lock, 'directory', true)) continue;
        if (await reapDeadLock(lock)) continue;
        if (Date.now() >= deadline) throw new Error('Visualization store is busy (or has a stale .write-lock from an interrupted process).');
        await sleep(20);
      }
    }
    let published = false;
    try {
      await writeDurable(path.join(lock, 'owner.json'), `${JSON.stringify(owner)}\n`); published = true;
      await syncDirectory(lock);
      await recoverUncommittedSources();
      return await callback();
    } finally {
      if (published) await unlink(path.join(lock, 'owner.json'));
      // A losing stale-lock claimant may briefly be checking this newly acquired lock.
      for (let attempt = 0; ; attempt++) {
        try { await rmdir(lock); break; }
        catch (error) { if (error.code !== 'ENOTEMPTY' || attempt >= 10) throw error; await sleep(20); }
      }
    }
  }
  async function projectBudget(replacementId, replacementBytes = 0) {
    const entries = (await readdir(root)).filter(entry => VISUALIZATION_ID_PATTERN.test(entry));
    if (entries.length > MAX_VISUALIZATION_RESOURCES || (replacementId && !entries.includes(replacementId) && entries.length >= MAX_VISUALIZATION_RESOURCES)) throw new Error('Visualization resource count limit reached.');
    let total = replacementBytes;
    for (const id of entries) {
      const directory = directoryFor(id); await safeEntry(directory, 'directory');
      const file = path.join(directory, 'resource.json');
      if (!await safeEntry(file, 'file', true)) continue;
      const stat = await lstat(file);
      if (stat.size > MAX_VISUALIZATION_MANIFEST_BYTES) throw new Error('Oversized visualization manifest.');
      if (id !== replacementId) total += stat.size;
      if (total > MAX_VISUALIZATION_PROJECT_BYTES) throw new Error('Visualization project source budget exceeded.');
    }
    if (total > MAX_VISUALIZATION_PROJECT_BYTES) throw new Error('Visualization project source budget exceeded.');
  }
  async function save(resource, added) {
    await ensureRoot(true);
    validateVisualizationResource(resource);
    const manifestContent = `${JSON.stringify(resource, null, 2)}\n`;
    const manifestBytes = Buffer.byteLength(manifestContent, 'utf8');
    if (manifestBytes > MAX_VISUALIZATION_MANIFEST_BYTES) throw new Error('Visualization manifest exceeds 8 MiB.');
    await projectBudget(resource.id, manifestBytes);
    const directory = directoryFor(resource.id);
    try { await mkdir(directory, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    await safeEntry(directory, 'directory');
    await syncDirectory(root);
    const manifest = path.join(directory, 'resource.json');
    await safeEntry(manifest, 'file', true);
    const sourceFile = path.join(directory, `v${added.version}.${extension[resource.kind]}`);
    // A prior crash may leave an uncommitted source. Never overwrite it implicitly.
    const temporary = path.join(directory, `.resource-${randomUUID()}.tmp`);
    let sourceWritten = false, committed = false;
    try {
      await writeDurable(sourceFile, resource.kind === 'scene3d' ? `${JSON.stringify(JSON.parse(added.source), null, 2)}\n` : added.source);
      sourceWritten = true;
      await writeDurable(temporary, manifestContent);
      await ensureRoot(); await safeEntry(directory, 'directory'); await safeEntry(manifest, 'file', true);
      await rename(temporary, manifest); committed = true;
      await syncDirectory(directory);
    } finally {
      await unlink(temporary).catch(error => { if (!missing(error)) throw error; });
      if (sourceWritten && !committed) await unlink(sourceFile);
    }
    return resource;
  }
  async function createWithId(input, id, origin, createdAt) {
    const now = createdAt === undefined ? new Date().toISOString() : validateVisualizationTimestamp(createdAt);
    const first = revision(input, 1, null, now, '', origin);
    const resource = { id, title: input.title, kind: input.kind, summary: input.summary, threadId: origin?.threadId ?? threadId, createdAt: now, updatedAt: now, latestVersion: 1, versions: [first] };
    return save(resource, first);
  }
  return {
    async list({ threadOnly = false, query = '' } = {}) {
      if (typeof query !== 'string' || query.length > 1200 || typeof threadOnly !== 'boolean') throw new Error('Invalid visualization list filter.');
      if (!await ensureRoot()) return [];
      await projectBudget();
      const result = [], needle = query.toLowerCase(); let resultBytes = 0;
      for (const entry of await readdir(root)) {
        if (!VISUALIZATION_ID_PATTERN.test(entry)) continue;
        const resource = await load(entry);
        if (!resource || (threadOnly && resource.threadId !== threadId)
          || (needle && !`${resource.title}\n${resource.summary}\n${resource.kind}`.toLowerCase().includes(needle))) continue;
        resultBytes += Buffer.byteLength(JSON.stringify(resource), 'utf8');
        if (resultBytes > MAX_VISUALIZATION_PROJECT_BYTES) throw new Error('Visualization list source budget exceeded.');
        result.push(resource);
      }
      return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
    },
    async get(id, version) {
      const resource = await load(id);
      if (!resource) return null;
      const selected = version === undefined ? resource.latestVersion : validateVisualizationVersion(version);
      const selectedVersion = resource.versions.find(item => item.version === selected);
      if (!selectedVersion) throw new Error('Visualization version does not exist.');
      return { ...resource, selectedVersion };
    },
    async create(input) {
      const normalized = normalizeVisualizationInput(input);
      return withLock(() => createWithId(normalized, randomUUID()));
    },
    async revise(input) {
      const id = validateVisualizationId(input?.id);
      const baseVersion = validateVisualizationVersion(input.baseVersion);
      const expectedVersion = validateVisualizationVersion(input.expectedVersion);
      return withLock(async () => {
        const resource = await load(id);
        if (!resource) throw new Error('Visualization does not exist.');
        if (resource.latestVersion !== expectedVersion) {
          const error = new Error(`Visualization version conflict: expected ${expectedVersion}, latest is ${resource.latestVersion}.`);
          error.code = 'VISUALIZATION_CONFLICT'; throw error;
        }
        if (resource.latestVersion >= MAX_VISUALIZATION_REVISIONS) throw new Error('Visualization revision limit reached (128).');
        const base = resource.versions.find(item => item.version === baseVersion);
        if (!base) throw new Error('Base visualization version does not exist.');
        if (input.kind !== undefined && input.kind !== resource.kind) throw new Error('Visualization kind is immutable.');
        const normalized = normalizeVisualizationInput({ kind: resource.kind, source: input.source,
          title: input.title ?? base.title, summary: input.summary ?? base.summary, height: input.height ?? base.height });
        const now = new Date().toISOString();
        const added = revision(normalized, resource.latestVersion + 1, baseVersion, now, input.changeNote ?? '');
        return save({ ...resource, title: added.title, summary: added.summary, latestVersion: added.version, updatedAt: now, versions: [...resource.versions, added] }, added);
      });
    },
    async importLegacy(input) {
      const origin = originValue(input?.origin);
      const normalized = normalizeVisualizationInput(input, { legacy: true });
      const createdAt = input.createdAt === undefined ? undefined : validateVisualizationTimestamp(input.createdAt);
      const id = importId(normalized.kind, origin);
      return withLock(async () => {
        const existing = await load(id);
        if (existing) return existing;
        return createWithId(normalized, id, origin, createdAt);
      });
    },
  };
}
