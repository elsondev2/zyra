import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createVisualizationStore, MAX_VISUALIZATION_MANIFEST_BYTES, MAX_VISUALIZATION_RESOURCES } from '../src/visualizations/store.mjs';
import { embedVisualizationReference, extractLegacyVisualizationSources, parseVisualizationReferences, validateScene3D, validateVisualizationSource } from '../src/visualizations/resources.mjs';
import { visualizationTerminalText } from '../src/visualizations/blocks.mjs';
import { visualizationActionPermission } from '../src/tool-contracts.mjs';
import { createZyraPermissionGateExtension } from '../src/zyra-permission-gate.mjs';

const temporary = await mkdtemp(path.join(os.tmpdir(), 'zyra-visualizations-'));
const cwd = path.join(temporary, 'project');
await mkdir(cwd);
const input = { kind: 'html', title: 'Useful chart', summary: 'Three values.', source: '<svg viewBox="0 0 100 100"><path d="M0 0 L10 10 Z"/><circle cx="10" cy="10" r="2" /></svg>', height: 240 };
const scene = { schemaVersion: 1, camera: { position: [4, 3, 5], target: [0, 0, 0] }, objects: [{ id: 'root', type: 'group' }, { id: 'box', type: 'box', parentId: 'root', size: [1, 2, 3], color: '#abc' }], grid: true };
let checks = 0;
function check(callback) { callback(); checks++; }
async function rejection(callback, matcher) { await assert.rejects(callback, matcher); checks++; }
try {
  const store = createVisualizationStore({ cwd, threadId: 'thread-a' });
  const terminalPin = embedVisualizationReference('12345678-1234-4123-8123-123456789abc', 3);
  check(() => assert.match(visualizationTerminalText(`Before\n${terminalPin}\nAfter`), /Saved visualization · v3/));
  check(() => assert.doesNotMatch(visualizationTerminalText(terminalPin), /<visualization-ref/));
  check(() => assert.match(visualizationTerminalText('```html\n' + terminalPin + '\n```'), /<visualization-ref/));
  check(() => assert.match(visualizationTerminalText('<visualization-ref id="', true), /Preparing saved visualization/));
  check(() => assert.deepEqual(validateScene3D(JSON.stringify(scene)), scene));
  for (const invalid of [
    { ...scene, schemaVersion: 2 }, { ...scene, objects: Array(129).fill(scene.objects[0]) },
    { ...scene, objects: [{ id: 'a', type: 'sphere', position: [Infinity, 0, 0] }] },
    { ...scene, objects: [{ id: 'a', type: 'box', color: 'url(x)' }] },
    { ...scene, objects: [{ id: 'a', type: 'box', radius: -1 }] },
    { ...scene, objects: [{ id: 'a', type: 'box', opacity: 2 }] },
    { ...scene, objects: [{ id: 'a', type: 'box', scale: [0, 1, 1] }] },
    { ...scene, objects: [{ id: 'a', type: 'box' }, { id: 'a', type: 'sphere' }] },
    { ...scene, objects: [{ id: 'a', type: 'group', parentId: 'b' }, { id: 'b', type: 'group', parentId: 'a' }] },
    { ...scene, objects: [{ id: 'a', type: 'box', parentId: 'missing' }] },
    { ...scene, objects: [{ id: 'a', type: 'box', script: 'alert(1)' }] },
    { ...scene, objects: [{ id: 'a', type: 'group', scale: [100, 100, 100] }, { id: 'b', type: 'box', parentId: 'a', scale: [100, 100, 100] }] },
  ]) check(() => assert.throws(() => validateScene3D(invalid)));
  for (const source of ['<script>alert(1)</script>', '<svg onload="a()"/>', '<a href="java&#x73;cript:alert(1)">x</a>', '<style>@import "remote";</style>', '<img src="remote"/>', '<svg><foreignObject/></svg>', '<style>a{background:url(remote)}</style>']) {
    check(() => assert.throws(() => validateVisualizationSource('html', source)));
    check(() => assert.throws(() => validateVisualizationSource('html', source, { legacy: true })));
  }
  for (const source of ['<svg viewBox="0 0 NaN 100"/>', '<svg><path d="M 1 L 2 3"/></svg>', '<svg><path d="M0 0 A10 10 0 3 0 4 5"/></svg>', '<svg><polygon points="1,2,3"/></svg>', '<svg><circle r="Infinity"/></svg>']) {
    check(() => assert.throws(() => validateVisualizationSource('html', source)));
    check(() => assert.equal(validateVisualizationSource('html', source, { legacy: true }), source));
  }
  check(() => assert.throws(() => validateVisualizationSource('mermaid', 'flowchart LR\nclick A "https://example.com"')));
  check(() => assert.throws(() => validateVisualizationSource('mermaid', '%%{init: {}}%%\nflowchart LR')));
  check(() => assert.throws(() => validateVisualizationSource('mermaid', '%%{config: {"securityLevel":"loose"}}%%\nflowchart LR')));
  check(() => assert.throws(() => validateVisualizationSource('html', `<p>${'é'.repeat(40000)}</p>`)));
  const gradient = '<svg viewBox="0 0 10 10"><defs><linearGradient id="basic-sphere"><stop offset="0%" stop-color="#abc"/></linearGradient></defs><circle cx="5" cy="5" r="4" fill="url(#basic-sphere)" /></svg>';
  check(() => assert.equal(validateVisualizationSource('html', gradient), gradient));
  check(() => assert.equal(validateVisualizationSource('html', gradient, { legacy: true }), gradient));
  check(() => assert.throws(() => validateVisualizationSource('html', gradient.replace('url(#basic-sphere)', 'url(https://example.com/image)'))));
  const resource = await store.create(input);
  check(() => assert.equal(resource.latestVersion, 1));
  check(() => assert.equal(resource.versions[0].parentVersion, null));
  const reference = embedVisualizationReference(resource.id, 1);
  check(() => assert.deepEqual(parseVisualizationReferences(`Before\n${reference}\nAfter`).map(p => p.kind), ['text', 'reference', 'text']));
  check(() => assert.equal(parseVisualizationReferences(reference)[0].state, 'complete'));
  check(() => assert.equal(parseVisualizationReferences(reference)[0].version, 1));
  check(() => assert.equal(parseVisualizationReferences('<visualization-ref id="')[0].state, 'incomplete'));
  check(() => assert.equal(parseVisualizationReferences('   <vis')[0].state, 'incomplete'));
  for (const example of [`\`\`\`html\n${reference}\n\`\`\``, `~~~~html\n${reference}\n~~~~`, `    ${reference}`, `<visualization-ref id="../x" version="1" />`, reference.replace('version="1"', 'version="0"'), reference.replace('version="1"', 'version="9007199254740992"')]) check(() => assert.ok(parseVisualizationReferences(example).every(p => p.kind === 'text')));
  const legacy = `<visualization title="Old" summary="Historical" height="200">\n<div>safe</div>\n</visualization>`;
  const examples = `\`\`\`html\n${legacy}\n\`\`\`\n`;
  const mermaid = '\n```mermaid\nflowchart LR\nA --> B\n```\n';
  const extracted = extractLegacyVisualizationSources(`${examples}${legacy}${mermaid}`);
  check(() => assert.equal(extracted.length, 2));
  check(() => assert.equal(extracted[0].offset, examples.length));
  check(() => assert.equal(extracted[0].kind, 'html'));
  check(() => assert.equal(extracted[1].kind, 'mermaid'));
  check(() => assert.equal(extractLegacyVisualizationSources('```mermaid\nA --> B').length, 0));
  check(() => assert.equal(extractLegacyVisualizationSources('<visualization title="Incomplete">\n<div>').length, 0));
  const reopened = createVisualizationStore({ cwd, threadId: 'thread-a' });
  const loaded = await reopened.get(resource.id, 1);
  check(() => assert.equal(loaded.selectedVersion.source, input.source));
  check(() => assert.equal(loaded.latestVersion, 1));
  const second = await store.revise({ id: resource.id, baseVersion: 1, expectedVersion: 1, source: '<p>Second</p>', title: 'Second chart', changeNote: 'Revise values' });
  const third = await reopened.revise({ id: resource.id, baseVersion: 1, expectedVersion: 2, source: '<p>Branch</p>', changeNote: 'Alternative from first' });
  check(() => assert.equal(second.latestVersion, 2));
  check(() => assert.equal(third.versions[2].parentVersion, 1));
  check(() => assert.equal(third.versions[2].title, input.title));
  check(() => assert.equal((loaded.versions[0].source), input.source));
  await rejection(() => store.revise({ id: resource.id, baseVersion: 1, expectedVersion: 1, source: '<p>Stale</p>' }), /conflict/);
  const before = await store.get(resource.id);
  await rejection(() => store.revise({ id: resource.id, baseVersion: 3, expectedVersion: 3, source: '<script/>' }), /not allowed/);
  const afterInvalid = await store.get(resource.id);
  check(() => assert.deepEqual(afterInvalid, before));
  check(() => assert.equal((before.versions[0].source), input.source));
  check(() => assert.deepEqual(visualizationActionPermission('list'), 'read'));
  check(() => assert.equal(visualizationActionPermission('embed'), 'read'));
  check(() => assert.equal(visualizationActionPermission('create'), 'write'));
  check(() => assert.equal(visualizationActionPermission('unknown'), 'write'));
  const { createVisualizationTool } = await import('../src/visualizations/tool.mjs');
  check(() => assert.throws(() => createVisualizationTool({ getContext: () => ({ cwd, threadId: 'thread-tool' }) }), /authorizer/));
  const deniedTool = createVisualizationTool({ getContext: () => ({ cwd, threadId: 'thread-tool' }), authorize: async () => ({ block: true, reason: 'Read-only visualization scope' }) });
  await rejection(() => deniedTool.execute('denied', { action: 'create', ...input }), /Read-only/);
  const trustedContext = { cwd, threadId: 'thread-tool' };
  const readOnlyScope = { roots: [{ path: cwd, access: 'read-only' }] };
  let readOnlyApprovalCalls = 0;
  const readOnlyGate = createZyraPermissionGateExtension({ project: cwd, filesystemScope: readOnlyScope,
    getPermissionMode: () => 'approval-required', requestPermission: async () => { readOnlyApprovalCalls++; return 'acceptForSession'; } });
  await readOnlyGate.authorizeVisualization(trustedContext, 'read', 'accepted-read');
  await readOnlyGate.authorizeVisualization(trustedContext, 'list', 'accepted-list');
  await rejection(() => readOnlyGate.authorizeVisualization(trustedContext, 'create', 'blocked-create'), /read-only/);
  check(() => assert.equal(readOnlyApprovalCalls, 0));
  const fullAccessReadOnlyGate = createZyraPermissionGateExtension({ project: cwd, filesystemScope: {
    roots: [{ path: cwd, access: 'read-write' }, { path: path.join(cwd, '.zyra'), access: 'read-only' }] }, getPermissionMode: () => 'full-access' });
  await fullAccessReadOnlyGate.authorizeVisualization(trustedContext, 'embed', 'full-read');
  await rejection(() => fullAccessReadOnlyGate.authorizeVisualization(trustedContext, 'revise', 'full-blocked-write'), /read-only/);
  const readOnlyModeGate = createZyraPermissionGateExtension({ project: cwd, filesystemScope: { roots: [{ path: cwd, access: 'read-write' }] }, getPermissionMode: () => 'read-only' });
  await readOnlyModeGate.authorizeVisualization(trustedContext, 'read', 'mode-read');
  await rejection(() => readOnlyModeGate.authorizeVisualization(trustedContext, 'create', 'mode-write'), /read-only/);
  const decisions = ['acceptOnce', 'deny', 'acceptForSession'], approvalRequests = [];
  const approvalGate = createZyraPermissionGateExtension({ project: cwd, filesystemScope: { roots: [{ path: cwd, access: 'read-write' }] },
    getPermissionMode: () => 'approval-required', requestPermission: async request => { approvalRequests.push(request); return decisions.shift() || 'deny'; } });
  await approvalGate.authorizeVisualization(trustedContext, 'read', 'read-before-write');
  check(() => assert.equal(approvalRequests.length, 0));
  await approvalGate.authorizeVisualization(trustedContext, 'create', 'approved-once');
  check(() => assert.equal(approvalRequests.length, 1));
  check(() => assert.equal(approvalRequests[0].toolName, 'write'));
  check(() => assert.equal(approvalRequests[0].paths[0], path.join(cwd, '.zyra', 'visualizations')));
  await rejection(() => approvalGate.authorizeVisualization(trustedContext, 'create', 'denied-after-once'), /declined/);
  await approvalGate.authorizeVisualization(trustedContext, 'revise', 'approved-session');
  await approvalGate.authorizeVisualization(trustedContext, 'create', 'session-write');
  check(() => assert.equal(approvalRequests.length, 3));
  await rejection(() => approvalGate.authorizeVisualization(trustedContext, 'delete', 'unknown-action'), /Unknown/);
  const outsideScope = path.join(temporary, 'outside-auth-scope'); await mkdir(outsideScope);
  await rejection(() => fullAccessReadOnlyGate.authorizeVisualization({ ...trustedContext, cwd: outsideScope }, 'create', 'outside-write'), /outside/);
  const gatedTool = createVisualizationTool({ getContext: () => trustedContext, authorize: readOnlyGate.authorizeVisualization.bind(readOnlyGate) });
  await rejection(() => gatedTool.execute('gated-write', { action: 'create', ...input }), /read-only/);
  const authorizationCalls = [];
  const tool = createVisualizationTool({ getContext: () => ({ cwd, threadId: 'thread-tool' }), authorize: async (context, action, toolCallId) => { authorizationCalls.push({ context, action, toolCallId }); } });
  const toolCreated = JSON.parse((await tool.execute('tool-create', { action: 'create', ...input })).content[0].text);
  const toolRevised = JSON.parse((await tool.execute('tool-revise', { action: 'revise', id: toolCreated.id, baseVersion: 1, expectedVersion: 1, source: '<p>Tool edit</p>' })).content[0].text);
  check(() => assert.equal(toolRevised.title, input.title));
  check(() => assert.equal(toolRevised.threadId, 'thread-tool'));
  check(() => assert.equal(authorizationCalls[0].context.cwd, cwd));
  check(() => assert.equal(authorizationCalls[0].action, 'create'));
  const toolRead = JSON.parse((await tool.execute('tool-read', { action: 'read', id: toolCreated.id, version: 1 })).content[0].text);
  check(() => assert.equal(toolRead.selectedVersion.source, input.source));
  check(() => assert.ok(toolRead.versions.every(version => !('source' in version)), 'only the requested source is sent back to the agent'));
  check(() => assert.equal(path.resolve(toolRead.sourceFile), path.join(cwd, '.zyra', 'visualizations', toolCreated.id, 'v1.html')));
  const directScene = JSON.parse((await tool.execute('direct-scene', { action: 'create', title: 'Typed scene', scene })).content[0].text);
  check(() => assert.equal(directScene.kind, 'scene3d'));
  check(() => assert.equal(directScene.versionCount, 1));
  await rejection(() => tool.execute('double-scene', { action: 'create', title: 'Wrong source', scene, source: JSON.stringify(scene) }), /either source or scene/);
  const home = path.join(temporary, 'project-home'); await mkdir(home);
  const homeCalls = [];
  const homeTool = createVisualizationTool({ getContext: () => ({ cwd: home, threadId: 'thread-tool', readRoots: [cwd] }), authorize: async (context, action) => { homeCalls.push({ cwd: context.cwd, action }); } });
  const legacyRead = JSON.parse((await homeTool.execute('home-read-cli', { action: 'read', id: toolCreated.id, version: 1 })).content[0].text);
  check(() => assert.equal(legacyRead.selectedVersion.source, input.source));
  await homeTool.execute('home-revise-cli', { action: 'revise', id: toolCreated.id, baseVersion: 2, expectedVersion: 2, source: '<p>Shared Project</p>' });
  check(() => assert.ok(homeCalls.some(call => call.cwd === cwd && call.action === 'revise'), 'the actual legacy destination, not only the home, is authorized for revision'));
  const readonlyLegacy = createVisualizationTool({ getContext: () => ({ cwd: home, threadId: 'thread-tool', readRoots: [cwd] }), authorize: async (context, action) => { if (context.cwd === cwd && action === 'revise') throw new Error('Read-only legacy folder'); } });
  await rejection(() => readonlyLegacy.execute('home-denied', { action: 'revise', id: toolCreated.id, baseVersion: 3, expectedVersion: 3, source: '<p>Must not save</p>' }), /Read-only/);
  const toolEmbedded = JSON.parse((await tool.execute('tool-embed', { action: 'embed', id: toolCreated.id, version: 1 })).content[0].text);
  check(() => assert.equal(toolEmbedded.embed, embedVisualizationReference(toolCreated.id, 1)));
  await rejection(() => tool.execute('unpinned', { action: 'embed', id: toolCreated.id }), /positive integer/);
  await rejection(() => tool.execute('bad-action', { action: 'delete', id: toolCreated.id }), /Unknown/);
  const races = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => createVisualizationStore({ cwd, threadId: 'thread-a' }).revise({ id: resource.id, baseVersion: 1, expectedVersion: 3, source: `<p>Race ${i}</p>` })));
  check(() => assert.equal(races.filter(r => r.status === 'fulfilled').length, 1));
  check(() => assert.equal(races.filter(r => r.status === 'rejected').length, 7));
  const afterRaces = await store.get(resource.id);
  check(() => assert.equal(afterRaces.latestVersion, 4));
  const sourcePath = path.join(cwd, '.zyra', 'visualizations', resource.id, 'v1.html');
  const originalFile = await readFile(sourcePath, 'utf8');
  check(() => assert.equal(originalFile, input.source));
  await writeFile(sourcePath, '<p>Tampered snapshot</p>');
  await rejection(() => store.get(resource.id), /differs from its immutable revision/);
  await writeFile(sourcePath, originalFile);
  const sceneResource = await store.create({ kind: 'scene3d', title: 'Scene', source: JSON.stringify(scene) });
  check(() => assert.equal(sceneResource.versions[0].source, JSON.stringify(scene, null, 2) + '\n', 'scene code is stored indented, not as one unreadable JSON line'));
  const sceneFile = await readFile(path.join(cwd, '.zyra', 'visualizations', sceneResource.id, 'v1.json'), 'utf8');
  check(() => assert.ok(sceneFile.includes('\n  "schemaVersion"')));
  const origin = { threadId: 'thread-a', messageId: 'message-a', offset: 42, turnId: 'turn-a' };
  const imported = await Promise.all(Array.from({ length: 8 }, () => createVisualizationStore({ cwd, threadId: 'thread-b' }).importLegacy({ ...input, source: '<svg><path d="M1"/></svg>', origin })));
  check(() => assert.ok(imported.every(item => item.id === imported[0].id)));
  check(() => assert.equal(imported[0].threadId, origin.threadId));
  check(() => assert.equal(imported[0].versions[0].origin.turnId, 'turn-a'));
  const changedImport = await store.importLegacy({ ...input, title: 'Changed extractor', source: '<p>Changed</p>', origin });
  check(() => assert.equal(changedImport.latestVersion, 1));
  check(() => assert.equal(changedImport.title, input.title));
  const oldCreatedAt = '2024-01-02T03:04:05.000Z';
  const datedImport = await store.importLegacy({ ...input, origin: { ...origin, offset: 43 }, createdAt: oldCreatedAt });
  check(() => assert.equal(datedImport.createdAt, oldCreatedAt));
  check(() => assert.equal(datedImport.versions[0].createdAt, oldCreatedAt));
  await rejection(() => store.importLegacy({ ...input, origin: { ...origin, offset: 44 }, createdAt: 'not a timestamp' }), /timestamp/);
  const other = await createVisualizationStore({ cwd, threadId: 'thread-b' }).create({ ...input, title: 'Other thread' });
  const threadList = await store.list({ threadOnly: true }), allList = await store.list(), queryList = await store.list({ query: 'Other thread' });
  check(() => assert.ok(threadList.every(item => item.threadId === 'thread-a')));
  check(() => assert.ok(allList.some(item => item.id === other.id)));
  check(() => assert.equal(queryList.length, 1));
  for (const id of ['../escape', '../../x', 'C:\\escape', `${resource.id}/../x`, '__proto__']) await rejection(() => store.get(id), /UUID/);
  await rejection(() => store.get(resource.id, 999), /does not exist/);
  await rejection(() => store.importLegacy({ ...input, origin: { ...origin, offset: -1 } }), /provenance/);
  // Two real processes race on one expectedVersion. Exactly one append commits.
  const storeURL = pathToFileURL(fileURLToPath(new URL('../src/visualizations/store.mjs', import.meta.url))).href;
  const childCode = `import {createVisualizationStore} from ${JSON.stringify(storeURL)};const s=createVisualizationStore({cwd:${JSON.stringify(cwd)},threadId:'thread-a'});try{await s.revise({id:${JSON.stringify(resource.id)},baseVersion:1,expectedVersion:4,source:'<p>Process race</p>'});console.log('committed')}catch(e){if(e.code==='VISUALIZATION_CONFLICT')console.log('conflict');else throw e}`;
  async function runChild() {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--input-type=module', '-e', childCode], { stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '', errors = '';
      child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { errors += chunk; });
      child.on('error', reject); child.on('exit', code => code === 0 ? resolve(output.trim()) : reject(new Error(errors)));
    });
  }
  const processResults = await Promise.all([runChild(), runChild()]);
  check(() => assert.deepEqual(processResults.sort(), ['committed', 'conflict']));
  const afterProcessRace = await store.get(resource.id), rootEntries = await readdir(path.join(cwd, '.zyra', 'visualizations')), resourceEntries = await readdir(path.dirname(sourcePath));
  check(() => assert.equal(afterProcessRace.latestVersion, 5));
  check(() => assert.ok(!rootEntries.includes('.write-lock')));
  check(() => assert.ok(!resourceEntries.some(name => name.endsWith('.tmp'))));
  // A known dead owner is recoverable after the grace period; only uncommitted artifacts are removed.
  const deadPid = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', 'console.log(process.pid)'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', data => { output += data; }); child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve(Number(output.trim())) : reject(new Error('PID fixture failed')));
  });
  const crashedLock = path.join(cwd, '.zyra', 'visualizations', '.write-lock'); await mkdir(crashedLock);
  await writeFile(path.join(crashedLock, 'owner.json'), JSON.stringify({ pid: deadPid, token: randomUUID(), createdAt: '2020-01-01T00:00:00.000Z' }));
  const orphanSource = path.join(path.dirname(sourcePath), 'v6.html'); await writeFile(orphanSource, '<p>Uncommitted</p>');
  const orphanTemporary = path.join(path.dirname(sourcePath), `.resource-${randomUUID()}.tmp`); await writeFile(orphanTemporary, '{}');
  const incompleteId = randomUUID(), incompleteDirectory = path.join(cwd, '.zyra', 'visualizations', incompleteId);
  await mkdir(incompleteDirectory); await writeFile(path.join(incompleteDirectory, 'v1.html'), '<p>Uncommitted create</p>');
  await store.create({ ...input, title: 'After crash' });
  await rejection(() => readFile(orphanSource), /ENOENT/);
  await rejection(() => readFile(orphanTemporary), /ENOENT/);
  await rejection(() => readFile(path.join(incompleteDirectory, 'v1.html')), /ENOENT/);
  const afterRecovery = await store.get(resource.id);
  check(() => assert.equal(afterRecovery.latestVersion, 5));
  check(() => assert.equal(afterRecovery.versions[0].source, input.source));
  // Persisted corruption and oversized files fail closed before source is returned.
  const manifestPath = path.join(path.dirname(sourcePath), 'resource.json');
  const originalManifest = await readFile(manifestPath, 'utf8');
  try {
    for (const mutate of [
      manifest => { manifest.versions[0].source = '<script/>'; },
      manifest => { manifest.versions[0].height = 999; },
      manifest => { manifest.title = 'Diverged latest metadata'; },
      manifest => { manifest.versions[0].createdAt = 'invalid'; },
      manifest => { manifest.versions = Array.from({ length: 129 }, () => manifest.versions[0]); manifest.latestVersion = 129; },
    ]) {
      const broken = JSON.parse(originalManifest); mutate(broken);
      await writeFile(manifestPath, JSON.stringify(broken));
      await rejection(() => store.get(resource.id));
    }
    await writeFile(manifestPath, ' '.repeat(MAX_VISUALIZATION_MANIFEST_BYTES + 1));
    await rejection(() => store.get(resource.id), /oversized/i);
  } finally { await writeFile(manifestPath, originalManifest); }
  const countProject = path.join(temporary, 'resource-count-limit'); await mkdir(countProject);
  const countRoot = path.join(countProject, '.zyra', 'visualizations'); await mkdir(countRoot, { recursive: true });
  await Promise.all(Array.from({ length: MAX_VISUALIZATION_RESOURCES }, async (_, i) => {
    const id = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, directory = path.join(countRoot, id);
    await mkdir(directory);
    await writeFile(path.join(directory, 'resource.json'), JSON.stringify({ ...resource, id }));
    await writeFile(path.join(directory, 'v1.html'), resource.versions[0].source);
  }));
  await rejection(() => createVisualizationStore({ cwd: countProject, threadId: 'thread' }).create(input), /count limit/);
  // Static symlink escapes: project .zyra, store root, resource directory and manifest.
  let symlinkChecks = 0;
  const outside = path.join(temporary, 'outside'); await mkdir(outside);
  for (const target of ['data', 'root', 'resource', 'manifest', 'source']) {
    const project = path.join(temporary, `symlink-${target}`); await mkdir(project);
    const candidate = createVisualizationStore({ cwd: project, threadId: 'thread' });
    let unsafe;
    if (target === 'data') unsafe = path.join(project, '.zyra');
    else if (target === 'root') { await mkdir(path.join(project, '.zyra')); unsafe = path.join(project, '.zyra', 'visualizations'); }
    else {
      const created = await candidate.create(input);
      unsafe = path.join(project, '.zyra', 'visualizations', created.id, target === 'manifest' ? 'resource.json' : target === 'source' ? 'v1.html' : '');
      await rm(unsafe, { recursive: true });
    }
    const directory = ['data', 'root', 'resource'].includes(target);
    const destination = directory ? outside : path.join(outside, `${target}.txt`);
    if (!directory) await writeFile(destination, '{}');
    try { await symlink(destination, unsafe, directory ? (process.platform === 'win32' ? 'junction' : 'dir') : 'file'); }
    catch (error) { if (process.platform === 'win32' && error.code === 'EPERM' && !directory) continue; throw error; }
    await rejection(() => target === 'data' || target === 'root' ? candidate.create(input) : candidate.list(), /Unsafe/);
    symlinkChecks++;
  }
  console.log(`Visualization resources: ${checks} checks passed; ${symlinkChecks}/5 symlink cases executed (Windows file symlinks may require privilege).`);
} finally { await rm(temporary, { recursive: true, force: true }); }
