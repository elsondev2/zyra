import assert from 'node:assert/strict';
import {runHarnessTextTurn} from '../src/opencode-harness.mjs';
const client={baseUrl:'http://127.0.0.1:9',password:'fixture',cwd:'/fixture'};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const keepAlive=setInterval(()=>{},1000);
try {
for(const disconnect of [false,true]){
 let messageID,polls=0,controller,postFinished;
 const progress=[];
 const final=new Promise(resolve=>{postFinished=resolve;});
 const fetchImpl=async(url,init)=>{
  const route=new URL(url).pathname;
  if(route==='/session')return Response.json({id:'ses_test'});
  if(init.method==='DELETE')return Response.json(true);
  if(route==='/event'){
   if(!disconnect)return new Response('unsupported',{status:404});
   return new Response(new ReadableStream({start(c){controller=c;c.enqueue(new TextEncoder().encode('data: {"type":"server.connected"}\n\n'));setTimeout(()=>c.close(),20);}}),{headers:{'content-type':'text/event-stream'}});
  }
  if(init.method==='POST'){messageID=JSON.parse(init.body).messageID;return final;}
  polls++;
  setTimeout(()=>postFinished(Response.json({info:{},parts:[{type:'text',text:'Recovered'}]})),10);
  return Response.json([{info:{role:'assistant',parentID:'retired'},parts:[{type:'text',text:'STALE'}]},{info:{role:'assistant',parentID:messageID},parts:[{type:'text',text:'Recovered'}]}]);
 };
 const reply=await runHarnessTextTurn({client,modelId:'openai/gpt-6.1-sol',context:{messages:[{role:'user',content:'fixture'}]},fetchImpl,onProgress:x=>progress.push(x)});
 assert.equal(reply.text,'Recovered');assert.equal(polls,1);assert.equal(progress.find(x=>x.type==='text').text,'Recovered');
}
let nativeMessageID,streamController,finishPost,approve,asked;
const askedGate=new Promise(resolve=>{asked=resolve;});
const approvalGate=new Promise(resolve=>{approve=resolve;});
const finalPost=new Promise(resolve=>{finishPost=resolve;});
const replies=[],progress=[];const abort=new AbortController();
const emit=(type,properties)=>streamController.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({type,properties})}\n\n`));
const fetchImpl=async(url,init)=>{
 const route=new URL(url).pathname;
 if(route==='/session')return Response.json({id:'ses_cancel'});
 if(init.method==='DELETE'||route.endsWith('/abort'))return Response.json(true);
 if(route==='/event')return new Response(new ReadableStream({start(c){streamController=c;init.signal.addEventListener('abort',()=>{try{c.close();}catch{}},{once:true});}}),{headers:{'content-type':'text/event-stream'}});
 if(route.startsWith('/permission/')){replies.push(JSON.parse(init.body).reply);return Response.json(true);}
 if(init.method==='POST'){
  nativeMessageID=JSON.parse(init.body).messageID;
  init.signal.addEventListener('abort',()=>finishPost(Response.json({info:{},parts:[{type:'text',text:'cancelled'}]})),{once:true});
  setTimeout(()=>{emit('message.updated',{info:{sessionID:'ses_cancel',id:'msg_tool',parentID:nativeMessageID,role:'assistant'}});emit('message.part.updated',{part:{sessionID:'ses_cancel',messageID:'msg_tool',id:'part_tool',type:'tool',tool:'read',callID:'call',state:{input:{filePath:'fixture'}}}});emit('permission.asked',{sessionID:'ses_cancel',id:'per_cancel',permission:'read',tool:{messageID:'msg_tool',callID:'call'}});},10);
  return finalPost;
 }
 return Response.json([]);
};
const turn=runHarnessTextTurn({client,modelId:'openai/gpt-6.1-sol',context:{messages:[{role:'user',content:'fixture'}]},fetchImpl,signal:abort.signal,onProgress:x=>progress.push(x),onPermission:async()=>{asked();await approvalGate;return true;}});
await askedGate;abort.abort();await turn;const count=progress.length;approve();await delay(25);
assert.deepEqual(replies,['reject'],'late approval after Stop cannot authorize the native tool');assert.equal(progress.length,count,'retired turns stop publishing');
console.log('Harness recovery: unsupported/disconnected streams recover current-turn snapshots; Stop rejects late tool approval.');
} finally { clearInterval(keepAlive); }
