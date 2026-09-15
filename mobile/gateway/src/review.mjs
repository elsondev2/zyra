import path from 'node:path';
import { realpath, lstat } from 'node:fs/promises';
import { assert } from './errors.mjs';

export const REVIEW_METHODS = new Set(['review.list', 'review.turn', 'review.diff']);
const PATCH_BYTES = 512 * 1024;
const inside = (root, target) => { const relative = path.relative(root, target); return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)); };
const text = (value, max = 2000) => typeof value === 'string' ? value.slice(0, max) : '';
const reason = value => ['binary', 'too-large', 'snapshot-failed', 'preview-only'].includes(value) ? value : undefined;
const samePath = (a, b) => {
  const normalize = value => { const normalized = String(value || '').replaceAll('\\', '/').replace(/^\.\//, ''); return process.platform === 'win32' ? normalized.toLowerCase() : normalized; };
  return normalize(a) === normalize(b);
};

/** Deleted paths are reviewable, but every existing ancestor must remain inside its authorized root. */
async function scopedFile(roots, project, value, excluded) {
  if (typeof value !== 'string' || !value || value.length > 4096 || value.includes('\0') || /^[/\\]{2}/.test(value)) return null;
  const target = path.resolve(project, value);
  if (excluded.some(folder => inside(folder, target))) return null;
  const root = roots.filter(root => inside(root.path, target)).sort((a, b) => b.path.length - a.path.length)[0];
  if (!root || target === root.path) return null;
  let ancestor = target;
  while (inside(root.path, ancestor)) {
    try {
      // lstat distinguishes a broken symlink from an ordinary removed file.
      await lstat(ancestor);
      const resolved = await realpath(ancestor);
      if (!inside(root.path, resolved) || excluded.some(folder => inside(folder, resolved))) return null;
      return { rootId: root.id, path: path.relative(root.path, target).replaceAll('\\', '/') };
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') return null;
      // An existing but broken link must never fall back to its parent.
      const link = await lstat(ancestor).catch(() => null);
      if (link?.isSymbolicLink()) return null;
      if (ancestor === root.path) return null;
      ancestor = path.dirname(ancestor);
    }
  }
  return null;
}

async function projectTurn(entry, roots, project, excluded) {
  const changes = [];
  for (const change of entry.changes || []) {
    const scoped = await scopedFile(roots, project, change.filePath, excluded);
    if (!scoped) continue;
    const previous = change.previousPath ? await scopedFile(roots, project, change.previousPath, excluded) : null;
    if (change.previousPath && (!previous || previous.rootId !== scoped.rootId)) continue;
    changes.push({ activityId: text(change.activityId, 256), ...scoped, ...(previous ? { previousPath: previous.path } : {}),
      kind: ['add', 'delete', 'update', 'move'].includes(change.changeKind) ? change.changeKind : 'update',
      additions: Math.max(0, Number(change.additions) || 0), deletions: Math.max(0, Number(change.deletions) || 0),
      provisional: change.status === 'running' || change.authoritative !== true, truncated: change.truncated === true,
      unavailableReason: reason(change.unavailableReason), createdAt: text(change.createdAt, 64) });
  }
  return { id: text(entry.id, 256), number: entry.number, state: entry.state, prompt: text(entry.prompt?.text), response: text(entry.response?.text),
    agentLabel: text(entry.agentLabel, 120), requestedAt: text(entry.requestedAt, 64), updatedAt: text(entry.updatedAt, 64), changes };
}

export async function reviewHasChanges(index, files, chat, hiddenProjects = []) {
  if (!index) return null;
  const roots = await files.roots(chat), scope = await files.resolveScope?.(chat.canonicalChatId);
  const project = typeof scope?.workingRoot === 'string' ? scope.workingRoot : chat.project;
  const excluded=[];
  for(const folder of hiddenProjects) { excluded.push(path.resolve(folder)); const actual=await realpath(folder).catch(()=>null); if(actual)excluded.push(actual); }
  for(const turn of index.turns || []) for(const change of turn.changes || []) {
    const target=await scopedFile(roots,project,change.filePath,excluded);
    if(!target)continue;
    if(change.previousPath) { const previous=await scopedFile(roots,project,change.previousPath,excluded); if(!previous || previous.rootId!==target.rootId)continue; }
    return true;
  }
  return index.truncated ? null : false;
}

/** Extract only one file's hunks; never expose another file embedded in a shared tool patch. */
export function singleFilePatch(source, targets, displayPath, previousPath, allowHeaderless = false) {
  const lines = String(source || '').replaceAll('\r\n', '\n').split('\n');
  const sections = []; let section = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('diff --git ') || (line.startsWith('--- ') && lines[i + 1]?.startsWith('+++ ') && section?.hasHunk)) {
      if (section) sections.push(section);
      section = { lines: [], paths: [], hasHunk: false };
    }
    section ||= { lines: [], paths: [], hasHunk: false };
    section.lines.push(line);
    if (line.startsWith('@@')) section.hasHunk = true;
    if (line.startsWith('--- ') || line.startsWith('+++ ')) {
      let name = line.slice(4).split('\t')[0].trim();
      if (name.startsWith('"')) { try { name = JSON.parse(name); } catch { name = ''; } }
      if (name && name !== '/dev/null') section.paths.push(name.replace(/^[ab]\//, ''));
    }
  }
  if (section) sections.push(section);
  let selected = sections.find(part => part.paths.some(name => targets.some(target => samePath(name, target))));
  if (!selected && allowHeaderless && sections.length === 1 && sections[0].paths.length === 0) selected = sections[0];
  if (!selected?.hasHunk) return '';
  const firstHunk = selected.lines.findIndex(line => line.startsWith('@@'));
  const hunkLines = selected.lines.slice(firstHunk);
  if (hunkLines.some(line => line !== '' && !/^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/.test(line) && !/^[ +\-]/.test(line) && !line.startsWith('\\ No newline'))) return '';
  const hunks = hunkLines.join('\n');
  // All original headers can contain full PC paths. Rebuild them from scoped relative names.
  return `--- ${JSON.stringify('a/' + (previousPath || displayPath))}\n+++ ${JSON.stringify('b/' + displayPath)}\n${hunks}`;
}

export async function readReview(review, files, method, params, chat, hiddenProjects = []) {
  assert(review, 'Update Zyra Desktop to review turns on your phone.');
  const index = await review.index(chat.canonicalChatId);
  const roots = await files.roots(chat);
  const scope = await files.resolveScope?.(chat.canonicalChatId);
  const project = typeof scope?.workingRoot === 'string' && path.isAbsolute(scope.workingRoot) ? scope.workingRoot : chat.project;
  const excluded = [];
  for (const folder of hiddenProjects) { excluded.push(path.resolve(folder)); const resolved = await realpath(folder).catch(() => null); if (resolved) excluded.push(resolved); }
  const entries = [...(index.turns || [])].sort((a, b) => b.number - a.number);
  if (method === 'review.list') {
    const limit = Math.max(1, Math.min(40, Number.isSafeInteger(params.limit) ? params.limit : 40));
    const before = params.before ? entries.findIndex(entry => entry.id === params.before) : -1;
    assert(!params.before || before >= 0, 'Refresh the review list to continue.');
    const page = entries.slice(before + 1, before + 1 + limit);
    const turns = [];
    for (const entry of page) turns.push(await projectTurn(entry, roots, project, excluded));
    return { turns, totalTurns: entries.length, nextCursor: before + 1 + page.length < entries.length ? page.at(-1)?.id : null };
  }
  assert(typeof params.turnId === 'string' && params.turnId.length <= 256, 'Choose a turn.');
  const entry = entries.find(entry => entry.id === params.turnId);
  assert(entry, 'This turn is not available in this chat.');
  const turn = await projectTurn(entry, roots, project, excluded);
  if (method === 'review.turn') {
    const detail = await review.turn(chat.canonicalChatId, entry.id);
    const source = detail.messages || [];
    const messages = [source.find(message => message.role === 'user'), source.findLast(message => message.role === 'assistant')].filter(Boolean)
      .map(message => ({ id: text(message.id, 256), role: message.role, text: text(message.text, 60000), truncated: String(message.text || '').length > 60000, createdAt: text(message.createdAt, 64) }));
    return { turn, messages };
  }
  const chosen = turn.changes.find(change => change.activityId === params.activityId && change.rootId === params.rootId && change.path === params.path);
  assert(chosen, 'This change is not available in the shared folders.');
  const source = entry.changes.find(change => change.activityId === chosen.activityId && samePath(path.resolve(project, change.filePath), path.resolve(roots.find(root => root.id === chosen.rootId).path, chosen.path)));
  const detail = await review.turn(chat.canonicalChatId, entry.id);
  const currentTurn = await projectTurn(entry, await files.roots(chat), project, excluded);
  assert(currentTurn.changes.some(change => change.activityId === chosen.activityId && change.rootId === chosen.rootId && change.path === chosen.path), 'This change is no longer available in the shared folders.');
  const activity = (detail.activities || []).find(activity => activity.id === chosen.activityId);
  const change = activity?.changes?.find(change => samePath(path.resolve(project, change.path), path.resolve(project, source.filePath)));
  const targets = [source.filePath, source.previousPath, path.resolve(project, source.filePath), chosen.path, chosen.previousPath].filter(Boolean);
  const patch = singleFilePatch(change?.diff || activity?.patch || '', targets, chosen.path, chosen.previousPath, !!change?.diff);
  const bytes = Buffer.from(patch, 'utf8');
  const truncated = bytes.length > PATCH_BYTES || chosen.truncated || activity?.truncated === true;
  const bounded = bytes.length > PATCH_BYTES ? bytes.subarray(0, PATCH_BYTES).toString('utf8').replace(/\uFFFD$/, '') : patch;
  return { ...chosen, patch: bounded, truncated, unavailableReason: bounded ? (truncated ? 'too-large' : undefined) : reason(activity?.unavailableReason) || 'snapshot-failed' };
}
