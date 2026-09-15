import { createHash, randomUUID } from 'node:crypto';
import { projectHistoryMedia } from '../../../src/agent-server/history-media.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import https from 'node:https';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { MobileVoiceSession } from '../src/voice-session.mjs';
import { MobilePluginSession } from '../src/plugin-session.mjs';
const { createGateway, hostTls } = process.env.ZYRA_GATEWAY_TEST_BUNDLE
  ? await import(process.env.ZYRA_GATEWAY_TEST_BUNDLE)
  : await import('../src/desktop-entry.mjs');

test('TLS gateway pairs, authenticates, refuses privileged RPC and revokes an open connection', { timeout: 20000 }, async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'zyra-gateway-wire-'));
  let gateway, socket;
  try {
    const tls = await hostTls(dir);
    const imageFolder = path.join(dir, 'shared'); mkdirSync(imageFolder);
    const authoredImage = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(100, 4)]);
    writeFileSync(path.join(imageFolder, 'preview.png'), authoredImage);
    const recoveryAudio = readFileSync(new URL('../../android/app/src/test/resources/recovered-voice.wav', import.meta.url));
    let detached = false, promptImages, voiceStopped = false, voiceUnsubscribed = false, voiceListener, plugins;
    const pluginWrites = [];
    const regenerated = [];
    const image = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(3 * 1024 * 1024 + 100, 2)]);
    const entry = { id: 'image-entry', type: 'message', message: { role: 'user', content: [{ type: 'image', mimeType: 'image/png', data: image.toString('base64') }] } };
    class Client extends EventEmitter {
      async connect() {}
      async request(method, params) {
        if (method === 'catalog.get') return {chat:{canonicalChatId:params.session,project:params.session === 'private' ? '/private' : '/workspace'}};
        if (method === 'catalog.history') return {history:{entries:[{...(params.mediaBodies ? projectHistoryMedia(entry, 0) : entry),historyEntryIndex:0}]}};
        if (method === 'session.join') return {sessionKey:'chat',canonicalChatId:'chat',connected:{},replay:[],latestSequence:0,pendingAttention:[]};
        if (method === 'session.request') { promptImages = params.payload.images; return {accepted:true}; }
        if (method === 'server.status') return { version: 5, sessions: [] };
        if (method === 'catalog.list') return { chats: [] };
        return {};
      }
      close() { detached = true; }
    }
    gateway = createGateway({ tls, directory: dir, projects: ['/workspace', imageFolder], clientFactory: () => new Client(),
      resolveScope: async () => ({ roots: [{ path: imageFolder, kind: 'associated-folder' }] }),
      regenerateTitle: async id => { regenerated.push(id); return { title: 'Clear synthetic title' }; },
      accountLimits: async () => ({ rateLimits: { primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: 1800000000 } } }),
      review: { index: async id => { assert.equal(id, 'chat'); return { turns: [{ id: 'wire-turn', number: 1, state: 'completed', changes: [] }] }; }, turn: async () => ({ messages: [], activities: [] }) },
      terminalFactory: () => ({ supportsSplit: true, async dispatch() { return {}; }, close() {} }),
      pluginFactory: () => plugins = new MobilePluginSession({
        context: async id => { assert.equal(id, 'chat'); return {sessionId:'desktop-local-chat',projectId:'project-on-pc'}; },
        catalog: async () => ({revision:9,plugins:[],releases:[],sources:[],pluginSets:[],chatScopes:[]}),
        defaults: async input => { pluginWrites.push(input); },
        refresh: async input => { pluginWrites.push(input); }
      }),
      voiceFactory: (_device, receive) => new MobileVoiceSession({
        dictation: { state: async () => ({ available: true, signedIn: true }), transcribe: async input => { assert.deepEqual(Buffer.from(input.audioBase64, 'base64'), recoveryAudio); return 'Dictated over TLS'; } },
        start: async () => ({ adapterSessionId: 'voice-wire', sdp: 'v=0 answer' }),
        stop: async () => { voiceStopped = true; }, message: async () => ({}),
        ingest: async (_id, event) => voiceListener?.(event),
        transcribe: async input => { assert.deepEqual(Buffer.from(input.audioBase64, 'base64'), recoveryAudio); return 'Recovered over the paired TLS connection'; },
        subscribe: listener => { voiceListener = listener; return () => { voiceUnsubscribed = true; voiceListener = null; }; }
      }, receive),
      searchChats: async () => ({ indexingOlderChats: false, matches: [{ canonicalChatId: 'chat', threadId: 't', messageId: 'm', snippet: 'Matching answer', role: 'assistant' }, { canonicalChatId: 'private', snippet: 'Private answer' }] }),
      searchContext: async params => ({ messages: [{ id: params.messageId, role: 'assistant', text: 'Matching answer in context' }] }) });
    const address = await gateway.listen();
    const origin = 'https://127.0.0.1:' + address.port;
    const pinned = { ca: tls.cert, checkServerIdentity: (_host, cert) => cert.fingerprint256.replaceAll(':', '').toLowerCase() === tls.fingerprint ? undefined : new Error('Wrong host identity') };
    const code = gateway.devices.createPairing();
    const pairBody = JSON.stringify({ name: 'Synthetic phone', secret: code.secret });
    const paired = await new Promise((resolve, reject) => {
      const req = https.request(origin + '/pair', { ...pinned, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(pairBody) } }, res => {
        const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve(JSON.parse(Buffer.concat(chunks))));
      }); req.on('error', reject); req.end(pairBody);
    });
    assert.ok(paired.token);
    const repairBody = JSON.stringify({ name: 'Synthetic phone', secret: gateway.devices.createPairing().secret, previous: paired });
    const repaired = await new Promise((resolve, reject) => {
      const req = https.request(origin + '/pair', { ...pinned, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(repairBody) } }, res => {
        const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve(JSON.parse(Buffer.concat(chunks))));
      }); req.on('error', reject); req.end(repairBody);
    });
    assert.equal(repaired.deviceId, paired.deviceId); assert.equal(repaired.token, paired.token); assert.equal(gateway.devices.list().length, 1);
    socket = new WebSocket(origin.replace('https:', 'wss:') + '/connect', pinned);
    await once(socket, 'open');
    const messages = [];
    socket.on('message', bytes => messages.push(JSON.parse(bytes.toString())));
    const wait = async predicate => {
      const end = Date.now() + 3000;
      while (Date.now() < end) { const value = messages.find(predicate); if (value) return value; await new Promise(r => setTimeout(r, 10)); }
      throw new Error('Expected gateway response did not arrive');
    };
    socket.send(JSON.stringify({ type: 'hello', version: 1, deviceId: paired.deviceId, token: paired.token }));
    assert.equal((await wait(m => m.type === 'hello.ok')).hostId, paired.hostId);
    assert.ok((await wait(m => m.type === 'hello.ok')).capabilities.includes('voice'));
    assert.ok((await wait(m => m.type === 'hello.ok')).capabilities.includes('plugins'));
    assert.ok((await wait(m => m.type === 'hello.ok')).capabilities.includes('plugins-machine'));
    assert.ok((await wait(m => m.type === 'hello.ok')).capabilities.includes('terminal-split'));
    assert.ok((await wait(m => m.type === 'hello.ok')).capabilities.includes('title-generation'));
    assert.ok((await wait(m => m.type === 'hello.ok')).capabilities.includes('project-images'));
    assert.ok((await wait(m => m.type === 'hello.ok')).capabilities.includes('file-links'));
    assert.ok((await wait(m => m.type === 'hello.ok')).capabilities.includes('turn-review'));
    socket.send(JSON.stringify({ type: 'request', id: 'inspect', method: 'host.status', params: {} }));
    assert.equal((await wait(m => m.id === 'inspect')).ok, true);
    socket.send(JSON.stringify({ type: 'request', id: Date.now() + ':forbidden', method: 'server.retire', params: {} }));
    assert.equal((await wait(m => m.id?.endsWith(':forbidden'))).error.code, 'METHOD_NOT_ALLOWED');
    socket.send(JSON.stringify({ type: 'request', id: 'receipts', method: 'operation.status', params: { ids: ['unseen', 'other-device:request'] } }));
    assert.deepEqual((await wait(m => m.id === 'receipts')).result.operations.map(operation => operation.state), ['unknown', 'unknown']);
    const rpc = async (method, params) => { const id = Date.now() + ':' + randomUUID(); socket.send(JSON.stringify({type:'request',id,method,params})); const response = await wait(m => m.id === id); assert.equal(response.ok, true, JSON.stringify(response.error)); return response.result; };
    const authoredRef = (await rpc('workspace.image', { session: 'chat', destination: 'preview.png' })).mediaRef;
    const linkedFile = await rpc('workspace.link', { session: 'chat', destination: 'preview.png#L3' });
    assert.equal(linkedFile.rootId, authoredRef.source.rootId); assert.equal(linkedFile.path, 'preview.png'); assert.equal(linkedFile.line, 3);
    assert.deepEqual(Buffer.from((await rpc('workspace.image.chunk', { session: 'chat', ref: authoredRef, offset: 0 })).base64, 'base64'), authoredImage);
    assert.deepEqual(await rpc('catalog.regenerateTitle', { session: 'chat' }), { title: 'Clear synthetic title' });
    assert.deepEqual(regenerated, ['chat'], 'advertised title action reaches the Desktop adapter over paired TLS');
    assert.ok((await wait(m => m.type === 'hello.ok')).capabilities.includes('account-limits'));
    assert.equal((await rpc('account.limits', {})).groups[0].windows[0].remainingPercent, 75);
    assert.equal((await rpc('review.list', { session: 'chat' })).turns[0].id, 'wire-turn');
    assert.deepEqual((await rpc('review.turn', { session: 'chat', turnId: 'wire-turn' })).messages, []);
    const machinePlugins = await rpc('plugins.list', {scope:'machine'});
    assert.equal(machinePlugins.hasChat,false); assert.equal(machinePlugins.manageMachine,false);
    await rpc('session.attach', { session: 'chat' });
    const pluginView = await rpc('plugins.list', {session:'chat'});
    assert.equal(pluginView.revision,9); assert.equal(pluginView.defaults.kind,'project');
    await rpc('plugins.defaults', {session:'chat',projectId:'caller-cannot-redirect',pluginIds:[],expectedRevision:1});
    await rpc('plugins.refresh', {session:'chat',sessionId:'caller-cannot-redirect',confirmed:true,expectedCatalogRevision:9});
    assert.deepEqual(pluginWrites,[{projectId:'project-on-pc',pluginIds:[],expectedRevision:1},{sessionId:'desktop-local-chat',expectedCatalogRevision:9}]);
    assert.ok((await wait(m => m.type === 'hello.ok')).capabilities.includes('dictation'));
    const dictationJournalPath = path.join(dir, 'operations.jsonl');
    const dictationJournal = () => existsSync(dictationJournalPath) ? readFileSync(dictationJournalPath, 'utf8') : '';
    const journalBeforeDictation = dictationJournal();
    assert.equal((await rpc('dictation.status', { session: 'chat' })).signedIn, true);
    const dictation = { session: 'chat', recoveryId: 'wire-dictation' };
    await rpc('dictation.begin', { ...dictation, bytes: recoveryAudio.length, durationMs: 2000, sha256: createHash('sha256').update(recoveryAudio).digest('hex') });
    for (let offset = 0; offset < recoveryAudio.length; offset += 49152) await rpc('dictation.chunk', { ...dictation, offset, data: recoveryAudio.subarray(offset, offset + 49152).toString('base64') });
    assert.deepEqual(await rpc('dictation.finish', dictation), { text: 'Dictated over TLS' });
    assert.equal(dictationJournal(), journalBeforeDictation, 'dictation must not store audio or transcripts in the command journal');
    const voice = await rpc('voice.start', { session: 'chat', sdp: 'v=0 offer' });
    assert.equal(voice.recoveryAvailable, true);
    const journalPath = path.join(dir, 'operations.jsonl');
    const journal = () => existsSync(journalPath) ? readFileSync(journalPath, 'utf8') : '';
    const journalBeforeRecovery = journal();
    const recovery = { session: 'chat', adapterSessionId: voice.adapterSessionId, recoveryId: 'wire-recovery' };
    await rpc('voice.recovery.begin', { ...recovery, providerItemId: 'wire-spoken', bytes: recoveryAudio.length, durationMs: 2000, sha256: createHash('sha256').update(recoveryAudio).digest('hex') });
    for (let offset = 0; offset < recoveryAudio.length; offset += 49152) await rpc('voice.recovery.chunk', { ...recovery, offset, data: recoveryAudio.subarray(offset, offset + 49152).toString('base64') });
    assert.deepEqual(await rpc('voice.recovery.finish', recovery), { providerItemId: 'wire-spoken', text: 'Recovered over the paired TLS connection' });
    assert.equal(journal(), journalBeforeRecovery, 'audio recovery must never enter the durable command journal');
    await rpc('voice.ingest', { session: 'chat', adapterSessionId: voice.adapterSessionId, events: [{ type: 'transcript.done', role: 'user', text: 'Synthetic voice text' }] });
    const voiceEvent = await wait(m => m.type === 'voice.event');
    assert.equal(voiceEvent.session, 'chat'); assert.equal(voiceEvent.event.text, 'Synthetic voice text');
    const search = await rpc('catalog.search', {query:'answer'});
    assert.equal(search.matches.length, 1); assert.equal(search.matches[0].snippet, 'Matching answer');
    const context = await rpc('catalog.search.context', {session:'chat',threadId:'t',messageId:'m'});
    assert.equal(context.messages[0].text, 'Matching answer in context');
    const history = await rpc('catalog.history',{session:'chat'});
    assert.ok(JSON.stringify(history).length < 800, 'history must not transfer the full image');
    const ref = history.history.entries[0].message.content[0].mediaRef;
    const download = []; let offset = 0;
    while (offset < ref.bytes) { const chunk = await rpc('media.chunk',{session:'chat',ref,offset}); download.push(Buffer.from(chunk.base64,'base64')); offset = chunk.next; }
    assert.deepEqual(Buffer.concat(download),image);
    const uploadId = randomUUID();
    await rpc('upload.begin',{session:'chat',uploadId,name:'image.png',size:image.length,sha256:createHash('sha256').update(image).digest('hex')});
    for (let offset = 0; offset < image.length; offset += 49152) await rpc('upload.chunk',{session:'chat',uploadId,offset,base64:image.subarray(offset,offset+49152).toString('base64')});
    assert.equal((await rpc('upload.finish',{session:'chat',uploadId})).ready,true);
    await rpc('session.attach',{session:'chat'});
    await rpc('session.request',{sessionKey:'chat',type:'prompt',payload:{prompt:'',imageUploads:[uploadId]}});
    assert.deepEqual(Buffer.from(promptImages[0].data,'base64'),image);
    const closed = once(socket, 'close'); gateway.revoke(paired.deviceId);
    assert.equal(plugins.closed,true,'revocation immediately closes Plugin work');
    await Promise.resolve(); assert.equal(voiceStopped, true, 'revocation begins Voice cleanup without waiting for the closing handshake');
    await closed;
    assert.equal(detached, true);
    assert.equal(gateway.devices.authenticate(paired.deviceId, paired.token), null);
    await gateway.close();
    assert.equal(voiceStopped, true); assert.equal(voiceUnsubscribed, true);
  } finally {
    socket?.terminate(); await gateway?.close(); rmSync(dir, { recursive: true, force: true });
  }
});


