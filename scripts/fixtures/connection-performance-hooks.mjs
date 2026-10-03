import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Test-only source substitution keeps relative imports anchored in the real repo.
// Baselines are captured before edits; no production files are rewritten to compare.
const root = path.resolve(import.meta.dirname, '../..');
registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (!url.startsWith('file:')) return result;
    const relative = path.relative(root, fileURLToPath(url)).replaceAll('\\', '/');
    let source = result.source;
    if (process.env.ZYRA_PERF_BASELINE_DIR && ['src/zyra-sdk.mjs', 'src/zyra-runtime.mjs', 'src/agent-server/client.mjs', 'src/runtime/engine/src/core/extensions/loader.js', 'src/runtime/engine/src/core/model-runtime.js'].includes(relative)) {
      source = readFileSync(path.join(process.env.ZYRA_PERF_BASELINE_DIR, relative), 'utf8');
    }
    if (process.env.ZYRA_PERF_TRACE_DIR) {
      const modules = globalThis.__zyraPerfModules ??= { count: 0, sourceBytes: 0, publicEngineEntry: false };
      modules.count++;
      modules.sourceBytes += source ? Buffer.byteLength(source) : 0;
      if (relative === 'src/runtime/engine/src/index.js') modules.publicEngineEntry = true;
    }
    if (!process.env.ZYRA_PERF_TRACE_DIR) return source === result.source ? result : { ...result, source };
    const method = relative === 'src/runtime/engine/src/core/model-runtime.js' ? 'modelRefresh'
      : relative === 'src/zyra-prompt-resources.mjs' ? 'skillSources' : null;
    if (!method) return source === result.source ? result : { ...result, source };
    const original = method === 'modelRefresh' ? 'ModelRuntime.prototype.refresh' : 'resolveZyraSkillSources';
    source = String(source) + `
import { writeFileSync as zyraPerfWrite } from 'node:fs';
const zyraPerfOriginal = ${original};
const zyraPerfStats = { phase: ${JSON.stringify(method)}, calls: 0, totalMs: 0 };
${original} = async function(...args) {
 const begin=performance.now();zyraPerfStats.calls++;
 try{return await zyraPerfOriginal.apply(this,args)}
 finally{zyraPerfStats.totalMs+=performance.now()-begin;zyraPerfWrite(process.env.ZYRA_PERF_TRACE_DIR+'/'+process.pid+'-${method}.json',JSON.stringify({...zyraPerfStats,modules:globalThis.__zyraPerfModules}));}
};`;
    return { ...result, source };
  },
});
