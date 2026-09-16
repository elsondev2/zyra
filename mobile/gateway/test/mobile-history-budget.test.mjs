import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectLoadedHistoryEntries, projectIndexedHistoryEntries, inspectToolResultEntry } from '../../../src/agent-server/history-bodies.mjs';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const entry = { id:'e1', type:'message', message:{role:'toolResult',toolCallId:'t1',toolName:'bash',content:[{type:'text',text:'x'.repeat(600000)}]} };
test('mobile collapsed history defers even newest output; Desktop keeps its existing eager policy',()=>{
  const mobile=projectLoadedHistoryEntries([entry],3,{canonicalChatId:'chat',toolResultBodies:'lazy-mobile-v1',entryLocators:true})[0];
  assert.equal(mobile.message.content,undefined); assert.equal(mobile.historyEntryIndex,3); assert.equal(mobile.historyBodyRef.canonicalChatId,'chat');
  assert.ok(JSON.stringify(mobile).length<2000);
  const desktop=projectLoadedHistoryEntries([entry],3,{canonicalChatId:'chat',toolResultBodies:'lazy-v1'})[0];
  assert.equal(desktop.message.content[0].text.length,600000);
});
test('indexed mobile projection never reads newest output body to open a thread',()=>{
 const dir=mkdtempSync(join(tmpdir(),'zyra-mobile-history-'));
 try {const file=join(dir,'history.jsonl'); const raw=JSON.stringify(entry); writeFileSync(file,raw+'\n');
 const record=inspectToolResultEntry(entry,0,Buffer.byteLength(raw),{canonicalChatId:'chat',rawLine:raw});
 const result=projectIndexedHistoryEntries({file,selected:[{entryIndex:0,offset:[0,Buffer.byteLength(raw)]}],deferredToolResults:[record],toolResultEntryIndexes:[0],options:{toolResultBodies:'lazy-mobile-v1',entryLocators:true}});
 assert.equal(result[0].message.content,undefined); assert.equal(result[0].historyBodyRef.entrySha256,record.entrySha256);
 } finally {rmSync(dir,{recursive:true,force:true});}
});

import { mobileHistoryStart } from '../../../src/agent-server/mobile-history-window.mjs';
test('first mobile window includes the prompt across hundreds of collapsed tool results without reading them',()=>{
 let reads=0;
 const start=mobileHistoryStart({start:261,end:301,bytesAt:()=>100,isDeferredTool:i=>i>0&&i<300,readEntry:i=>{reads++;return {type:'message',message:{role:i===0?'user':'assistant'}}}});
 assert.equal(start,0); assert.equal(reads,2);
});
test('initial prompt lookup has hard entry and byte bounds',()=>{
 let reads=0;
 const budget=mobileHistoryStart({start:560,end:600,bytesAt:()=>600000,isDeferredTool:()=>false,readEntry:()=>{reads++;return {type:'message',message:{role:'assistant'}}}});
 assert.equal(budget,560); assert.equal(reads,1);
 let lowest=600;
 const entries=mobileHistoryStart({start:560,end:600,bytesAt:()=>1,isDeferredTool:()=>false,readEntry:i=>{lowest=i;return {type:'message',message:{role:i===0?'user':'assistant'}}}});
 assert.equal(entries,560); assert.equal(lowest,120);
});
import { CanonicalChatIndex } from '../../../src/agent-server/chat-index.mjs';
import { getProjectSessionsDir } from '../../../src/project-paths.mjs';
import { mkdirSync } from 'node:fs';
test('real indexed cold mobile open includes prompt and keeps subsequent exclusive pagination exact',async()=>{
 const root=mkdtempSync(join(tmpdir(),'zyra-mobile-index-'));
 let index;
 try {
  const project=join(root,'project'); const directory=getProjectSessionsDir(project); mkdirSync(directory,{recursive:true});
  const entries=[{type:'session',id:'mobile-budget-chat',cwd:project}, {type:'message',id:'first',message:{role:'user',content:'Older prompt'}}, {type:'message',id:'older-answer',message:{role:'assistant',content:'Older answer'}}, {type:'message',id:'latest-prompt',message:{role:'user',content:'Make a change'}}];
  for(let i=0;i<300;i++) entries.push({type:'message',id:`tool${i}`,message:{role:'toolResult',toolCallId:`call${i}`,toolName:'read',content:[{type:'text',text:'output '.repeat(300)}]}});
  entries.push({type:'message',id:'last',message:{role:'assistant',content:'Done'}});
  writeFileSync(join(directory,'test.jsonl'),entries.map(JSON.stringify).join('\n')+'\n');
  index=new CanonicalChatIndex({stateDirectory:join(root,'state')}); await index.listProjects([project]);
  const cold=index.history('mobile-budget-chat',{limit:40,toolResultBodies:'lazy-mobile-v1',entryLocators:true});
  assert.equal(cold.entries[0].message.role,'user'); assert.equal(cold.entries[0].id,'first');
  assert.equal(cold.entries.at(-1).id,'last'); assert.equal(cold.entries.length,304);
  assert.ok(cold.entries.filter(e=>e.message.role==='toolResult').every(e=>e.historyBodyRef&&!e.message.content));
  const older=index.history('mobile-budget-chat',{before:cold.entries.find(entry=>entry.id==='latest-prompt').historyEntryIndex,limit:1,toolResultBodies:'lazy-mobile-v1',entryLocators:true});
  assert.equal(older.entries.length,1); assert.equal(older.entries[0].id,'older-answer');
 } finally {await index?.closeModelBackfill();rmSync(root,{recursive:true,force:true});}
});


test('initial mobile history includes three recent prompts inside the existing hard window', () => {
 let reads = 0;
 const start = mobileHistoryStart({start:960,end:1000,bytesAt:()=>100,isDeferredTool:i=>i!==999&&!new Set([700,680,660]).has(i),
  readEntry:i=>{reads++;return {type:'message',message:{role:i===999?'assistant':'user'}}}});
 assert.equal(start,660);
 assert.equal(reads,4);
});
