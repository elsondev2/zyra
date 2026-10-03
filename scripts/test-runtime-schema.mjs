import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Type as original } from 'typebox';
import { Type as bundled } from '../src/runtime/schema/bundled/root.js';
import { Compile } from '../src/runtime/schema/bundled/compile.js';
import { Value } from '../src/runtime/schema/bundled/value.js';

const shape=T=>T.Object({path:T.String(),count:T.Optional(T.Integer({minimum:1})),mode:T.Union([T.Literal('read'),T.Literal('write')])},{additionalProperties:false});
assert.deepEqual(shape(bundled),shape(original),'compiled schema constructors retain their data shape');
const validate=Compile(shape(bundled));
assert.equal(validate.Check({path:'src/file',count:2,mode:'read'}),true);
assert.equal(validate.Check({path:'src/file',count:0,mode:'read'}),false);
assert.equal(Value.Check(shape(bundled),{path:'src/file',mode:'write'}),true);
assert.equal(Value.Check(shape(bundled),{path:7,mode:'write'}),false);
const manifest=JSON.parse(await readFile(new URL('../src/runtime/schema/bundled/manifest.json',import.meta.url),'utf8'));
const installed=JSON.parse(await readFile(new URL('../package.json',import.meta.resolve('typebox')),'utf8'));
assert.equal(manifest.version,installed.version,'bundle pins the installed dependency');
for(const [specifier,file] of Object.entries(manifest.entries)){
 const full=await import(specifier);const compact=await import(new URL('../src/runtime/schema/bundled/'+file,import.meta.url));
 assert.deepEqual(Object.keys(compact).sort(),Object.keys(full).sort(),`${specifier} preserves all public exports`);
}
const directory=await mkdtemp(path.join(tmpdir(),'zyra-schema-test-'));
try{
 await mkdir(path.join(directory,'node_modules/typebox'),{recursive:true});
 await writeFile(path.join(directory,'node_modules/typebox/package.json'),JSON.stringify({type:'module',exports:'./index.mjs'}));
 await writeFile(path.join(directory,'node_modules/typebox/index.mjs'),"export const Type='nested dependency';");
 const nested=path.join(directory,'extension.mjs');
 await writeFile(nested,"import {Type} from 'typebox';export default Type;");
 const code=`import assert from 'node:assert/strict';import {Type} from 'typebox';import {Type as bundled} from ${JSON.stringify(new URL('../src/runtime/schema/bundled/root.js',import.meta.url).href)};assert.equal(Type,bundled);assert.equal((await import(${JSON.stringify(pathToFileURL(nested).href)})).default,'nested dependency');console.log('Owned preload and nested dependency isolation passed.');`;
 const child=spawnSync(process.execPath,['--import',new URL('../src/runtime/schema/preload.mjs',import.meta.url).href,'--input-type=module','-e',code],{cwd:path.resolve(import.meta.dirname,'..'),encoding:'utf8',windowsHide:true,timeout:30000});
 assert.equal(child.status,0,child.stderr);process.stdout.write(child.stdout);
}finally{
 if(path.dirname(path.resolve(directory))!==path.resolve(tmpdir())||!path.basename(directory).startsWith('zyra-schema-test-'))throw new Error('Unexpected test cleanup path');
 await rm(directory,{recursive:true,force:true});
}
console.log('Compiled schema: exports, constructors, validation, version pin, actual worker preload and extension dependency isolation passed.');
