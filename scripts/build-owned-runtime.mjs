import { readdir, readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';
import { buildRuntimeSchema } from './build-runtime-schema.mjs';

const root = fileURLToPath(new URL('../src/runtime/', import.meta.url));
const check = process.argv.includes('--check');
await buildRuntimeSchema({ check });
const owners = ['engine', 'agent', 'providers', 'terminal', 'protocol', 'client', 'telemetry'];
const rewriteImports = source => source.replace(/(['"])(\.{1,2}\/[^'"\n]+)\.ts\1/g, '$1$2.js$1').replace(/(['"])(\.{1,2}\/[^'"\n]+)\/source\/([^'"\n]+)\1/g, '$1$2/src/$3$1');
async function emit(output, content) {
  if (check) {
    const actual = await readFile(output).catch(() => null);
    if (!actual || !actual.equals(Buffer.from(content))) throw new Error(`Stale owned runtime output: ${path.relative(root, output)}`);
  } else {
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, content);
  }
}
const declarations = await mkdtemp(path.join(tmpdir(), 'zyra-owned-runtime-types-'));
try {
  await new Promise((resolve, reject) => {
    const compiler = fileURLToPath(import.meta.resolve('typescript/lib/tsc.js'));
    const child = spawn(process.execPath, [compiler, '-p', path.join(root, 'tsconfig.json'), '--outDir', declarations], { stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error('Owned runtime TypeScript validation failed.')));
  });
  for (const owner of owners) {
    const directory = path.join(declarations, owner, 'source');
    for (const file of (await readdir(directory, { recursive: true })).filter(file => file.endsWith('.d.ts'))) {
      await emit(path.join(root, owner, 'src', file), rewriteImports(await readFile(path.join(directory, file), 'utf8')));
    }
  }
} finally {
  if (!declarations.startsWith(path.join(tmpdir(), 'zyra-owned-runtime-types-'))) throw new Error('Unsafe compiler temporary directory.');
  await rm(declarations, { recursive: true, force: true });
}
let count = 0;
for (const owner of owners) {
  const directory = path.join(root, owner, 'source');
  for (const file of (await readdir(directory, { recursive: true })).sort()) {
    const input = path.join(directory, file);
    if (file.endsWith('.d.ts') || /\.(?:json|html|css|png|svg)$/.test(file) || file.includes('export-html') && file.endsWith('.js')) {
      await emit(path.join(root, owner, 'src', file), await readFile(input));
      continue;
    }
    if (!file.endsWith('.ts')) continue;
    const output = path.join(root, owner, 'src', file.replace(/\.ts$/, '.js'));
    const source = rewriteImports(await readFile(input, 'utf8'));
    const { code } = await transform(source, { loader: 'ts', target: 'es2022', supported: { 'import-attributes': true }, format: 'esm', sourcefile: input, legalComments: 'inline' });
    const maintained = '// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.\n' + code;
    await emit(output, maintained);
    count++;
  }
}
console.log(`Zyra runtime: ${count} maintained modules ${check ? 'verified' : 'compiled'}.`);
