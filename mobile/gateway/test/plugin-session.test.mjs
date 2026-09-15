import test from 'node:test';
import assert from 'node:assert/strict';
import {MobilePluginSession} from '../src/plugin-session.mjs';
import {HostRouter,isRead} from '../src/router.mjs';
import {BodyCache} from '../src/projection.mjs';
const catalog=()=>({revision:1,sources:[],plugins:[],releases:[],pluginSets:[],chatScopes:[]});
const chat={canonicalChatId:'canonical',project:'/visible'};
const setup=(context={sessionId:'desktop-chat',projectId:'desktop-project'})=>{
  const calls=[];const api={context:async id=>{assert.equal(id,'canonical');return context},catalog:async()=>catalog(),defaults:async value=>calls.push(value),refresh:async value=>calls.push(value)};
  return {calls,api,session:new MobilePluginSession(api)};
};
test('project selection is resolved by Desktop and cannot be redirected with caller fields',async()=>{
  const {session,calls}=setup();
  await session.dispatch('plugins.defaults',{projectId:'hidden-project',pluginIds:['plugin'],expectedRevision:3},chat,false);
  assert.deepEqual(calls,[{projectId:'desktop-project',pluginIds:['plugin'],expectedRevision:3}]);
  await session.dispatch('plugins.refresh',{sessionId:'hidden-chat',confirmed:true,expectedCatalogRevision:8},chat,false);
  assert.deepEqual(calls[1],{sessionId:'desktop-chat',expectedCatalogRevision:8});
});
test('global defaults need full access and review revisions cannot be omitted',async()=>{
  const {session,calls}=setup({sessionId:'desktop-chat',projectId:null});
  await assert.rejects(session.dispatch('plugins.defaults',{pluginIds:[],expectedRevision:1},chat,false));
  await assert.rejects(session.dispatch('plugins.refresh',{confirmed:true},chat,true));
  await session.dispatch('plugins.defaults',{pluginIds:[],expectedRevision:1},chat,true);
  assert.equal(calls.length,1);
});
test('revocation while resolving context cannot continue into a mutation',async()=>{
  const {session,api,calls}=setup();let resolve;
  api.context=()=>new Promise(done=>{resolve=done});
  const pending=session.dispatch('plugins.defaults',{pluginIds:[],expectedRevision:1},chat,true);
  session.close();resolve({sessionId:'desktop-chat',projectId:null});
  await assert.rejects(pending,{code:'CONNECTION_CLOSED'});assert.deepEqual(calls,[]);
});
test('gateway rechecks attachment and project visibility for every Plugin call',async()=>{
  const {session}=setup();
  const router=new HostRouter({owner:'phone',client:{request:async()=>({chat})},cache:new BodyCache(),plugins:session,allProjects:true,hiddenProjects:['/hidden']});
  await assert.rejects(router.dispatch('plugins.list',{session:'canonical'}));
  router.attached.add('canonical');const value=await router.dispatch('plugins.list',{session:'canonical'});assert.equal(value.manageMachine,false);
  router.hiddenProjects.push('/visible');await assert.rejects(router.dispatch('plugins.list',{session:'canonical'}),{code:'CHAT_NOT_VISIBLE'});
  assert.equal(isRead('plugins.list'),true);assert.equal(isRead('plugins.defaults'),false);assert.equal(isRead('plugins.refresh'),false);
});

test('machine Plugins work before any chat is attached and cannot impersonate a project', async () => {
  const {session, api, calls} = setup();
  api.context = async () => { throw new Error('Machine browsing must not resolve a chat'); };
  const router = new HostRouter({owner:'phone',client:{request:async()=>{throw new Error('No chat needed')}},cache:new BodyCache(),plugins:session,allProjects:true});
  const view = await router.dispatch('plugins.list',{scope:'machine',projectId:'hidden'});
  assert.equal(view.hasChat,false); assert.equal(view.manageMachine,true); assert.equal(view.defaults.kind,'global');
  await router.dispatch('plugins.defaults',{scope:'machine',projectId:'hidden',pluginIds:['plugin'],expectedRevision:1});
  assert.deepEqual(calls,[{projectId:null,pluginIds:['plugin'],expectedRevision:1}]);
  await assert.rejects(router.dispatch('plugins.refresh',{scope:'machine',confirmed:true,expectedCatalogRevision:1}));
  await assert.rejects(router.dispatch('plugins.list',{scope:'machine',session:'forged'}));
});

test('machine scope keeps restricted device authority and rejects old adapters', async () => {
  const {session, api, calls} = setup();
  api.context = async () => { throw new Error('No hidden chat context'); };
  api.catalog = async () => ({...catalog(),pluginSets:[{ownerKind:'global',ownerId:'global',revision:1,pluginIds:['private-default']}],chatScopes:[{sessionId:'hidden',plugins:[{name:'private-chat'}]}]});
  const router = new HostRouter({owner:'phone',client:{request:async()=>({chat})},cache:new BodyCache(),plugins:session,allProjects:true,hiddenProjects:['/hidden']});
  const view = await router.dispatch('plugins.list',{scope:'machine'});
  assert.equal(view.manageMachine,false); assert.equal(view.manageDefaults,false); assert.equal(view.hasChat,false);
  assert.doesNotMatch(JSON.stringify(view),/private-default|private-chat/);
  await assert.rejects(router.dispatch('plugins.defaults',{scope:'machine',pluginIds:[],expectedRevision:1}));
  assert.deepEqual(calls,[]);
  router.plugins={dispatch:async()=>{throw new Error('Must not call legacy adapter')}};
  await assert.rejects(router.dispatch('plugins.list',{scope:'machine'}),/Update Zyra Desktop/);
});
