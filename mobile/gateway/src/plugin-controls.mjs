import { assert, fault } from './errors.mjs';
import { ZYRA_PLUGIN_LIMITS, ZYRA_PLUGIN_CONTRIBUTION_SUPPORT } from '../../../src/plugins/plugin-contract.mjs';

const text = (value, max = 512) => typeof value === 'string' ? value.slice(0, max) : '';
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 128;
export const PLUGIN_CONTROL_METHODS = new Set(['plugins.detail', 'plugins.state', 'plugins.rollback']);

export function projectPluginDetail(catalog, pluginId, releaseId, manageMachine = false) {
  assert(id(pluginId), 'Choose an installed Plugin.');
  const plugin = catalog.plugins.find(item => item.id === pluginId);
  if (!plugin) throw fault('PLUGIN_NOT_FOUND', 'This Plugin is no longer installed. Refresh the list.');
  const current = catalog.releases.find(item => item.id === plugin.activeReleaseId && item.pluginId === pluginId);
  const chosen = releaseId || plugin.activeReleaseId;
  const release = catalog.releases.find(item => item.id === chosen && item.pluginId === pluginId && plugin.releaseIds.includes(item.id));
  if (!release) throw fault('PLUGIN_RELEASE_NOT_FOUND', 'This saved version is no longer available. Refresh the Plugin.');
  const source = catalog.sources.find(item => item.id === plugin.sourceId);
  return {
    revision: catalog.revision, manageMachine,
    plugin: {id:plugin.id,name:text(plugin.name,128),title:text(current?.manifest?.interface?.displayName || plugin.name,160),state:text(plugin.state,32),version:text(current?.version,64),activeReleaseId:text(plugin.activeReleaseId,128),source:text(source?.kind,32)},
    release: {id:release.id,version:text(release.version,64),digest:text(release.contentDigest,64),installedAt:text(release.installedAt,64),
      description:text(release.manifest?.interface?.longDescription || release.manifest?.description,1800),fileCount:release.fileCount,bytes:release.totalBytes,executableFiles:release.containsExecutableFiles===true,
      skills:(release.skills || []).slice(0,ZYRA_PLUGIN_LIMITS.maxSkills).map(skill=>({name:text(skill.name,160),description:text(skill.description,256)})),
      capabilities:(release.manifest?.declaredCapabilityCeiling || []).slice(0,32).map(value=>text(value,160)),
      contributions:Object.entries(release.manifest?.contributions || {}).filter(([kind,value])=>value && Object.hasOwn(ZYRA_PLUGIN_CONTRIBUTION_SUPPORT,kind)).map(([kind])=>({kind,support:ZYRA_PLUGIN_CONTRIBUTION_SUPPORT[kind]}))},
    releases:plugin.releaseIds.slice(0,ZYRA_PLUGIN_LIMITS.maxReleasesPerPlugin).map(id=>catalog.releases.find(item=>item.id===id && item.pluginId===pluginId)).filter(Boolean)
      .map(item=>({id:item.id,version:text(item.version,64),installedAt:text(item.installedAt,64),current:item.id===plugin.activeReleaseId})),
  };
}

export async function dispatchPluginControl(api, method, params, manageMachine, check) {
  const catalog = await api.catalog(); check();
  const detail = projectPluginDetail(catalog, params.pluginId, method === 'plugins.detail' || method === 'plugins.rollback' ? params.releaseId : null, manageMachine);
  if (method === 'plugins.detail') return detail;
  assert(manageMachine, 'This phone needs access to all projects before changing Plugins on this PC.');
  assert(params.confirmed === true && Number.isSafeInteger(params.expectedCatalogRevision) && params.expectedCatalogRevision >= 1, 'Review this change before applying it.');
  if (params.expectedCatalogRevision !== catalog.revision) throw fault('PLUGIN_CATALOG_REVISION_CHANGED', 'Plugins changed after this review. Refresh and review them again.');
  if (method === 'plugins.state') {
    assert(typeof api.state === 'function', 'Update Zyra Desktop to change Plugin state.');
    assert(params.state === 'active' || params.state === 'disabled', 'Choose a valid Plugin state.');
    await api.state({pluginId:params.pluginId,state:params.state,expectedCatalogRevision:params.expectedCatalogRevision});
  } else {
    assert(method === 'plugins.rollback' && typeof api.rollback === 'function', 'Update Zyra Desktop to restore a Plugin version.');
    assert(id(params.releaseId) && params.releaseId !== detail.plugin.activeReleaseId && params.digest === detail.release.digest, 'Review a different saved Plugin version before restoring it.');
    await api.rollback({pluginId:params.pluginId,releaseId:params.releaseId,expectedCatalogRevision:params.expectedCatalogRevision});
  }
  check();
  const after = await api.catalog(); check();
  return projectPluginDetail(after,params.pluginId,null,manageMachine);
}
