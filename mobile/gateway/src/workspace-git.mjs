import {realpath,stat} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {assert,fault} from './errors.mjs';

const execute=promisify(execFile), LIMIT=256*1024;
const within=(root,target)=>{const relative=path.relative(root,target);return relative==='' || (!relative.startsWith('..'+path.sep) && relative!=='..' && !path.isAbsolute(relative));};
const slash=value=>value.replaceAll('\\','/');

async function git(root,args,{diff=false,optional=false,literal=true}={}) {
  const env={...process.env,GIT_LITERAL_PATHSPECS:literal?'1':'0'};
  for(const key of ['GIT_DIR','GIT_WORK_TREE','GIT_COMMON_DIR','GIT_INDEX_FILE','GIT_OBJECT_DIRECTORY','GIT_ALTERNATE_OBJECT_DIRECTORIES']) delete env[key];
  try {
    const result=await execute('git',['--no-optional-locks',...(literal?['--literal-pathspecs']:[]),'-c','core.quotepath=false','-c','color.ui=false','-c','core.fsmonitor=false','-C',root,...args],
      {windowsHide:true,timeout:10000,maxBuffer:LIMIT,encoding:'utf8',env});
    return {text:result.stdout,truncated:false};
  } catch(error) {
    // --no-index returns 1 when its two files differ.
    if(diff && error.code===1) return {text:error.stdout||'',truncated:false};
    if(diff && error.code==='ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return {text:Buffer.from(error.stdout||'').subarray(0,LIMIT).toString('utf8'),truncated:true};
    if(optional && error.code===1) return null;
    if(optional && /not a git repository/i.test(error.stderr||'')) return null;
    throw fault('GIT_READ_FAILED',error.code==='ERR_CHILD_PROCESS_STDIO_MAXBUFFER'
      ? 'There are too many changes to list at once. Choose a smaller shared folder.'
      : 'Could not read this repository. Refresh and try again.');
  }
}

async function scopedPath(root,value) {
  assert(value===undefined || typeof value==='string','Choose a file inside this folder.');
  const name=value||'';
  assert(name.length<=4096 && !name.includes('\0') && !path.isAbsolute(name) && !/^[a-z]:/i.test(name),'Choose a file inside this folder.');
  const target=path.resolve(root,name);assert(within(root,target),'This path is outside the shared folder.');
  // A deleted file (or parent folder) still has a reviewable Git entry. Resolve
  // the nearest existing ancestor to reject escaping links without requiring it.
  let ancestor=target;
  while(true) {
    try {assert(within(root,await realpath(ancestor)),'This link points outside the shared folder.');break;}
    catch(error) {
      if(error.code!=='ENOENT' && error.code!=='ENOTDIR') throw error;
      const parent=path.dirname(ancestor);assert(parent!==ancestor && within(root,parent),'Choose a file inside this folder.');ancestor=parent;
    }
  }
  return {target,relative:slash(path.relative(root,target))};
}

export async function readWorkspaceGit(method,root,params,policy={allows:async()=>true,restricted:()=>false}) {
  const selected=await scopedPath(root.path,params.path);
  assert(await policy.allows(selected.target,true),'This path is not shared with this device.');
  const top=await git(root.path,['rev-parse','--show-toplevel'],{optional:true});
  if(!top) return {repository:false,files:[],diff:'',branch:'',total:0};
  const repository=await realpath(top.text.trim());
  assert(within(repository,root.path),'This folder is outside the repository.');
  const nested=path.relative(repository,root.path)!=='';
  const restricted=policy.restricted(root.path);
  if(method==='workspace.git.status') {
    assert(params.mode===undefined || ['all','working','staged'].includes(params.mode),'Choose working or staged changes.');
    assert(params.query===undefined || (typeof params.query==='string' && params.query.length<=160),'Use a shorter file search.');
    const status=await git(root.path,['status','--porcelain=v1','-z','--untracked-files=all',...((nested||restricted)?['--no-renames']:[]),'--','.']);
    const parts=status.text.split('\0'),files=[];
    for(let i=0;i<parts.length;i++) {
      const item=parts[i];if(!item) continue;
      const state=item.slice(0,2),name=item.slice(3),old=/[RC]/.test(state)?parts[++i]:null;
      const absolute=path.resolve(repository,name);
      if(!within(root.path,absolute)) continue;
      const oldAbsolute=old?path.resolve(repository,old):null;
      if(!await policy.allows(absolute,true) || oldAbsolute && !await policy.allows(oldAbsolute,true)) continue;
      files.push({path:slash(path.relative(root.path,absolute)),index:state[0],worktree:state[1],
        ...(oldAbsolute && within(root.path,oldAbsolute)?{oldPath:slash(path.relative(root.path,oldAbsolute))}:{})});
    }
    const branch=await git(root.path,['symbolic-ref','--quiet','--short','HEAD'],{optional:true});
    const working=file=>file.worktree.trim()!=='' || file.index==='?',staged=file=>file.index.trim()!=='' && file.index!=='?';
    const query=(params.query||'').toLowerCase();
    const matches=files.filter(file=>(params.mode==='working'?working(file):params.mode==='staged'?staged(file):true)
      && (!query || file.path.toLowerCase().includes(query) || file.oldPath?.toLowerCase().includes(query)));
    const offset=Math.max(0,Math.min(matches.length,Number.isSafeInteger(params.offset)?params.offset:0));
    const paged=params.offset!==undefined || params.mode!==undefined || params.query!==undefined;
    return {repository:true,branch:branch?.text.trim()||'Detached HEAD',files:paged?matches.slice(offset,offset+200):matches,total:files.length,
      workingCount:files.filter(working).length,stagedCount:files.filter(staged).length,matchCount:matches.length,
      nextOffset:paged && offset+200<matches.length?offset+200:null};
  }
  const old=params.oldPath?await scopedPath(root.path,params.oldPath):null;
  assert(!old || await policy.allows(old.target,true),'This path is not shared with this device.');
  if(restricted) {
    const metadata=await stat(selected.target).catch(()=>null);
    assert(selected.relative && !metadata?.isDirectory(),'Choose a single shared file to review.');
    if(old) assert(!(await stat(old.target).catch(()=>null))?.isDirectory(),'Choose a single shared file to review.');
    // Missing directory prefixes can select historical descendants (including staged deletions).
    const names=await git(root.path,['diff','--name-only','-z','--relative','--no-renames','--no-ext-diff','--no-textconv',...(params.staged===true?['--cached']:[]),'--',selected.relative,...(old?.relative?[old.relative]:[])]);
    const allowed=new Set([selected.relative,old?.relative].filter(Boolean));
    for(const name of names.text.split('\0').filter(Boolean)) assert(allowed.has(name),'Choose a single shared file to review.');
  }
  const args=['diff','--no-ext-diff','--no-textconv','--relative',...((nested||restricted)?['--no-renames']:[]),...(params.staged===true?['--cached']:[]),'--',selected.relative||'.',...(old?.relative?[old.relative]:[])];
  let result=await git(root.path,args,{diff:true});
  if(!result.text && selected.relative && params.staged!==true) {
    const tracked=await git(root.path,['ls-files','-z','--',selected.relative]);
    const metadata=await stat(selected.target).catch(()=>null);
    if(!tracked.text && metadata?.isFile()) {
      const ignored=await git(root.path,['check-ignore','--',selected.relative],{optional:true,literal:false});
      assert(!ignored,'This file is ignored by Git.');
      result=await git(root.path,['diff','--no-index','--no-ext-diff','--no-textconv','--','/dev/null',selected.relative],{diff:true});
    }
  }
  if(result.truncated && params.preview!==true) throw fault('GIT_DIFF_TOO_LARGE','This diff is too large for this view. Open a single file or review it on the PC.');
  return {repository:true,diff:result.text,truncated:result.truncated,path:selected.relative,staged:params.staged===true};
}
