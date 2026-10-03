import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { runHarnessTextTurn } from '../src/opencode-harness.mjs';

let eventResponse,replyResponse,createdMessageID;
let permissionReplies=0,polls=0;const progress=[],permissions=[],headers=[];
const frame=event=>`data: ${JSON.stringify(event)}\n\n`;
const event=(type,properties)=>({type,properties});
let finishProgress;
const firstText=new Promise(resolve=>{finishProgress=resolve;});
let firstTextAt;
const server=createServer(async(req,res)=>{
 headers.push(req.headers['x-opencode-directory']);
 if(req.url==='/event'){
  eventResponse=res;res.writeHead(200,{'content-type':'text/event-stream'});res.write(frame(event('server.connected',{})));return;
 }
 if(req.url==='/session'){res.setHeader('content-type','application/json');res.end(JSON.stringify({id:'ses_owned'}));return;}
 if(req.method==='DELETE'){res.end('true');return;}
 if(req.method==='GET'){polls++;res.end('[]');return;}
 let text='';for await(const chunk of req)text+=chunk;const body=JSON.parse(text);
 if(req.url==='/permission/per_test/reply'){
  permissionReplies++;assert.equal(body.reply,'reject','denial reaches native tool execution');
  res.end('true');
  replyResponse.end(JSON.stringify({info:{},parts:[{type:'text',text:'Hello 🌱'}]}));return;
 }
 createdMessageID=body.messageID;replyResponse=res;res.setHeader('content-type','application/json');
 setTimeout(()=>{
  assert.ok(eventResponse,'subscription starts before streamed output');
  const emit=(type,properties)=>eventResponse.write(frame(event(type,properties)));
  emit('message.updated',{info:{id:'msg_old',sessionID:'ses_owned',role:'assistant',parentID:'old_turn'}});
  emit('message.part.updated',{part:{id:'prt_old',messageID:'msg_old',sessionID:'ses_owned',type:'text',text:'OLD ANSWER'}});
  emit('message.updated',{info:{id:'msg_foreign',sessionID:'ses_foreign',role:'assistant',parentID:createdMessageID}});
  emit('message.part.updated',{part:{id:'prt_foreign',messageID:'msg_foreign',sessionID:'ses_foreign',type:'text',text:'FOREIGN ANSWER'}});
  emit('message.updated',{info:{id:'msg_current',sessionID:'ses_owned',role:'assistant',parentID:createdMessageID}});
  emit('message.part.updated',{part:{id:'prt_text',messageID:'msg_current',sessionID:'ses_owned',type:'text',text:''}});
  emit('message.part.delta',{sessionID:'ses_owned',messageID:'msg_old',partID:'prt_text',field:'text',delta:'OLD ANSWER'});
  const bytes=Buffer.from(frame(event('message.part.delta',{sessionID:'ses_owned',messageID:'msg_current',partID:'prt_text',field:'text',delta:'Hello 🌱'})));
  const split=bytes.indexOf(Buffer.from('🌱'))+2;
  eventResponse.write(bytes.subarray(0,split));eventResponse.write(bytes.subarray(split));
  emit('permission.asked',{id:'per_foreign',sessionID:'ses_foreign',permission:'read',metadata:{callID:'call_foreign'}});
  emit('permission.asked',{id:'per_test',sessionID:'ses_owned',permission:'read',patterns:['README.md'],tool:{messageID:'msg_current',callID:'call_test'}});
  emit('message.part.updated',{part:{id:'prt_tool',messageID:'msg_current',sessionID:'ses_owned',type:'tool',tool:'read',callID:'call_test',state:{status:'running',input:{filePath:'README.md'}}}});
  emit('permission.asked',{id:'per_test',sessionID:'ses_owned',permission:'read',patterns:['README.md'],tool:{messageID:'msg_current',callID:'call_test'}});
 },20);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try{
 const began=performance.now();
 const pending=runHarnessTextTurn({client:{baseUrl:`http://127.0.0.1:${server.address().port}`,password:'test-only',cwd:'/project with spaces'},modelId:'openai/gpt-6.1-sol',context:{messages:[{role:'user',content:'short task'}]},
  onProgress:p=>{progress.push(p);if(p.type==='text'){firstTextAt??=performance.now()-began;finishProgress();}},
  onPermission:async p=>{permissions.push(p);return false;}});
 await Promise.race([firstText,new Promise((_,reject)=>setTimeout(()=>reject(new Error('No pushed text received')),2000))]);
 assert.ok(firstTextAt<500,`first text ${firstTextAt} ms precedes the 750 ms poll`);
 const result=await pending;
 assert.equal(result.text,'Hello 🌱');assert.equal(progress.find(p=>p.type==='text').text,'Hello 🌱');
 assert.equal(progress.some(p=>p.text?.includes('ANSWER')),false,'old turns and other chats cannot enter the stream');
 assert.equal(permissions.length,1);assert.equal(permissionReplies,1,'duplicate events consume one approval');
 assert.equal(polls,0,'pushed text and tool decisions require no snapshot polling for this turn');
 assert.ok(headers.every(header=>header===encodeURIComponent('/project with spaces')),'shared native server preserves the selected project for every route');
 console.log(`Actual HTTP/SSE: first text ${Math.round(firstTextAt)} ms, zero polls, isolated turns/chats, split Unicode and one denied native tool decision passed.`);
}finally{eventResponse?.destroy();replyResponse?.destroy();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
