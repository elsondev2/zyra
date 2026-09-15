import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,appendFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {usageRecord,aggregateUsage} from '../src/usage-records.mjs';
import {UsageIndex} from '../src/usage-index.mjs';
import {readOpenCodeUsage} from '../src/usage-opencode.mjs';
import {projectSessionDetails} from '../src/session-details.mjs';
import {HostRouter,isRead} from '../src/router.mjs';
const stamp=new Date().toISOString();
const assistant=(id='m',input=100)=>({type:'message',id,timestamp:stamp,message:{role:'assistant',model:'gpt-5.5',usage:{input,cacheRead:20,output:10,cost:{total:.02}}}});
test('Pi input excludes cached tokens; duplicates and missing prices do not inflate totals',()=>{
 const state={cwd:'/shared',session:'s'}; const row=usageRecord('zyra',assistant(),state);
 const result=aggregateUsage([row,row]); assert.equal(result.totals.totalTokens,130); assert.equal(result.totals.responses,1); assert.equal(result.totals.reportedCostUsd,.02);
 const unpriced={...row,id:'other',model:'unknown',reportedCostUsd:null}; const unknown=aggregateUsage([unpriced]); assert.equal(unknown.totals.unpricedResponses,1); assert.equal(unknown.totals.estimatedResponses,0);
 const detail=projectSessionDetails({model:'gpt-5.5',turns:[{id:'t',model:'gpt-5.5',usage:{inputTokens:100,cachedInputTokens:20,outputTokens:10,totalTokens:99999,costUsd:.02}}],totals:{contextTokens:2048,modelContextWindow:128000}});
 assert.equal(detail.usage.totalTokens,130); assert.equal(detail.context.usedTokens,2048); assert.equal(detail.usage.reportedCostUsd,.02);
});
test('Codex repeated cumulative usage is excluded; ambiguous forks are omitted',()=>{
 const state={}; const date=Date.now();
 usageRecord('codex',{type:'session_meta',timestamp:new Date(date).toISOString(),payload:{id:'s',cwd:'/shared'}},state);
 usageRecord('codex',{type:'turn_context',payload:{model:'gpt-5.5'}},state);
 const event=(ms,total)=>({type:'event_msg',timestamp:new Date(date+ms).toISOString(),payload:{type:'token_count',info:{last_token_usage:{input_tokens:100,cached_input_tokens:20,cache_write_input_tokens:5,output_tokens:10,reasoning_output_tokens:3},total_token_usage:{total_tokens:total}}}});
 const live=usageRecord('codex',event(30,110),state);
 assert.equal(live.inputTokens,75); assert.equal(aggregateUsage([live]).totals.totalTokens,110);
 assert.equal(usageRecord('codex',event(3001,110),state),null);
 usageRecord('codex',{type:'turn_context',payload:{model:'new-model'}},state); assert.equal(usageRecord('codex',event(7000,220),state).model,'new-model');
 const fork={};usageRecord('codex',{type:'session_meta',timestamp:new Date(date).toISOString(),payload:{id:'fork',cwd:'/shared',forked_from_id:'s'}},fork);
 usageRecord('codex',{type:'turn_context',payload:{model:'gpt-5.5'}},fork);
 assert.equal(usageRecord('codex',event(30,110),fork),null);
 assert.equal(usageRecord('codex',event(300000,220),fork),null);
 assert.equal(fork.forkDetected,true);
});
test('Claude evolving content blocks upsert one response and unknown zero costs remain unpriced',()=>{
 const fixture=output=>({type:'assistant',timestamp:stamp,cwd:'/shared',requestId:'request',message:{id:'same-message',model:'claude-sonnet-4-6',usage:{input_tokens:100,output_tokens:output}}});
 const partial=usageRecord('claude',fixture(2)),final=usageRecord('claude',fixture(40));
 for(const rows of [[partial,final],[final,partial],[partial,final,final]]) {
  const usage=aggregateUsage(rows); assert.equal(usage.totals.responses,1);assert.equal(usage.totals.outputTokens,40);
 }
 const zero={...final,id:'unknown',model:'unknown-model',reportedCostUsd:0};
 assert.equal(aggregateUsage([zero]).totals.unpricedResponses,1);
});
test('incremental native index resumes oversized tool lines, stays warm, resets rewritten files and filters hidden projects',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'zyra-usage-'));
 try {
  const project=path.join(root,'project'),hidden=path.join(project,'hidden'); await mkdir(hidden,{recursive:true});
  const file=path.join(root,'canonical.jsonl');
  const session=JSON.stringify({type:'session',id:'s',cwd:project});
  const long=JSON.stringify({type:'message',message:{role:'toolResult',content:'x'.repeat(1200000)}});
  await writeFile(file,session+'\n'+long+'\n'+JSON.stringify(assistant())+'\n');
  const index=new UsageIndex({directory:path.join(root,'cache'),roots:{}});
  const args={harness:'zyra',projects:[project],zyraChats:[{sessionPath:file,project}],allProjects:false};
  let result; for(let i=0;i<4;i++) result=await index.read(args);
  assert.equal(result.totals.responses,1); assert.equal(result.indexing,false); assert.equal((await index.read(args)).bytesRead,0);
  await appendFile(file,JSON.stringify(assistant('second',200))+'\n'); result=await index.read(args); assert.equal(result.totals.responses,2); assert.ok(result.bytesRead<2000);
  await writeFile(file,session+'\n'+JSON.stringify(assistant('replacement',1))+'\n'); result=await index.read(args); assert.equal(result.totals.responses,1); assert.equal(result.totals.inputTokens,1);
  const restored=new UsageIndex({directory:path.join(root,'cache'),roots:{}}); assert.equal((await restored.read(args)).bytesRead,0);
  const cacheFile=path.join(root,'cache','usage-index-v1.json'),prior=JSON.parse(await readFile(cacheFile,'utf8'));
  assert.equal(prior.version,2);prior.version=1;prior.limited=true;await writeFile(cacheFile,JSON.stringify(prior));
  const rebuilt=new UsageIndex({directory:path.join(root,'cache'),roots:{}});const rebuiltUsage=await rebuilt.read(args);
  assert.ok(rebuiltUsage.bytesRead>0,'previous numeric cache parser version is rebuilt');assert.equal(rebuiltUsage.totals.inputTokens,1);assert.equal(rebuiltUsage.limited,false);
  assert.equal((await readFile(file,'utf8')).includes('replacement'),true,'canonical history is preserved');
  assert.equal((await index.read({...args,hiddenProjects:[project]})).totals.responses,0);
  await writeFile(file,JSON.stringify({type:'session',id:'s',cwd:hidden})+'\n'+JSON.stringify(assistant('hidden'))+'\n');
  assert.equal((await index.read({...args,hiddenProjects:[hidden]})).totals.responses,0);
 } finally {await rm(root,{recursive:true,force:true});}
});
test('numeric cache has a global record and serialization bound',()=>{
 const index=new UsageIndex({roots:{}}),now=Date.now(); const row=usageRecord('zyra',assistant(),{cwd:'/shared',session:'s'});
 index.cache={one:{mtime:now,records:Array(45000).fill(row),offset:1,state:{}}}; index.boundCache(now-86400000);
 assert.ok(index.cache.one.records.length<=40000); assert.ok(Buffer.byteLength(JSON.stringify(index.cache))<16*1024*1024); assert.equal(index.limited,true);
});
test('OpenCode database uses read-only numeric projection and incremental record replacement',async()=>{
 const {DatabaseSync}=await import('node:sqlite'); const root=await mkdtemp(path.join(os.tmpdir(),'opencode-usage-')),file=path.join(root,'opencode.db');
 try {
  const db=new DatabaseSync(file); db.exec('CREATE TABLE session(id TEXT,directory TEXT); CREATE TABLE message(id TEXT,session_id TEXT,time_created INTEGER,time_updated INTEGER,data TEXT);');
  db.prepare('INSERT INTO session VALUES(?,?)').run('s',root);
  const now=Date.now(),data={role:'assistant',modelID:'gpt-5.5',time:{completed:now},tokens:{input:100,output:10,cache:{read:20,write:0}},cost:.1,privateText:'must not leave sqlite'};
  db.prepare('INSERT INTO message VALUES(?,?,?,?,?)').run('m','s',now,now,JSON.stringify(data));
  const first=await readOpenCodeUsage(file,null,now-1000); assert.equal(first.records.length,1); assert.doesNotMatch(JSON.stringify(first),/privateText|must not leave/);
  data.tokens.input=200;db.prepare('UPDATE message SET time_updated=?,data=? WHERE id=?').run(now+10,JSON.stringify(data),'m');
  const next=await readOpenCodeUsage(file,first,now-1000);assert.equal(next.records.length,1);assert.equal(next.records[0].inputTokens,200);db.close();
 } finally {await rm(root,{recursive:true,force:true});}
});
test('usage and details are read-only and hidden chats cannot query desktop details',async()=>{
 assert.equal(isRead('account.usage'),true);assert.equal(isRead('session.details'),true);
 const router=new HostRouter({allProjects:false,projects:['/shared'],client:{request:async()=>({chat:{canonicalChatId:'hidden',project:'/private'}})},review:{details:async()=>assert.fail('must not query hidden chat')}});
 await assert.rejects(router.dispatch('session.details',{session:'hidden'}),/not shared/);
});
test('usage route ignores client scope claims and passes only server-authorized canonical paths',async()=>{
 let captured;const shared=path.resolve('/shared'),hidden=path.resolve('/private');
 const router=new HostRouter({projects:[shared],hiddenProjects:[hidden],allProjects:false,
  client:{request:async(method,input)=>{assert.equal(method,'catalog.list');assert.deepEqual(input.projects,[shared]);return{chats:[{canonicalChatId:'ok',project:shared,sessionPath:'/canonical/ok'},{canonicalChatId:'hidden',project:hidden,sessionPath:'/canonical/private'}]}}},
  usage:{read:async input=>{captured=input;return {totals:{responses:1}}}}
 });
 await router.dispatch('account.usage',{harness:'zyra',projects:[hidden],allProjects:true});
 assert.deepEqual(captured.projects,[shared]);assert.equal(captured.allProjects,false);assert.deepEqual(captured.hiddenProjects,[hidden]);
 assert.equal(captured.zyraChats.length,1);assert.equal(captured.zyraChats[0].canonicalChatId,'ok');
});
