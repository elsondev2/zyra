import {test} from 'node:test';
import assert from 'node:assert/strict';
import {projectAccountLimits,readAccountLimits} from '../src/account-limits.mjs';
import {HostRouter,isRead} from '../src/router.mjs';
test('limits project real provider windows without account identity, credits or secrets',()=>{
 const result=projectAccountLimits({account:{email:'secret@example.com'},accountId:'private',resetCredits:[{id:'secret'}],tokenExpiresAt:'secret',rateLimitsByLimitId:{codex:{limitName:'Codex',credits:{balance:'secret'},primary:{usedPercent:23.5,windowDurationMins:300,resetsAt:1800000000},secondary:{usedPercent:104,windowDurationMins:10080,resetsAt:null}}},fetchedAt:'2026-09-15T00:00:00Z'});
 assert.equal(result.groups[0].windows[0].remainingPercent,76.5); assert.equal(result.groups[0].windows[1].remainingPercent,0);
 assert.equal(result.groups[0].windows[1].resetsAt,null); assert.doesNotMatch(JSON.stringify(result),/secret|private|balance|accountId/);
});
test('missing metrics stay unavailable while legacy snapshot remains supported',()=>{
 assert.deepEqual(projectAccountLimits({rateLimits:{primary:{usedPercent:null}}}),{available:false,groups:[],fetchedAt:null});
 const result=projectAccountLimits({rateLimitsByLimitId:{broken:{}},rateLimits:{primary:{usedPercent:0}}});
 assert.equal(result.available,true); assert.equal(result.groups[0].windows[0].remainingPercent,100); assert.equal(result.groups[0].windows[0].durationMinutes,null);
});
test('desktop millisecond resets become wire seconds and normalized provider fallback is usable',()=>{
 const desktop=projectAccountLimits({rateLimitsByLimitId:{weekly:{limitName:'Codex',primary:{usedPercent:27,windowDurationMins:10080,resetsAt:1800000000000}}}});
 assert.equal(desktop.groups[0].windows[0].resetsAt,1800000000);
 const direct=projectAccountLimits({usage:{limitWindows:[{id:'weekly',scope:'Codex',usedPercent:27,windowSeconds:604800,resetAt:1800000000000}]}});
 assert.equal(direct.available,true); assert.equal(direct.groups[0].windows[0].remainingPercent,73);
 assert.equal(direct.groups[0].windows[0].durationMinutes,10080);
});
test('machine limits are read-only, require supported adapter and sanitize source failure',async()=>{
 assert.equal(isRead('account.limits'),true);
 const router=new HostRouter({accountLimits:async()=>({rateLimits:{primary:{usedPercent:20}}})});
 assert.equal((await router.dispatch('account.limits')).groups[0].windows[0].remainingPercent,80);
 await assert.rejects(readAccountLimits(undefined),/Update Zyra Desktop/);
 await assert.rejects(readAccountLimits(async()=>{throw new Error('secret token');}),error=>!error.message.includes('secret')&&error.message.includes('unavailable'));
});
