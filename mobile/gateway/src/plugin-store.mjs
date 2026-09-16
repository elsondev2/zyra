import { assert, fault } from './errors.mjs';

const text = (value, max = 512) => typeof value === 'string' ? value.slice(0, max) : '';
const https = value => { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; } catch { return ''; } };

export function projectPluginStore(directory, params = {}, manageMachine = false, installed = []) {
  const query = text(params.query, 160).trim().toLowerCase(), category = text(params.category, 100);
  const revision = text(directory.commit, 64), entries = directory.entries || [];
  const categories = [...new Set(entries.map(entry => text(entry.category, 100)).filter(Boolean))].sort();
  let offset = 0;
  if (params.cursor) {
    const parts = String(params.cursor).split(':');
    assert(parts.length === 2 && /^\d+$/.test(parts[1]), 'Invalid Plugin Store page.');
    if (parts[0] !== revision) throw fault('PLUGIN_STORE_CHANGED', 'The Plugin Store changed. Refresh to continue.');
    offset = Number(parts[1]); assert(offset <= 10000, 'Invalid Plugin Store page.');
  }
  const rows = entries.filter(entry => (!category || entry.category === category) && (!query || [entry.displayName, entry.description, entry.publisher].join(' ').toLowerCase().includes(query)))
    .map(entry => ({ name: text(entry.name, 128), title: text(entry.displayName, 160), description: text(entry.description),
      detail: text(entry.longDescription, 1800), version: text(entry.version, 64), publisher: text(entry.publisher, 160), category: text(entry.category, 100),
      license: text(entry.license, 100), sourceUrl: https(entry.sourceUrl), hasSkills: entry.hasSkills === true,
      installable: entry.hasSkills === true && entry.installation !== 'BLOCKED',
      contributions: [entry.hasSkills && 'Skills', entry.hasMcp && 'MCP', entry.hasApps && 'Apps'].filter(Boolean) }));
  for (const entry of rows) {
    const current = installed.find(plugin => plugin.name === entry.name && plugin.sourceId === `openai-catalog:${entry.name}`);
    entry.installedVersion = text(current?.version, 64); entry.installedState = text(current?.state, 32);
  }
  const limit = Math.max(1, Math.min(32, Math.floor(Number(params.limit) || 24)));
  return { revision, manageMachine, categories, entries: rows.slice(offset, offset + limit), total: rows.length, nextCursor: offset + limit < rows.length ? `${revision}:${offset + limit}` : null };
}

export function projectPluginDownload(value) {
  const review = value.inspection, release = review?.release, manifest = review?.manifest;
  return {
    id: text(value.id, 128), status: text(value.status, 32), error: value.status === 'failed' ? 'The PC could not prepare this Plugin. Cancel and try again.' : null,
    progress: value.progress ? Object.fromEntries(['phase', 'completedFiles', 'totalFiles', 'completedBytes', 'totalBytes', 'cacheHits'].map(key => [key, key === 'phase' ? text(value.progress[key], 32) : Math.max(0, Number(value.progress[key]) || 0)])) : null,
    review: review ? {
      id: text(review.reviewId, 128), expiresAt: text(review.expiresAt, 64), title: text(manifest?.interface?.displayName || release?.name, 160),
      version: text(release?.version, 64), digest: text(release?.contentDigest, 64), description: text(manifest?.description, 1800),
      fileCount: release?.fileCount || 0, bytes: release?.totalBytes || 0, executableFiles: release?.containsExecutableFiles === true,
      capabilities: (manifest?.declaredCapabilityCeiling || []).slice(0, 32).map(value => text(value, 160)),
      skillCount: release?.skills?.length || 0,
      skills: (release?.skills || []).slice(0, 256).map(skill => ({name:text(skill.name, 160),description:text(skill.description, 256)})),
      contributions: (release?.contributions || []).slice(0, 16).map(item => ({kind:text(item.kind, 64),support:text(item.support, 32)})),
      diagnosticCount: release?.diagnostics?.length || 0,
      notes: (release?.diagnostics || []).slice(0, 32).map(note => note.type === 'unsupported-contribution' && ['skills','mcp','apps','commands','agents','hooks','browserExtensions','scheduledTasks'].includes(note.contribution)
        ? `${note.contribution} is included but disabled by this Zyra release.` : 'The package has an additional inspection note. Review it on your PC.'),
    } : null,
  };
}

export const PLUGIN_STORE_METHODS = new Set(['plugins.store', 'plugins.download.start', 'plugins.download.status', 'plugins.download.cancel', 'plugins.install']);

/** One connection owns one PC acquisition. No caller-supplied owner or path. */
export class MobilePluginDownloads {
  constructor(api) { this.api = api; this.closed = false; this.current = null; this.review = null; this.busy = false; this.generation = 0; }
  check() { if (this.closed) throw fault('CONNECTION_CLOSED', 'Reconnect to the PC before preparing a Plugin.'); }
  async dispatch(method, params, manageMachine) {
    this.check();
    if (method === 'plugins.store') {
      const directory = await this.api.directory(); this.check();
      const installed = await this.api.installed?.() || []; this.check();
      return projectPluginStore(directory, params, manageMachine, installed);
    }
    assert(manageMachine, 'This phone needs access to all projects before installing Plugins on this PC.');
    if (method === 'plugins.download.cancel') { this.generation++; this.current = null; this.review = null; await this.api.cancelAll(); return {cancelled:true}; }
    if (method === 'plugins.download.start') {
      assert(!this.current && !this.busy, 'Finish or cancel the current Plugin review first.');
      assert(typeof params.name === 'string' && /^[a-z0-9][a-z0-9-]{0,127}$/.test(params.name), 'Choose a Plugin from the Store.');
      this.busy = true;
      const epoch = this.generation;
      try {
        const value = await this.api.start(params.name);
        if (this.closed) { await this.api.cancelAll(); this.check(); }
        if (epoch !== this.generation) { await this.api.cancelAll(); throw fault('PLUGIN_CANCELLED', 'Plugin preparation was cancelled.'); }
        this.current = value.id; this.review = null;
        return projectPluginDownload(value);
      } finally { this.busy = false; }
    }
    assert(this.current && params.id === this.current, 'This Plugin download is missing or belongs to another connection.');
    if (method === 'plugins.download.status') {
      const epoch = this.generation;
      const value = await this.api.status(this.current); this.check();
      assert(epoch === this.generation, 'This Plugin preparation was cancelled.');
      this.review = value.status === 'ready' ? value.inspection : null;
      return projectPluginDownload(value);
    }
    assert(method === 'plugins.install', 'This Plugin Store action is unavailable.');
    const review = this.review;
    assert(params.confirmed === true && review && params.reviewId === review.reviewId && params.digest === review.release.contentDigest && Date.parse(review.expiresAt) > Date.now(), 'Review the prepared Plugin before installing it.');
    assert(!this.busy, 'This Plugin is already being installed.');
    this.busy = true; this.review = null;
    try { await this.api.install(review.reviewId); this.check(); this.current = null; return {installed:true}; }
    finally { this.busy = false; }
  }
  close() { if (this.closed) return; this.closed = true; this.review = null; void Promise.resolve(this.api.cancelAll()).catch(() => {}); }
}
