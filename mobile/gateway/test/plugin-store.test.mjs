import test from 'node:test';
import assert from 'node:assert/strict';
import { MobilePluginDownloads, projectPluginDownload, projectPluginStore } from '../src/plugin-store.mjs';

const review = () => ({reviewId:'review',expiresAt:new Date(Date.now()+60000).toISOString(),manifest:{description:'Helpful skills',interface:{displayName:'Design'},declaredCapabilityCeiling:['filesystem.read'],privatePath:'/private/manifest'},release:{name:'design',version:'1',contentDigest:'a'.repeat(64),fileCount:3,totalBytes:400,containsExecutableFiles:true,skills:[{name:'Design',description:'Build an interface',relativePath:'/private/skills'}],contributions:[{kind:'skills',support:'supported',relativePath:'/private/skills'}],diagnostics:[{message:'/private/diagnostic'}]}});
const directory = {commit:'abc',entries:[{name:'design',displayName:'Design',hasSkills:true,description:'Interfaces',category:'Design',publisher:'Example',sourceUrl:'https://github.com/example/design'},{name:'connector',displayName:'Connector',hasMcp:true,hasSkills:false,category:'Work'},{name:'blocked',displayName:'Blocked',hasSkills:true,installation:'BLOCKED',sourceUrl:'file:///private/data'}]};

test('Store pages preserve canonical install eligibility and never expose unsafe URLs', () => {
  const first=projectPluginStore(directory,{limit:2});
  assert.equal(first.nextCursor,'abc:2');assert.equal(first.entries[0].installable,true);assert.equal(first.entries[1].installable,false);
  const next=projectPluginStore(directory,{cursor:first.nextCursor});assert.equal(next.entries[0].sourceUrl,'');assert.equal(next.entries[0].installable,false);
  assert.deepEqual(projectPluginStore(directory,{query:'interfaces',category:'Design'}).entries.map(entry=>entry.name),['design']);
  assert.throws(()=>projectPluginStore({...directory,commit:'new'},{cursor:first.nextCursor}),{code:'PLUGIN_STORE_CHANGED'});
});
test('review projection includes concrete capabilities and byte summary without raw paths or diagnostics', () => {
  const result=projectPluginDownload({id:'download',status:'ready',inspection:review()});
  assert.deepEqual(result.review.capabilities,['filesystem.read']);assert.equal(result.review.bytes,400);assert.equal(result.review.executableFiles,true);
  assert.equal(result.review.diagnosticCount,1);assert.doesNotMatch(JSON.stringify(result),/private|relativePath|manifest/);
});
test('installed status comes from the matching catalog source, without exposing installation metadata', () => {
  const value=projectPluginStore(directory,{},true,[{name:'design',sourceId:'openai-catalog:design',version:'1.2',state:'disabled',path:'/private/install'}]);
  assert.equal(value.entries[0].installedVersion,'1.2');assert.equal(value.entries[0].installedState,'disabled');assert.doesNotMatch(JSON.stringify(value),/private|sourceId/);
  assert.equal(projectPluginStore(directory,{},true,[{name:'design',sourceId:'local',version:'3'}]).entries[0].installedVersion,'');
});
test('installation requires unrestricted access and the exact review prepared for this connection', async () => {
  const installs=[];let cancelled=0;
  const session=new MobilePluginDownloads({directory:async()=>directory,start:async()=>({id:'download',status:'downloading'}),status:async()=>({id:'download',status:'ready',inspection:review()}),install:async id=>installs.push(id),cancelAll:async()=>{cancelled++;}});
  assert.equal((await session.dispatch('plugins.store',{},false)).manageMachine,false);
  await assert.rejects(session.dispatch('plugins.download.start',{name:'design'},false));
  await session.dispatch('plugins.download.start',{name:'design'},true);
  await assert.rejects(session.dispatch('plugins.download.status',{id:'someone-else'},true));
  await assert.rejects(session.dispatch('plugins.install',{id:'download',confirmed:true,reviewId:'review',digest:'a'.repeat(64)},true));
  const prepared=await session.dispatch('plugins.download.status',{id:'download'},true);
  await assert.rejects(session.dispatch('plugins.install',{id:'download',confirmed:true,reviewId:'review',digest:'changed'},true));
  assert.deepEqual(await session.dispatch('plugins.install',{id:'download',confirmed:true,reviewId:prepared.review.id,digest:prepared.review.digest},true),{installed:true});
  assert.deepEqual(installs,['review']);session.close();assert.equal(cancelled,1);
});
test('revocation during a delayed start cleans up even if a PC download appears after the first cancellation', async () => {
  let finish, cancels=0;
  const session=new MobilePluginDownloads({start:()=>new Promise(resolve=>{finish=resolve;}),cancelAll:async()=>{cancels++;}});
  const pending=session.dispatch('plugins.download.start',{name:'design'},true);
  session.close();finish({id:'late',status:'downloading'});
  await assert.rejects(pending,{code:'CONNECTION_CLOSED'});assert.equal(cancels,2);assert.equal(session.current,null);
});
test('cancelling an in-flight status read cannot restore its expired review', async () => {
  let finish;
  const session=new MobilePluginDownloads({start:async()=>({id:'download',status:'downloading'}),status:()=>new Promise(resolve=>{finish=resolve;}),cancelAll:async()=>{}});
  await session.dispatch('plugins.download.start',{name:'design'},true);
  const pending=session.dispatch('plugins.download.status',{id:'download'},true);
  await session.dispatch('plugins.download.cancel',{},true);finish({id:'download',status:'ready',inspection:review()});
  await assert.rejects(pending);assert.equal(session.review,null);
});