test('each connected phone gets its own project scope; changing one drops only its connection and cached bodies', { timeout: 15000 }, async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'zyra-device-scope-wire-'));
  const sockets = []; let gateway;
  const shared = path.resolve('/workspace'), privateRoot = path.resolve('/private');
  class Client extends EventEmitter {
    async connect() {}
    async request(method, params) {
      if (method === 'catalog.projects') return { projects: [shared, privateRoot] };
      if (method === 'catalog.get') return { chat: { canonicalChatId: params.session, project: params.session === 'private' ? privateRoot : shared } };
      if (method === 'catalog.history') return { history: { entries: [{ text: 'x'.repeat(40000) }] } };
      if (method === 'catalog.list') return { chats: [{ canonicalChatId: 'shared', project: shared }, { canonicalChatId: 'private', project: privateRoot }].filter(chat => !(params.excludedProjects || []).includes(chat.project)) };
      return {};
    }
    close() { this.removeAllListeners(); }
  }
  try {
    const tls = await hostTls(dir);
    gateway = createGateway({ tls, directory: dir, projects: [shared], allProjects: true, clientFactory: () => new Client(), terminalFactory: () => ({ async dispatch() { return {}; }, close() {} }) });
    const address = await gateway.listen();
    const pair = name => gateway.devices.pair(gateway.devices.createPairing().secret, name);
    const a = pair('Phone A'), b = pair('Phone B');
    const connect = async device => {
      const ws = new WebSocket('wss://127.0.0.1:' + address.port + '/connect', { ca: tls.cert, checkServerIdentity: (_host, cert) => cert.fingerprint256.replaceAll(':', '').toLowerCase() === tls.fingerprint ? undefined : new Error('Wrong host') });
      sockets.push(ws); const messages = [];
      ws.on('message', bytes => messages.push(JSON.parse(bytes.toString())));
      const wait = async predicate => { const until = Date.now() + 2500; while (Date.now() < until) { const item = messages.find(predicate); if (item) return item; await new Promise(resolve => setTimeout(resolve, 10)); } throw Error('Missing scoped response'); };
      await once(ws, 'open'); ws.send(JSON.stringify({ type: 'hello', version: 1, deviceId: device.deviceId, token: device.token }));
      const hello = await wait(item => item.type === 'hello.ok');
      return { ws, hello, rpc: async (method, params = {}) => { const id = Date.now() + ':' + randomUUID(); ws.send(JSON.stringify({ type: 'request', id, method, params })); return wait(item => item.id === id); } };
    };
    const firstA = await connect(a), phoneB = await connect(b);
    assert.ok(firstA.hello.capabilities.includes('terminal'));
    assert.ok(!firstA.hello.capabilities.includes('terminal-split'), 'legacy adapters must not advertise two-pane support');
    assert.deepEqual(firstA.hello.projects, [shared, privateRoot]);
    const oldBody = await firstA.rpc('catalog.history', { session: 'private' });
    assert.ok(oldBody.result.deferred.bodyId);
    const closed = once(firstA.ws, 'close');
    gateway.setAccess(a.deviceId, { hiddenProjects: [privateRoot] });
    await closed;
    assert.equal(phoneB.ws.readyState, WebSocket.OPEN);
    assert.equal((await phoneB.rpc('catalog.history', { session: 'private' })).ok, true);
    const phoneA = await connect(a);
    assert.deepEqual(phoneA.hello.projects, [shared]);
    const chats = await phoneA.rpc('catalog.list');
    assert.deepEqual(chats.result.chats.map(chat => chat.canonicalChatId), ['shared']);
    for (const method of ['catalog.get', 'catalog.history', 'session.attach', 'catalog.update']) {
      const denied = await phoneA.rpc(method, { session: 'private', title: 'should not change' });
      assert.equal(denied.error.code, 'CHAT_NOT_VISIBLE', method);
    }
    assert.throws(() => gateway.cache.chunk(a.deviceId, oldBody.result.deferred.bodyId), { code: 'BODY_EXPIRED' });
    gateway.setAccess(a.deviceId, { hiddenProjects: [] });
    assert.equal(phoneB.ws.readyState, WebSocket.OPEN);
  } finally { for (const ws of sockets) ws.terminate(); await gateway?.close(); rmSync(dir, { recursive: true, force: true }); }
});
