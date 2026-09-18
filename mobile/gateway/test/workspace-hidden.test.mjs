import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {WorkspaceFiles} from '../src/workspace-files.mjs';
import {HostRouter} from '../src/router.mjs';
const execute=promisify(execFile);
async function fixture(t) {
 const root=await mkdtemp(path.join(tmpdir(),'zyra-hidden-workspace-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const hidden=path.join(root,'private'); await mkdir(hidden);
 await writeFile(path.join(root,'public.txt'),'public'); await writeFile(path.join(hidden,'secret.txt'),'secret');
 await symlink(hidden,path.join(root,'alias'),'junction');
 const hiddenProjects=[hidden];
 const files=new WorkspaceFiles({projects:[root],hiddenProjects});
 const chat={canonicalChatId:'chat',project:root};
 const [{id:rootId}]=await files.roots(chat);
 const dispatch=(method,params={})=>files.dispatch(method,{rootId,...params},chat);
 return {root,hidden,hiddenProjects,files,chat,rootId,dispatch};
}
test('hidden descendants and aliases cannot be listed, read, edited, linked or transferred',async t=>{
 const f=await fixture(t);
 const listing=await f.dispatch('workspace.files.list',{hidden:true});
 assert.deepEqual(listing.entries.map(e=>e.name),['public.txt']);
 for(const name of ['private/secret.txt','alias/secret.txt']) {
  for(const method of ['workspace.file.read','workspace.file.chunk','workspace.file.write']) await assert.rejects(f.dispatch(method,{path:name,text:'replace',hash:'a'.repeat(64),offset:0,etag:'x'}));
  await assert.rejects(f.dispatch('workspace.link',{destination:name}));
  await assert.rejects(f.dispatch('workspace.image',{destination:name}));
 }
 await assert.rejects(f.dispatch('workspace.files.list',{path:'private'}));
 assert.equal(await readFile(path.join(f.hidden,'secret.txt'),'utf8'),'secret');
 const visible=await f.dispatch('workspace.file.read',{path:'public.txt'});
 await f.dispatch('workspace.file.write',{path:'public.txt',hash:visible.hash,text:'updated'});
 assert.equal((await f.dispatch('workspace.file.read',{path:'public.txt'})).text,'updated');
 const viaAlias=new WorkspaceFiles({projects:[f.root],hiddenProjects:[path.join(f.root,'alias')]});
 const roots=await viaAlias.roots(f.chat);
 await assert.rejects(viaAlias.dispatch('workspace.file.read',{rootId:roots[0].id,path:'private/secret.txt'},f.chat));
 const attached=new WorkspaceFiles({allProjects:true,allowsProject:()=>true,hiddenProjects:f.hiddenProjects,resolveScope:async()=>({roots:[{path:f.root},{path:f.hidden},{path:path.join(f.root,'alias')}]})});
 assert.equal((await attached.roots(f.chat)).length,1);
});
test('router forwards per-device hidden folders into workspace reads',async t=>{
 const f=await fixture(t);
 const router=new HostRouter({owner:'phone',projects:[f.root],hiddenProjects:f.hiddenProjects,cache:{project:(_,v)=>v},client:{request:async()=>({chat:f.chat})}});
 await assert.rejects(router.dispatch('workspace.file.read',{session:'chat',rootId:f.rootId,path:'private/secret.txt'}));
});
test('Git filters hidden names and counts, rejects aggregate/old-path leaks and raw metadata',async t=>{
 const f=await fixture(t);
 const git=(...args)=>execute('git',['-C',f.root,...args],{windowsHide:true});
 await git('init','-q'); await git('config','user.email','test@example.invalid'); await git('config','user.name','Test');
 await git('add','--','public.txt','private/secret.txt'); await git('commit','-qm','initial');
 await writeFile(path.join(f.root,'public.txt'),'visible update'); await writeFile(path.join(f.hidden,'secret.txt'),'hidden update');
 const status=await f.dispatch('workspace.git.status',{mode:'all'});
 assert.equal(status.total,1); assert.deepEqual(status.files.map(v=>v.path),['public.txt']);
 assert.equal(status.workingCount,1);
 const diff=await f.dispatch('workspace.git.diff',{path:'public.txt'});
 assert.match(diff.diff,/visible update/); assert.doesNotMatch(diff.diff,/hidden update|secret.txt/);
 for(const params of [{path:''},{path:'private'},{path:'private/secret.txt'},{path:'public.txt',oldPath:'private/secret.txt'},{path:'.git/index'}]) await assert.rejects(f.dispatch('workspace.git.diff',params));
 await assert.rejects(f.dispatch('workspace.file.read',{path:'.git/index'}));
 assert.ok(!(await f.dispatch('workspace.files.list',{hidden:true})).entries.some(v=>v.name==='.git'));
 // Deleted hidden files and deleted directory selectors remain excluded.
 await git('rm','-f','--','private/secret.txt');
 const staged=await f.dispatch('workspace.git.status',{mode:'staged'});
 assert.equal(staged.files.length,0); assert.equal(staged.stagedCount,0);
 await assert.rejects(f.dispatch('workspace.git.diff',{path:'private',staged:true}));
 // A missing visible folder selector must not silently become an aggregate.
 await mkdir(path.join(f.root,'gone')); await writeFile(path.join(f.root,'gone','a.txt'),'a');
 await git('add','--','gone/a.txt'); await git('commit','-qm','folder'); await git('rm','-rf','--','gone');
 await assert.rejects(f.dispatch('workspace.git.diff',{path:'gone',staged:true}));
 assert.match((await f.dispatch('workspace.git.diff',{path:'gone/a.txt',staged:true})).diff,/-a/);
 // No exclusions preserves the original root-wide Git diff behavior.
 const unrestricted=new WorkspaceFiles({projects:[f.root]});
 assert.ok((await unrestricted.dispatch('workspace.git.diff',{rootId:f.rootId,path:'',staged:true},f.chat)).diff.length>0);
});
