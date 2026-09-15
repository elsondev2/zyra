import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {queryOpenCodeUsage} from '../src/usage-opencode-process.mjs';

const input={file:'/unused',since:0,cursor:0,cursorId:''};
function childProgram(program, capture) {
 return (executable,args,options)=>{
  assert.equal(options.shell,false);assert.equal(options.windowsHide,true);assert.ok(args.includes('--max-old-space-size=64'));
  const child=spawn(executable,['--max-old-space-size=64','-e',program],options);capture(child);return child;
 };
}
test('SQLite process returns bounded numeric output and reaps a successful child',async()=>{
 let child;
 const result=await queryOpenCodeUsage(input,{launch:childProgram('process.stdin.resume();process.stdin.on("end",()=>process.stdout.write(JSON.stringify({rows:[{inputTokens:2}]})))',value=>child=value)});
 assert.equal(result.rows[0].inputTokens,2);assert.equal(child.exitCode,0);
});
test('SQLite process errors stay unavailable and never expose stderr',async()=>{
 let child;
 const result=await queryOpenCodeUsage(input,{launch:childProgram('process.stderr.write("secret path");process.exit(2)',value=>child=value)});
 assert.deepEqual(result,{unavailable:true});assert.equal(child.exitCode,2);
});
test('SQLite native-work timeout kills and reaps only the owned child without blocking the caller',async()=>{
 let child,tick=false;
 const timer=setTimeout(()=>tick=true,10);
 const result=await queryOpenCodeUsage(input,{timeoutMs:150,launch:childProgram('while(true){}',value=>child=value)});
 clearTimeout(timer);assert.equal(tick,true);assert.deepEqual(result,{unavailable:true});
 assert.ok(child.exitCode!==null || child.signalCode!==null,'promise resolves only after child close');
 assert.equal(child.killed,true);
});
test('SQLite excessive output is killed and discarded',async()=>{
 let child;
 const result=await queryOpenCodeUsage(input,{launch:childProgram('process.stdout.write("x".repeat(3*1024*1024));setInterval(()=>{},1000)',value=>child=value)});
 assert.deepEqual(result,{unavailable:true});assert.equal(child.killed,true);
 assert.ok(child.exitCode!==null || child.signalCode!==null);
});
