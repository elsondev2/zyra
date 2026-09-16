import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {projectCatalogMetadata} from '../src/catalog-metadata.mjs';

test('catalog metadata retains unknown/error states and pending without exposing source errors',async()=>{
 const chats=[{canonicalChatId:'a',project:'/shared'}],files={};
 const missing=await projectCatalogMetadata(chats,{metadata:async()=>{throw Error('private path')}},files,[]);
 assert.equal(missing[0].hasWork,null);assert.equal(missing[0].hasChanges,null);assert.equal(missing[0].metadataPending,false);
 const pending=await projectCatalogMetadata(chats,{metadata:async()=>[{canonicalChatId:'a',pending:true,hasWork:true}]},files,[]);
 assert.equal(pending[0].hasWork,true);assert.equal(pending[0].metadataPending,true);
 assert.doesNotMatch(JSON.stringify(missing),/private path/);
});
test('catalog changes respect hidden descendants and hidden move origins',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'zyra-metadata-'));
 try {
  const hidden=path.join(root,'hidden');await mkdir(hidden);await writeFile(path.join(root,'a.txt'),'a');await writeFile(path.join(hidden,'b.txt'),'b');
  const chats=[{canonicalChatId:'a',project:root}],files={roots:async()=>[{id:'root',path:root}]};
  const project=changes=>projectCatalogMetadata(chats,{metadata:async()=>[{canonicalChatId:'a',hasWork:false,index:{turns:[{changes}]}}]},files,[hidden]);
  assert.equal((await project([{filePath:'hidden/b.txt'}]))[0].hasChanges,false);
  assert.equal((await project([{filePath:'a.txt',previousPath:'hidden/b.txt'}]))[0].hasChanges,false);
  assert.equal((await project([{filePath:'a.txt'}]))[0].hasChanges,true);
 } finally {await rm(root,{recursive:true,force:true});}
});
test('scope budget rotates retries and declares unfinished rows pending',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'zyra-metadata-budget-'));
 try {
  await writeFile(path.join(root,'a.txt'),'a');let clock=0;
  const chats=['a','b','c'].map(canonicalChatId=>({canonicalChatId,project:root,modifiedAt:'version'}));
  const review={metadata:async()=>chats.map(chat=>({...chat,index:{turns:[{changes:[{filePath:'a.txt'}]}]}}))};
  const files={roots:async()=>{clock+=200;return[{id:'root',path:root}]}};
  const first=await projectCatalogMetadata(chats,review,files,[],{budgetMs:100,now:()=>clock});
  assert.equal(first[0].hasChanges,true);assert.equal(first[1].metadataPending,true);assert.equal(first[2].metadataPending,true);
  const second=await projectCatalogMetadata(chats,review,files,[],{budgetMs:100,now:()=>clock});
  assert.equal(second[1].hasChanges,true);assert.equal(second[0].metadataPending,true);
  const third=await projectCatalogMetadata(chats,review,files,[],{budgetMs:100,now:()=>clock});
  assert.equal(third[2].hasChanges,true);
 }finally{await rm(root,{recursive:true,force:true});}
});
