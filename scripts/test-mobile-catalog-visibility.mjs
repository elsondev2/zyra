import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CanonicalChatCatalog } from '../src/agent-server/catalog.mjs';

test('catalog excludes hidden projects before indexing and pagination, and discovers new projects', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(),'zyra-visible-catalog-'));
  try {
    let indexed;
    const catalog = new CanonicalChatCatalog({stateDirectory:dir,index:{listProjects: async projects => { indexed = projects; return []; }}});
    const visible = path.join(dir,'visible'), hidden = path.join(dir,'hidden'), future = path.join(dir,'future');
    catalog.registerProject(visible); catalog.registerProject(hidden);
    await catalog.list({allProjects:true,excludedProjects:[hidden],limit:1});
    assert.deepEqual(indexed,[visible]);
    catalog.registerProject(future);
    assert.deepEqual(catalog.projectPaths(),[visible,hidden,future]);
    await catalog.list({allProjects:true,excludedProjects:[hidden],limit:1});
    assert.deepEqual(indexed,[visible,future]);
    await catalog.list({projects:[hidden],excludedProjects:[hidden]});
    assert.deepEqual(indexed,[], 'explicit query cannot restore a hidden project');
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
