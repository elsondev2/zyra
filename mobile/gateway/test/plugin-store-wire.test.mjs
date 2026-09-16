import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import { WebSocket } from 'ws';
import { createGateway, hostTls } from '../src/desktop-entry.mjs';
import { MobilePluginSession } from '../src/plugin-session.mjs';

test('paired TLS client manages reviewed Plugins and loses mutation access when its project scope changes', {timeout:20000}, async () => {
  const directory=mkdtempSync(path.join(os.tmpdir(),'zyra-plugin-store-wire-'));
  let gateway, socket;
  try {
    const tls=await hostTls(directory);let starts=0,installs=0,cancels=0;
    const controls=[],listeners=new Set();
    const catalog={revision:1,plugins:[{id:'plugin',name:'design',state:'active',activeReleaseId:'v2',releaseIds:['v2','v1']}],
      releases:['v1','v2'].map(id=>({id,pluginId:'plugin',version:id,contentDigest:id.repeat(32),manifest:{description:'Synthetic tools'},skills:[]})),pluginSets:[],chatScopes:[],sources:[]};
    class Client extends EventEmitter {
      async connect() {}
      async request(method) {
        if(method==='catalog.projects')return {projects:['/project']};
        if(method==='catalog.get')return {chat:{canonicalChatId:'chat',project:'/project'}};
        if(method==='session.join')return {sessionKey:'chat',canonicalChatId:'chat',connected:{},replay:[],latestSequence:0,pendingAttention:[]};
        return {};
      }
      close() {}
    }
    gateway=createGateway({tls,directory,projects:['/project'],allProjects:true,clientFactory:()=>new Client(),pluginFactory:(_device,changed)=>new MobilePluginSession({
      context:async()=>({sessionId:'local',projectId:'project'}),catalog:async()=>catalog,
      subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener);},
      state:async input=>{assert.equal(input.expectedCatalogRevision,catalog.revision);controls.push(input);catalog.plugins[0].state=input.state;catalog.revision++;},
      rollback:async input=>{assert.equal(input.expectedCatalogRevision,catalog.revision);controls.push(input);catalog.plugins[0].activeReleaseId=input.releaseId;catalog.revision++;},
      downloads:{directory:async()=>({commit:'pinned',entries:[{name:'design',displayName:'Design',hasSkills:true}]}),
        start:async name=>{assert.equal(name,'design');starts++;return {id:'owned',status:'downloading'};},
        status:async id=>{assert.equal(id,'owned');return {id,status:'ready',inspection:{reviewId:'review',expiresAt:new Date(Date.now()+60000).toISOString(),manifest:{description:'A synthetic package'},release:{contentDigest:'a'.repeat(64),skills:[],contributions:[],diagnostics:[]}}};},
        install:async id=>{assert.equal(id,'review');installs++;},cancelAll:async()=>{cancels++;}}
    },changed)});
    const address=await gateway.listen(),origin=`https://127.0.0.1:${address.port}`;
    const pinned={ca:tls.cert,checkServerIdentity:(_host,cert)=>cert.fingerprint256.replaceAll(':','').toLowerCase()===tls.fingerprint?undefined:new Error('Wrong PC identity')};
    const body=JSON.stringify({name:'Synthetic Store phone',secret:gateway.devices.createPairing().secret});
    const paired=await new Promise((resolve,reject)=>{const req=https.request(origin+'/pair',{...pinned,method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},res=>{const chunks=[];res.on('data',part=>chunks.push(part));res.on('end',()=>resolve(JSON.parse(Buffer.concat(chunks))));});req.on('error',reject);req.end(body);});
    socket=new WebSocket(origin.replace('https:','wss:')+'/connect',pinned);await once(socket,'open');
    const messages=[];socket.on('message',bytes=>messages.push(JSON.parse(bytes.toString())));
    const wait=async match=>{const until=Date.now()+3000;while(Date.now()<until){const value=messages.find(match);if(value)return value;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Missing Store response');};
    socket.send(JSON.stringify({type:'hello',version:1,deviceId:paired.deviceId,token:paired.token}));await wait(value=>value.type==='hello.ok');
    const rpc=async(method,params={})=>{const id=Date.now()+':'+randomUUID();socket.send(JSON.stringify({type:'request',id,method,params:{session:'chat',...params}}));return wait(value=>value.id===id);};
    assert.equal((await rpc('session.attach')).ok,true);
    assert.equal(listeners.size,0);
    const details=await rpc('plugins.detail',{pluginId:'plugin'});assert.equal(details.ok,true);assert.equal(details.result.release.id,'v2');
    assert.equal(listeners.size,1);for(const listener of listeners){listener();listener();}
    const notification=await wait(value=>value.type==='plugins.changed');assert.deepEqual(notification,{type:'plugins.changed'});
    assert.equal((await rpc('plugins.state',{pluginId:'plugin',state:'disabled',expectedCatalogRevision:1})).ok,false);
    const disabled=await rpc('plugins.state',{pluginId:'plugin',state:'disabled',expectedCatalogRevision:1,confirmed:true});
    assert.equal(disabled.ok,true,JSON.stringify(disabled.error));assert.equal(disabled.result.plugin.state,'disabled');assert.equal(disabled.result.revision,2);
    assert.equal((await rpc('plugins.rollback',{pluginId:'plugin',releaseId:'v1',digest:'v1'.repeat(32),expectedCatalogRevision:1,confirmed:true})).ok,false);
    const restored=await rpc('plugins.rollback',{pluginId:'plugin',releaseId:'v1',digest:'v1'.repeat(32),expectedCatalogRevision:2,confirmed:true});
    assert.equal(restored.ok,true,JSON.stringify(restored.error));assert.equal(restored.result.plugin.activeReleaseId,'v1');assert.equal(restored.result.plugin.state,'disabled');
    assert.equal(controls.length,2);
    const store=await rpc('plugins.store');assert.equal(store.result.manageMachine,true);assert.equal(store.result.entries[0].name,'design');
    const started=await rpc('plugins.download.start',{name:'design'});assert.equal(started.ok,true,JSON.stringify(started.error));assert.equal(started.result.id,'owned');
    assert.equal((await rpc('plugins.download.status',{id:'another-phone'})).ok,false);
    const prepared=(await rpc('plugins.download.status',{id:'owned'})).result.review;
    assert.equal(installs,0);
    assert.equal((await rpc('plugins.install',{id:'owned',reviewId:prepared.id,digest:'changed',confirmed:true})).ok,false);
    assert.equal((await rpc('plugins.install',{id:'owned',reviewId:prepared.id,digest:prepared.digest,confirmed:true})).result.installed,true);
    assert.equal(starts,1);assert.equal(installs,1);
    await rpc('plugins.download.start',{name:'design'});await rpc('plugins.download.cancel');assert.ok(cancels>=1);
    const scopeClosed=once(socket,'close');gateway.setAccess(paired.deviceId,{hiddenProjects:['/private']});await scopeClosed;
    assert.equal(listeners.size,0);
    socket=new WebSocket(origin.replace('https:','wss:')+'/connect',pinned);await once(socket,'open');messages.length=0;
    socket.on('message',bytes=>messages.push(JSON.parse(bytes.toString())));
    socket.send(JSON.stringify({type:'hello',version:1,deviceId:paired.deviceId,token:paired.token}));await wait(value=>value.type==='hello.ok');
    assert.equal((await rpc('session.attach')).ok,true);
    const limited=await rpc('plugins.detail',{pluginId:'plugin',releaseId:'v2'});assert.equal(limited.ok,true);assert.equal(limited.result.manageMachine,false);
    assert.equal((await rpc('plugins.state',{pluginId:'plugin',state:'active',expectedCatalogRevision:3,confirmed:true})).ok,false);
    assert.equal((await rpc('plugins.rollback',{pluginId:'plugin',releaseId:'v2',digest:'v2'.repeat(32),expectedCatalogRevision:3,confirmed:true})).ok,false);
    assert.equal((await rpc('plugins.download.start',{name:'design'})).ok,false);assert.equal(controls.length,2);
    const before=cancels;const closed=once(socket,'close');gateway.revoke(paired.deviceId);await closed;assert.ok(cancels>before);
    assert.equal(listeners.size,0);
  } finally {
    socket?.terminate();await gateway?.close();
    assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));
    rmSync(directory,{recursive:true,force:true});
  }
});
