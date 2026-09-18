import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {ZyraPluginRegistry} from '../../../src/plugins/plugin-registry.mjs';

async function fixture(run) {
  const parent=path.resolve(os.tmpdir()),root=await mkdtemp(path.join(parent,'zyra-mobile-plugin-controls-'));
  try {
    const source=path.join(root,'source');await mkdir(path.join(source,'.codex-plugin'),{recursive:true});await mkdir(path.join(source,'skills','work'),{recursive:true});
    await writeFile(path.join(source,'skills','work','SKILL.md'),'---\nname: work\ndescription: Test a bounded task.\n---\nRead the fixture.\n');
    const registry=new ZyraPluginRegistry({rootPath:path.join(root,'registry')});
    for(const version of ['1.0.0','2.0.0']) {
      await writeFile(path.join(source,'.codex-plugin','plugin.json'),JSON.stringify({name:'test-plugin',version,description:'Synthetic plugin',skills:'./skills/'}));
      const inspected=await registry.inspectLocalPackage(source);
      await registry.installLocalPackage({packageRoot:source,sourceId:'test-source',approved:true,approvedDigest:inspected.release.contentDigest});
    }
    const plugin=(await registry.getCatalog()).plugins[0];
    await registry.setEnabledPlugins({projectId:'project',pluginIds:[plugin.id],expectedRevision:1});
    await registry.createChatScope({sessionId:'chat',projectId:'project'});
    await run(registry,plugin);
  } finally {assert.equal(path.dirname(path.resolve(root)),parent);await rm(root,{recursive:true,force:true});}
}
for(const action of ['disable','rollback']) test(`reviewed ${action} cannot overtake a queued PC change`,()=>fixture(async(registry,plugin)=>{
  const reviewed=await registry.getCatalog();const before=await registry.getChatScope('chat');
  const older=reviewed.releases.find(release=>release.version==='1.0.0');
  const pc=registry.setEnabledPlugins({projectId:'another-project',pluginIds:[],expectedRevision:1});
  const phone=action==='disable'?registry.setPluginState(plugin.id,'disabled',reviewed.revision):registry.rollbackPlugin({pluginId:plugin.id,releaseId:older.id,approved:true,expectedCatalogRevision:reviewed.revision});
  await pc;await assert.rejects(phone,{code:'PLUGIN_CATALOG_REVISION_CHANGED'});
  const after=await registry.getCatalog();assert.equal(after.plugins[0].state,'active');assert.equal(after.plugins[0].activeReleaseId,plugin.activeReleaseId);
  assert.deepEqual(await registry.getChatScope('chat'),before);assert.deepEqual(after.pluginSets.find(set=>set.ownerId==='project').pluginIds,[plugin.id]);
}));
test('valid controls preserve frozen chats and disabled state while rejecting invalid states',()=>fixture(async(registry,plugin)=>{
  await assert.rejects(registry.setPluginState(plugin.id,'not-a-state'),{code:'PLUGIN_STATE_INVALID'});
  await assert.rejects(registry.setPluginState(plugin.id,'disabled',-1),{code:'PLUGIN_CATALOG_REVISION_REQUIRED'});
  const before=await registry.getChatScope('chat');let catalog=await registry.getCatalog();
  await registry.setPluginState(plugin.id,'disabled',catalog.revision);catalog=await registry.getCatalog();
  assert.deepEqual(catalog.pluginSets.find(set=>set.ownerId==='project').pluginIds,[]);
  const older=catalog.releases.find(release=>release.version==='1.0.0');
  await registry.rollbackPlugin({pluginId:plugin.id,releaseId:older.id,approved:true,expectedCatalogRevision:catalog.revision});
  catalog=await registry.getCatalog();assert.equal(catalog.plugins[0].state,'disabled');assert.equal(catalog.plugins[0].activeReleaseId,older.id);
  assert.deepEqual(await registry.getChatScope('chat'),before);
  await registry.setPluginState(plugin.id,'active'); // Existing Desktop callers remain valid.
  assert.deepEqual((await registry.getCatalog()).pluginSets.find(set=>set.ownerId==='project').pluginIds,[],'enable does not silently re-add project defaults');
}));
