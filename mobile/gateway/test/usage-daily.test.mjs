import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {aggregateUsage,usagePeriod} from '../src/usage-records.mjs';
import {UsageIndex} from '../src/usage-index.mjs';

const now=Date.parse('2026-09-15T12:00:00Z'), period=usagePeriod(now), start=Date.parse(period.start);
const record=(id,timestamp,overrides={})=>({id,timestamp,cwd:'/private/source',harness:'zyra',model:'gpt-5.5',inputTokens:100,cachedInputTokens:20,cacheWriteTokens:0,outputTokens:10,reasoningTokens:3,reportedCostUsd:null,...overrides});

test('UTC daily chart has exactly30 ordered dates and includes only the explicit period',()=>{
 const result=aggregateUsage([record('before',start-1),record('first',start),record('last',now),record('future',now+1)],period);
 assert.equal(result.daily.length,30);assert.equal(result.daily[0].date,'2026-08-17');assert.equal(result.daily.at(-1).date,'2026-09-15');
 assert.equal(result.period.timeZone,'UTC');assert.equal(result.totals.responses,2);
 assert.equal(result.daily[0].responses,1);assert.equal(result.daily.at(-1).responses,1);
 assert.equal(result.daily[1].responses,0);assert.equal(result.daily[1].totalTokens,0);
 assert.deepEqual([...result.daily.map(day=>day.date)].sort(),result.daily.map(day=>day.date));
 assert.doesNotMatch(JSON.stringify(result.daily),/cwd|private|harness|model|response-id/);
});
test('daily and overall totals share cross-midnight dedupe and reported/estimated/unpriced cost semantics',()=>{
 const partial=record('same',Date.parse('2026-09-14T23:59:59Z'),{outputTokens:1}),final=record('same',Date.parse('2026-09-15T00:00:01Z'),{outputTokens:40});
 const recorded=record('recorded',start,{reportedCostUsd:.125});
 const unknown=record('unknown',start,{model:'unpriced-model',reportedCostUsd:0});
 const records=[partial,final,final,recorded,unknown];
 const result=aggregateUsage(records,period),reversed=aggregateUsage([...records].reverse(),period);
 assert.deepEqual(result.daily,reversed.daily);assert.equal(result.totals.responses,3);assert.equal(result.daily.at(-2).responses,0);assert.equal(result.daily.at(-1).outputTokens,40);
 assert.equal(result.totals.reportedResponses,1);assert.equal(result.totals.estimatedResponses,1);assert.equal(result.totals.unpricedResponses,1);
 assert.equal(result.daily[0].reportedCostUsd,.125);assert.equal(result.daily[0].unpricedResponses,1);
 for(const field of Object.keys(result.totals)) assert.equal(result.daily.reduce((sum,day)=>sum+day[field],0),result.totals[field],field);
 const empty=aggregateUsage([],period);assert.equal(empty.daily.length,30);assert.ok(empty.daily.every(day=>day.totalTokens===0));
});
test('daily series is computed after real project scope filtering, including hidden descendants',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'zyra-daily-'));
 try {
  const project=path.join(root,'shared'),hidden=path.join(project,'hidden');await mkdir(hidden,{recursive:true});
  const session=(id,cwd)=>JSON.stringify({type:'session',id,cwd});
  const response=id=>JSON.stringify({type:'message',id,timestamp:new Date(now-1000).toISOString(),message:{role:'assistant',model:'gpt-5.5',usage:{input:100,cacheRead:20,output:10}}});
  const visibleFile=path.join(root,'visible.jsonl'),hiddenFile=path.join(root,'hidden.jsonl');
  await writeFile(visibleFile,session('visible',project)+'\n'+response('visible')+'\n');
  await writeFile(hiddenFile,session('hidden',hidden)+'\n'+response('hidden')+'\n');
  const index=new UsageIndex({roots:{}});
  const result=await index.read({harness:'zyra',projects:[project],hiddenProjects:[hidden],zyraChats:[{project,sessionPath:visibleFile},{project,sessionPath:hiddenFile}],now});
  assert.equal(result.totals.responses,1);assert.equal(result.daily.at(-1).responses,1);assert.equal(result.daily.at(-1).totalTokens,130);
  assert.equal(result.daily.reduce((sum,day)=>sum+day.totalTokens,0),result.totals.totalTokens);
  assert.doesNotMatch(JSON.stringify(result),/sessionPath|visible\.jsonl|hidden\.jsonl|cwd/);
 }finally{await rm(root,{recursive:true,force:true});}
});
