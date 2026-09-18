import test from 'node:test';
import assert from 'node:assert/strict';
import {projectPluginDetail,dispatchPluginControl} from '../src/plugin-controls.mjs';

const catalog=()=>({revision:4,plugins:[{id:'plugin',name:'design',state:'active',sourceId:'source',activeReleaseId:'v2',releaseIds:['v2','v1']}],sources:[{id:'source',kind:'local',locator:'/private/source'}],
  releases:['v1','v2'].map(id=>({id,pluginId:'plugin',version:id,contentDigest:id.repeat(32),installedAt:'2026-09-14',packagePath:'/private/release',manifest:{description:'Tools',interface:{displayName:'Design'},contributions:{skills:'/private/skills',mcp:'/private/mcp'},declaredCapabilityCeiling:['filesystem.read']},skills:[{name:'Design',description:'Build',relativePath:'/private/file'}]})),pluginSets:[{ownerId:'hidden-project'}],chatScopes:[{sessionId:'hidden-chat'}]});
test('details project one release at a time and exclude private installation, project and chat data',()=>{
  const value=projectPluginDetail(catalog(),'plugin','v1',false);
  assert.equal(value.release.id,'v1');assert.equal(value.plugin.activeReleaseId,'v2');assert.equal(value.manageMachine,false);
  assert.deepEqual(value.releases.map(row=>row.current),[true,false]);assert.doesNotMatch(JSON.stringify(value),/private|hidden|packagePath|relativePath/);
  assert.throws(()=>projectPluginDetail(catalog(),'plugin','another-plugin-release'));
});
test('restricted access, missing review, stale revisions and mismatched rollback digests never reach Desktop mutation',async()=>{
  const writes=[];const api={catalog:async()=>catalog(),state:async input=>writes.push(input),rollback:async input=>writes.push(input)};
  const state={pluginId:'plugin',state:'disabled',confirmed:true,expectedCatalogRevision:4};
  await assert.rejects(dispatchPluginControl(api,'plugins.state',state,false,()=>{}));
  await assert.rejects(dispatchPluginControl(api,'plugins.state',{...state,confirmed:false},true,()=>{}));
  await assert.rejects(dispatchPluginControl(api,'plugins.state',{...state,expectedCatalogRevision:3},true,()=>{}),{code:'PLUGIN_CATALOG_REVISION_CHANGED'});
  await assert.rejects(dispatchPluginControl(api,'plugins.rollback',{...state,releaseId:'v1',digest:'changed'},true,()=>{}));
  await assert.rejects(dispatchPluginControl(api,'plugins.rollback',{...state,releaseId:'v2',digest:'v2'.repeat(32)},true,()=>{}));
  assert.deepEqual(writes,[]);
  await dispatchPluginControl(api,'plugins.state',state,true,()=>{});
  await dispatchPluginControl(api,'plugins.rollback',{pluginId:'plugin',releaseId:'v1',digest:'v1'.repeat(32),confirmed:true,expectedCatalogRevision:4},true,()=>{});
  assert.deepEqual(writes,[{pluginId:'plugin',state:'disabled',expectedCatalogRevision:4},{pluginId:'plugin',releaseId:'v1',expectedCatalogRevision:4}]);
});
test('connection loss while loading details prevents a later mutation',async()=>{
  let closed=false;const api={catalog:async()=>{closed=true;return catalog();},state:async()=>assert.fail('must not mutate')};
  await assert.rejects(dispatchPluginControl(api,'plugins.state',{pluginId:'plugin',state:'disabled',confirmed:true,expectedCatalogRevision:4},true,()=>{if(closed)throw new Error('closed');}),/closed/);
});
