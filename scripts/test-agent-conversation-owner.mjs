import assert from 'node:assert/strict';
import { ZyraAgentServer } from '../src/agent-server/server.mjs';

// Real attachSession branch, empty post-restart owner map; only provider connect is simulated.
const calls = [];
const child = {canonicalChatId:'child-session', agentCreatedBy:'parent-session', agentConversationKind:'thread', project:'/fixture'};
const parent = {canonicalChatId:'parent-session', project:'/fixture'};
const owner = {connectedResult:{project:'/fixture',cwd:'/fixture'}, detach(client){calls.push(['detach-owner',client.clientId]);}};
const agent = {providerSessionId:'child-session',cwd:'/fixture/child'};
const view = {sessionKey:'child-session',async connect(input){calls.push(['connect-child',input]);return {threadId:'child-session'};},attach(client){calls.push(['attach-child',client.clientId]);}};
const client = {surface:'desktop',clientId:'client-1'};
const server = {
  sessions:new Map(),
  catalog:{registerProject:p=>p,resolveAlias:id=>id,async find(id){return id==='child-session'?child:id==='parent-session'?parent:null;},recordAttachment(input){calls.push(['record',input]);}},
  findAgentOwner(){return this.sessions.has('parent-session')?{owner,agent}:null;},
  ensureAgentView(linkedOwner,linkedAgent){assert.equal(linkedOwner,owner);assert.equal(linkedAgent,agent);return view;},
  attachmentSnapshot(snapshot){assert.equal(snapshot,view);return {canonicalChatId:view.sessionKey};},
  async attachSession(incoming,params){
    if(params.session==='parent-session'){
      assert.equal(incoming,client);assert.equal(params.localThreadId,undefined);
      calls.push(['restore-owner',params.session]);this.sessions.set('parent-session',owner);return {canonicalChatId:'parent-session'};
    }
    return ZyraAgentServer.prototype.attachSession.call(this,incoming,params);
  }
};
const result=await server.attachSession(client,{project:'/fixture',session:'child-session',localThreadId:'local-child',permissionMode:'read-only'});
assert.equal(result.canonicalChatId,'child-session');
assert.deepEqual(calls.map(call=>call[0]),['restore-owner','detach-owner','connect-child','attach-child','record']);
const input=calls.find(call=>call[0]==='connect-child')[1];
assert.equal(input.permissionMode,'read-only');assert.equal(input.noSession,true);assert.equal(input.memoryEnabled,false);
assert.equal(view.connectedResult.project,owner.connectedResult.project);
assert.equal(view.connectedResult.cwd,agent.cwd);
assert.equal(calls.at(-1)[1].localThreadId,'local-child');
server.sessions.clear();child.agentConversationKind='subagent';calls.length=0;
await assert.rejects(server.attachSession(client,{project:'/fixture',session:'child-session'}),/Open the owning chat/);
assert.deepEqual(calls,[],'Supporting workers are not silently promoted/restored as independent conversations');
child.agentConversationKind='thread';parent.deleted=true;
await assert.rejects(server.attachSession(client,{project:'/fixture',session:'child-session'}),/Open the owning chat/);
assert.deepEqual(calls,[],'Deleted owner cannot be restored');
console.log('Actual independent conversation attach: post-restart owner restore, client detach, original read-only scope, child routing, worker/deleted-owner rejection: passed');
