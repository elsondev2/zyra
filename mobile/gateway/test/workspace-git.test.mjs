import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import os from 'node:os';
import {WorkspaceFiles} from '../src/workspace-files.mjs';
import {HostRouter} from '../src/router.mjs';
import {BodyCache} from '../src/projection.mjs';
const execute=promisify(execFile);
async function fixture(run) {
  const root=await mkdtemp(path.join(os.tmpdir(),'zyra-workspace-git-'));
  const shared=path.join(root,'shared');const chat={canonicalChatId:'chat',project:shared};
  const git=(...args)=>execute('git',['-c','core.autocrlf=false','-c','commit.gpgSign=false','-c',`core.hooksPath=${path.join(root,'.no-hooks')}`,'-c','user.name=Mobile Fixture','-c','user.email=mobile@example.invalid','-C',root,...args],{windowsHide:true,timeout:10000});
  try {
    await mkdir(shared);await mkdir(path.join(root,'private'));await git('init');
    await writeFile(path.join(shared,'visible.txt'),'original\n');await writeFile(path.join(root,'private','secret.txt'),'private original\n');
    await git('add','--','.');await git('commit','-m','Synthetic baseline');
    await writeFile(path.join(shared,'visible.txt'),'visible change\n');await writeFile(path.join(root,'private','secret.txt'),'PRIVATE CONTENT MUST NOT LEAVE ITS SCOPE\n');
    const files=new WorkspaceFiles({projects:[shared]});await run({files,chat,root,shared,git});
  } finally {assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
}
test('Git status returns only paths inside the shared subtree, relative to that subtree',()=>fixture(async({files,chat})=>{
  const status=await files.dispatch('workspace.git.status',{},chat);
  assert.deepEqual(status.files.map(file=>file.path),['visible.txt']);
}));
test('Git diff cannot include a sibling project outside the shared root',()=>fixture(async({files,chat})=>{
  const result=await files.dispatch('workspace.git.diff',{},chat);
  assert.match(result.diff,/visible change/);assert.doesNotMatch(result.diff,/PRIVATE CONTENT|private\/secret/);
}));
test('deleted tracked files can be reviewed without resolving a nonexistent file',()=>fixture(async({files,chat,shared})=>{
  await rm(path.join(shared,'visible.txt'));
  const result=await files.dispatch('workspace.git.diff',{path:'visible.txt'},chat);
  assert.match(result.diff,/-original/);
}));
test('untracked files use literal paths and produce a real added-file diff',()=>fixture(async({files,chat,shared})=>{
  await writeFile(path.join(shared,'[s].txt'),'literal file\n');await writeFile(path.join(shared,'s.txt'),'WRONG FILE\n');
  const result=await files.dispatch('workspace.git.diff',{path:'[s].txt'},chat);
  assert.match(result.diff,/\+literal file/);assert.doesNotMatch(result.diff,/WRONG FILE/);
  await assert.rejects(files.dispatch('workspace.git.diff',{path:'../private/secret.txt'},chat));
  const magic=await files.dispatch('workspace.git.diff',{path:':(top)private/secret.txt'},chat);assert.doesNotMatch(magic.diff,/PRIVATE CONTENT/);
}));
test('staged moves across a shared-root boundary reveal only the visible side',()=>fixture(async({files,chat,root,git})=>{
  await git('mv','--','shared/visible.txt','private/moved.txt');
  const status=await files.dispatch('workspace.git.status',{},chat);
  assert.deepEqual(status.files.map(file=>file.path),['visible.txt']);assert.equal(status.files[0].index,'D');
  const result=await files.dispatch('workspace.git.diff',{staged:true},chat);
  assert.match(result.diff,/-original/);assert.doesNotMatch(result.diff,/private|moved.txt|PRIVATE CONTENT/);
}));
test('deleted parent folders work while links escaping the shared root remain blocked',()=>fixture(async({files,chat,root,shared,git})=>{
  await mkdir(path.join(shared,'folder'));await writeFile(path.join(shared,'folder','gone.txt'),'tracked child\n');await git('add','--','shared/folder');await git('commit','-m','Synthetic nested file');
  await rm(path.join(shared,'folder'),{recursive:true});
  assert.match((await files.dispatch('workspace.git.diff',{path:'folder/gone.txt'},chat)).diff,/-tracked child/);
  await symlink(path.join(root,'private'),path.join(shared,'outside'),process.platform==='win32'?'junction':'dir');
  await assert.rejects(files.dispatch('workspace.git.diff',{path:'outside/secret.txt'},chat));
}));
test('large diff previews are explicitly bounded instead of pretending to be complete',()=>fixture(async({files,chat,shared})=>{
  await writeFile(path.join(shared,'visible.txt'),'large changed line\n'.repeat(20000));
  const result=await files.dispatch('workspace.git.diff',{path:'visible.txt',preview:true},chat);
  assert.equal(result.truncated,true);assert.ok(Buffer.byteLength(result.diff)<=256*1024+3);
  await assert.rejects(files.dispatch('workspace.git.diff',{path:'visible.txt'},chat),{code:'GIT_DIFF_TOO_LARGE'});
}));
test('status searches and paginates the selected change group on the PC',()=>fixture(async({files,chat,shared,git})=>{
  await git('add','--','shared/visible.txt');
  for(let i=0;i<205;i++) await writeFile(path.join(shared,`new-${String(i).padStart(3,'0')}.txt`),'new\n');
  const first=await files.dispatch('workspace.git.status',{mode:'working'},chat);
  assert.equal(first.files.length,200);assert.equal(first.nextOffset,200);assert.equal(first.workingCount,205);assert.equal(first.stagedCount,1);
  const second=await files.dispatch('workspace.git.status',{mode:'working',offset:first.nextOffset},chat);assert.equal(second.files.length,5);assert.equal(second.nextOffset,null);
  const staged=await files.dispatch('workspace.git.status',{mode:'staged'},chat);assert.deepEqual(staged.files.map(file=>file.path),['visible.txt']);
  const query=await files.dispatch('workspace.git.status',{mode:'working',query:'new-204'},chat);assert.equal(query.matchCount,1);assert.equal(query.files[0].path,'new-204.txt');
  const legacy=await files.dispatch('workspace.git.status',{},chat);assert.equal(legacy.files.length,206);assert.equal(legacy.nextOffset,null);
}));
test('router enforces per-device visibility before reading Git content',()=>fixture(async({chat,shared})=>{
  const router=new HostRouter({owner:'phone',cache:new BodyCache(),allProjects:true,hiddenProjects:[],client:{request:async()=>({chat})}});
  const value=await router.dispatch('workspace.git.status',{session:'chat'});assert.equal(value.files[0].path,'visible.txt');
  router.hiddenProjects.push(shared);
  await assert.rejects(router.dispatch('workspace.git.diff',{session:'chat'}),{code:'CHAT_NOT_VISIBLE'});
}));
test('whole-repository rename review includes both validated paths',()=>fixture(async({root,shared,git})=>{
  await writeFile(path.join(shared,'visible.txt'),'original\n');await git('mv','--','shared/visible.txt','shared/renamed.txt');
  const files=new WorkspaceFiles({projects:[root]}),chat={canonicalChatId:'full',project:root};
  const status=await files.dispatch('workspace.git.status',{mode:'staged'},chat);
  assert.equal(status.files[0].oldPath,'shared/visible.txt');
  const result=await files.dispatch('workspace.git.diff',{path:'shared/renamed.txt',oldPath:status.files[0].oldPath,staged:true},chat);
  assert.match(result.diff,/rename from shared\/visible.txt/);assert.match(result.diff,/rename to shared\/renamed.txt/);assert.doesNotMatch(result.diff,/PRIVATE CONTENT/);
}));
test('a folder without Git reports an explicit no-repository state',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'zyra-no-repository-'));const previous=process.env.GIT_CEILING_DIRECTORIES;
  try {
    process.env.GIT_CEILING_DIRECTORIES=path.dirname(root);
    const files=new WorkspaceFiles({projects:[root]});const result=await files.dispatch('workspace.git.status',{}, {canonicalChatId:'plain',project:root});
    assert.equal(result.repository,false);assert.deepEqual(result.files,[]);
  } finally {if(previous===undefined)delete process.env.GIT_CEILING_DIRECTORIES;else process.env.GIT_CEILING_DIRECTORIES=previous;assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
