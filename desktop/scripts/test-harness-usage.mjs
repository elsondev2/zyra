import {fileURLToPath} from 'node:url'
import {build} from 'esbuild'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'
const dir=await mkdtemp(join(tmpdir(),'zyra-usage-check-'))
try {
 for (const [entry,name] of [['./test-harness-usage.ts','test'],['./test-harness-worker.ts','worker-test'],['../src/main/assistant/usage/harness-worker.ts','worker']]) {
  await build({entryPoints:[fileURLToPath(new URL(entry,import.meta.url))],bundle:true,platform:'node',format:'esm',outfile:join(dir,name+'.mjs'),logLevel:'error'})
 }
 for(const name of ['test','worker-test']) {
  const result=spawnSync(process.execPath,[join(dir,name+'.mjs'),join(dir,'worker.mjs')],{stdio:'inherit',timeout:30000})
  if(result.status!==0){process.exitCode=result.status??1;break}
 }
} finally {await rm(dir,{recursive:true,force:true})}
