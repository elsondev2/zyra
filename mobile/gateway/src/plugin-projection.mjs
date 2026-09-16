import { assert, fault } from './errors.mjs';
import { createHash } from 'node:crypto';
import { ZYRA_PLUGIN_CONTRIBUTION_SUPPORT, ZYRA_PLUGIN_LIMITS } from '../../../src/plugins/plugin-contract.mjs';

const text = (value, limit = 512) => typeof value === 'string' ? value.slice(0, limit) : '';
const strings = (values, limit = 32) => Array.isArray(values) ? values.slice(0, limit).map(value => text(value, 160)).filter(Boolean) : [];
const kinds = new Set(['skills', 'mcp', 'commands', 'apps', 'agents', 'hooks', 'browserExtensions', 'scheduledTasks']);
const scopePlugin = (entry, installations) => ({ id: text(entry.pluginId, 128), releaseId: text(entry.releaseId, 128), name: text(entry.name, 128), version: text(entry.version, 64), state: text(installations.find(plugin => plugin.id === entry.pluginId)?.state || 'missing', 32) });

/** Explicit mobile projection: no package/Skill paths, source locators, other
 * project sets, chat scopes, raw manifests or executable configuration leave PC. */
export function projectPluginCatalog(catalog, context, params = {}, manageMachine = false) {
  const revision = Number.isSafeInteger(catalog.revision) ? catalog.revision : 0;
  // Include resolved scope/authority so moving a chat or changing access cannot
  // mistake a different view for an unchanged global catalog revision.
  const viewVersion = createHash('sha256').update(JSON.stringify([revision, context.sessionId, context.projectId || null, manageMachine, !!context.machineScope])).digest('hex');
  if (params.ifVersion === viewVersion) return { unchanged: true, revision, viewVersion };
  const query = text(params.query, 160).trim().toLocaleLowerCase();
  let offset = 0;
  if (params.cursor) {
    const match = /^(\d+):(\d+)$/.exec(params.cursor);
    assert(match && Number(match[2]) <= 10000, 'Invalid Plugin page.');
    if (Number(match[1]) !== revision) throw fault('PLUGIN_CATALOG_CHANGED', 'Plugins changed on this PC. Refresh the list.');
    offset = Number(match[2]);
  }
  const limit = Math.max(1, Math.min(50, Number(params.limit) || 32));
  const ownerKind = context.projectId ? 'project' : 'global', ownerId = context.projectId || 'global';
  const defaults = context.machineScope && !manageMachine ? null : catalog.pluginSets.find(set => set.ownerKind === ownerKind && set.ownerId === ownerId);
  const scope = context.machineScope ? null : catalog.chatScopes.find(entry => entry.sessionId === context.sessionId);
  const releases = new Map(catalog.releases.map(release => [release.id, release]));
  const sources = new Map(catalog.sources.map(source => [source.id, source]));
  const selected = strings(defaults?.pluginIds, ZYRA_PLUGIN_LIMITS.maxPlugins).map(id => {
    const plugin = catalog.plugins.find(entry => entry.id === id), release = releases.get(plugin?.activeReleaseId);
    return scopePlugin({pluginId:id,releaseId:release?.id,name:release?.manifest?.interface?.displayName || plugin?.name || id,version:release?.version},catalog.plugins);
  });
  const plugins = catalog.plugins.map(plugin => {
    const release = releases.get(plugin.activeReleaseId), manifest = release?.manifest, display = manifest?.interface;
    const source = sources.get(plugin.sourceId);
    return {
      id: text(plugin.id, 128), name: text(display?.displayName || plugin.name, 160), state: text(plugin.state, 32),
      description: text(display?.shortDescription || manifest?.description), version: text(release?.version, 64),
      releaseId: text(release?.id, 128), digest: text(release?.contentDigest, 64),
      developer: text(display?.developerName || manifest?.author?.name, 160), source: text(source?.kind, 32),
      skillCount: release?.skills?.length || 0,
      skills: (release?.skills || []).slice(0, 3).map(skill => ({ name: text(skill.name, 160), description: text(skill.description, 256) })),
      capabilities: strings(manifest?.declaredCapabilityCeiling),
      contributions: Object.entries(manifest?.contributions || {}).filter(([kind, value]) => kinds.has(kind) && value).map(([kind]) => ({ kind, support: ZYRA_PLUGIN_CONTRIBUTION_SUPPORT[kind] })),
      selectable: plugin.state === 'active' && (release?.skills?.length || 0) > 0,
    };
  }).filter(plugin => !query || `${plugin.name} ${plugin.description} ${plugin.developer}`.toLocaleLowerCase().includes(query))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return {
    revision, viewVersion, hasChat: !context.machineScope, manageMachine, manageDefaults: manageMachine || ownerKind === 'project', selectionLimit: ZYRA_PLUGIN_LIMITS.maxActiveSkillPlugins,
    defaults: { kind: ownerKind, revision: defaults?.revision || 1, pluginIds: strings(defaults?.pluginIds, ZYRA_PLUGIN_LIMITS.maxPlugins), plugins: selected },
    scope: { revision: scope?.scopeRevision || 0, plugins: (scope?.plugins || []).slice(0, ZYRA_PLUGIN_LIMITS.maxActiveSkillPlugins).map(entry => scopePlugin(entry, catalog.plugins)) },
    plugins: plugins.slice(offset, offset + limit),
    nextCursor: offset + limit < plugins.length ? `${revision}:${offset + limit}` : null,
    total: plugins.length,
  };
}
