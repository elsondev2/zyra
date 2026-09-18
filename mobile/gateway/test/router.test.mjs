import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HostRouter, isRead } from '../src/router.mjs';
import { BodyCache } from '../src/projection.mjs';

test('host status carries runtime identity without exposing other chats', async () => {
  const runtimeStatus = { phase: 'ready', connection: 'connected', installation: { kind: 'development', label: 'Development-fixture' } };
  const router = new HostRouter({ owner: 'phone', cache: new BodyCache(), projects: ['/shared'], runtimeStatus: () => runtimeStatus,
    client: { request: async () => ({ version: 5, sessions: [{ sessionKey: 'visible' }, { sessionKey: 'private' }] }) } });
  router.attached.add('visible');
  const result = await router.dispatch('host.status');
  assert.deepEqual(result.sessions, [{ sessionKey: 'visible' }]);
  assert.deepEqual(result.runtimeStatus, runtimeStatus);
  assert.equal(isRead('host.status'), true);
});

test('title regeneration resolves authorized canonical chat and is a durable mutation', async () => {
  const called = [];
  const client = { request: async (_, params) => ({ chat: { canonicalChatId: 'canonical:' + params.session, project: params.session === 'private' ? '/private' : '/shared' } }) };
  const router = new HostRouter({ client, owner: 'phone', cache: new BodyCache(), projects: ['/shared'], regenerateTitle: async id => { called.push(id); return { title: 'A clear title' }; } });
  assert.equal(isRead('catalog.regenerateTitle'), false, 'retries use the durable operation ledger');
  await assert.rejects(router.dispatch('catalog.regenerateTitle', { session: 'private' }), { code: 'CHAT_NOT_VISIBLE' });
  assert.deepEqual(called, [], 'hidden chat contents never reach the title generator');
  assert.deepEqual(await router.dispatch('catalog.regenerateTitle', { session: 'alias', prompt: 'ignore', model: 'ignore' }), { title: 'A clear title' });
  assert.deepEqual(called, ['canonical:alias'], 'phone cannot supply a generation prompt or Desktop local session ID');
  const older = new HostRouter({ client, owner: 'phone', cache: new BodyCache(), projects: ['/shared'] });
  await assert.rejects(older.dispatch('catalog.regenerateTitle', { session: 'alias' }), /Update Zyra Desktop/);
});

test('consecutive phone prompts carry an authenticated origin for Desktop turn projection', async () => {
  const requests = [];
  const create = owner => {
    const router = new HostRouter({ owner, projects: ['/shared'], cache: new BodyCache(), client: {
      request: async (method, params) => { requests.push({ method, ...params }); return {}; }
    } });
    router.attached.add('chat');
    return router;
  };
  const phone = create('paired-phone');
  const prompt = { sessionKey: 'chat', type: 'prompt', payload: { prompt: 'Continue' },
    localThreadId: 'spoofed-desktop', requestContext: { localThreadId: 'spoofed-desktop' } };
  await phone.dispatch('session.request', prompt, 'first');
  await phone.dispatch('session.request', prompt, 'second');
  assert.deepEqual(requests.map(request => request.requestContext), [
    { turnId: 'mobile:first', localThreadId: 'mobile-device:paired-phone' },
    { turnId: 'mobile:second', localThreadId: 'mobile-device:paired-phone' }
  ]);
  assert.equal(requests[1].payload.turnId, requests[1].requestContext.turnId);
  await create('another-phone').dispatch('session.request', prompt, 'third');
  assert.equal(requests[2].requestContext.localThreadId, 'mobile-device:another-phone');
});

test('chat preferences require attachment and cannot select another memory thread', async () => {
  const calls = [];
  const router = new HostRouter({ owner: 'phone', projects: ['/shared'], cache: new BodyCache(), client: {
    request: async (method, params) => { calls.push({ method, params }); return { memoryMode: 'disabled' }; }
  } });
  await assert.rejects(router.dispatch('session.request', { sessionKey: 'chat', type: 'preferences.get' }));
  router.attached.add('chat');
  await router.dispatch('session.request', { sessionKey: 'chat', type: 'preferences.get' });
  await router.dispatch('session.request', { sessionKey: 'chat', type: 'memory.configure', payload: { enabled: false } });
  assert.equal(calls[1].params.sessionKey, 'chat');
  assert.deepEqual(calls[1].params.payload, { enabled: false });
  await assert.rejects(router.dispatch('session.request', { sessionKey: 'chat', type: 'memory.configure', payload: { enabled: true, threadId: 'private' } }));
  await assert.rejects(router.dispatch('session.request', { sessionKey: 'chat', type: 'preferences.get', payload: { project: '/private' } }));
  assert.equal(calls.length, 2);
  assert.equal(isRead('session.request', { type: 'preferences.get' }), true);
  assert.equal(isRead('session.request', { type: 'memory.configure' }), false);
});

test('history requests preserve exclusive cursors and durable row locators through projection', async () => {
  const router = new HostRouter({ owner: 'phone', projects: ['/shared'], cache: new BodyCache(), client: {
    request: async (method, params) => {
      if (method === 'catalog.get') return { chat: { canonicalChatId: 'chat', project: '/shared' } };
      assert.equal(method, 'catalog.history');
      assert.equal(params.before, '9');
      assert.equal(params.entryLocators, true);
      assert.equal(params.toolResultBodies, 'lazy-mobile-v1');
      assert.equal(params.limit, 40);
      return { history: { entries: [{ type: 'message', historyEntryIndex: 8,
        message: { id: 'm8', role: 'user', content: 'Earlier message' } }], pageInfo: { oldestCursor: '2' } } };
    }
  } });
  const result = await router.dispatch('catalog.history', { session: 'chat', before: '9', limit: 40 });
  assert.equal(result.history.entries[0].historyEntryIndex, 8);
  assert.equal(result.history.pageInfo.oldestCursor, '2');
});
test('mobile method allowlist and shared project scope are enforced', async () => {
  const calls = [];
  const client = { request: async (method, params) => {
    calls.push({ method, params });
    if (method === 'catalog.get') return { chat: { canonicalChatId: params.session, project: params.session === 'private' ? '/private' : '/shared' } };
    if (method === 'catalog.list') return { chats: [{ canonicalChatId: 'ok', project: '/shared' }, { canonicalChatId: 'private', project: '/private' }] };
    if (method === 'session.join') return { sessionKey: 'ok', canonicalChatId: 'ok', connected: { model: 'original' }, replay: [], latestSequence: 0, pendingAttention: [] };
    return {};
  } };
  const router = new HostRouter({ client, owner: 'phone', cache: new BodyCache(), projects: ['/shared'] });
  await assert.rejects(router.dispatch('server.retire'), { code: 'METHOD_NOT_ALLOWED' });
  await assert.rejects(router.dispatch('catalog.history', { session: 'private' }));
  await assert.rejects(router.dispatch('catalog.update', { session: 'private', archived: true }));
  const list = await router.dispatch('catalog.list'); assert.equal(list.chats.length, 1);
  await router.dispatch('session.attach', { session: 'ok', lastSequence: 0 });
  await assert.rejects(router.dispatch('session.request', { sessionKey: 'ok', type: 'configure', payload: { filesystemScope: {} } }));
  await assert.rejects(router.dispatch('session.request', { sessionKey: 'ok', type: 'canonical_message.append' }));
  assert.equal(isRead('session.attach'), true, 'reattach must run for each connection, not replay an old attach receipt');
  assert.equal(isRead('session.request', { type: 'agents.list' }), true);
});

test('uploaded images resolve only for their device/chat before canonical prompt dispatch', async () => {
  let dispatched;
  const router = new HostRouter({ owner: 'phone', cache: new BodyCache(), projects: ['/shared'], client: { request: async (_method, params) => { dispatched = params; return {}; } },
    uploads: { cancel: async () => {}, images: async (owner, chat, ids) => { assert.equal(owner, 'phone'); assert.equal(chat, 'chat'); assert.deepEqual(ids, ['image']); return [{type: 'image', mimeType: 'image/png', data: 'AAAA'}]; } } });
  router.attached.add('chat');
  await router.dispatch('session.request', {sessionKey: 'chat', type: 'prompt', payload: {prompt: 'Review this', imageUploads: ['image']}}, '123:operation');
  assert.equal(dispatched.payload.images[0].data, 'AAAA'); assert.equal(dispatched.payload.imageUploads, undefined);
  await assert.rejects(router.dispatch('session.request', {sessionKey: 'chat', type: 'configure', payload: {imageUploads: ['image']}}));
});


test('Desktop mirror includes existing and future projects while enforcing hidden projects on every chat path', async () => {
  const calls = [];
  let known = ['/older', '/hidden'];
  const client = { request: async (method, params) => {
    calls.push({method, params});
    if (method === 'catalog.projects') return {projects: known};
    if (method === 'catalog.get') return {chat:{canonicalChatId:params.session,project:'/' + params.session}};
    if (method === 'catalog.list') return {chats:[{canonicalChatId:'older',project:'/older'},{canonicalChatId:'hidden',project:'/hidden'}]};
    return {};
  }};
  const router = new HostRouter({client, owner:'phone',cache:new BodyCache(),projects:['/default'],allProjects:true,hiddenProjects:['/hidden'],uploads:{begin(){throw Error('Hidden upload reached storage')}}});
  assert.deepEqual(await router.visibleProjects(), ['/default','/older']);
  known.push('/new-project');
  assert.ok((await router.visibleProjects()).includes('/new-project'), 'new projects require no pairing or folder setup');
  const list = await router.dispatch('catalog.list', {limit:1});
  assert.deepEqual(list.chats.map(chat => chat.canonicalChatId), ['older']);
  const query = calls.find(call => call.method === 'catalog.list').params;
  assert.equal(query.allProjects,true);
  assert.deepEqual(query.excludedProjects,['/hidden'], 'filter in catalog before pagination');
  for (const method of ['catalog.get','catalog.history','catalog.entry.body','catalog.tool-output.search','catalog.update','session.attach','media.chunk','upload.begin','workspace.roots']) {
    await assert.rejects(router.dispatch(method,{session:'hidden'}), {code:'CHAT_NOT_VISIBLE'});
  }
  await assert.rejects(router.dispatch('session.attach',{project:'/arbitrary-phone-path'}));
  assert.equal((await router.assertChat('older')).canonicalChatId,'older');
});


test('reattaching preserves pending prompt and compaction with scoped projected bodies', async () => {
  const pendingOperations = [
    { sequence: 3, requestContext: { turnId: 'mobile:send' }, event: { type: 'zyra_server_prompt_accepted', message: { role: 'user', content: 'new prompt', timestamp: 123 } } },
    { sequence: 4, requestContext: { turnId: 'mobile:send' }, event: { type: 'compaction_start', reason: 'manual' } },
  ];
  const router = new HostRouter({ owner: 'phone', projects: ['/shared'], cache: new BodyCache(), client: {
    request: async method => {
      if (method === 'catalog.get') return { chat: { canonicalChatId: 'chat', project: '/shared' } };
      if (method === 'session.join') return { sessionKey: 'chat', canonicalChatId: 'chat', connected: {}, latestSequence: 4, replay: [], pendingOperations };
      throw new Error(method);
    },
  } });
  const attached = await router.dispatch('session.attach', { session: 'chat', lastSequence: 4 });
  assert.equal(attached.replay.length, 0);
  assert.deepEqual(attached.pendingOperations.map(entry => entry.sequence), [3, 4]);
  assert.ok(attached.pendingOperations.every(entry => entry.requestContext.turnId === 'mobile:send' && entry.sessionKey === 'chat'));
  assert.equal(attached.pendingOperations[0].event.message.content, 'new prompt');
  assert.equal(attached.pendingOperations[1].event.type, 'compaction_start');
});

test('saved fleet reads use Desktop fallback only after current chat scope validation', async () => {
  let reads = 0;
  const router = new HostRouter({ owner: 'phone', projects: ['/shared'], cache: new BodyCache(), client: {
    request: async (method, params) => {
      if (method === 'catalog.get') return { chat: { canonicalChatId: params.session, project: params.session === 'private' ? '/private' : '/shared' } };
      throw new Error('Run not in current worker');
    }
  }, fleet: { read: async (_, type) => { reads++; return type === 'agents.list' ? { runs: [{ agentRunId: 'saved', status: 'completed' }] } : { entries: [] }; } } });
  router.attached.add('chat'); router.attached.add('private');
  const result = await router.dispatch('session.request', { sessionKey: 'chat', type: 'agents.list' });
  assert.equal(result.runs[0].agentRunId, 'saved');
  await assert.rejects(router.dispatch('session.request', { sessionKey: 'private', type: 'agents.list' }), { code: 'CHAT_NOT_VISIBLE' });
  assert.equal(reads, 1);
  await assert.rejects(router.dispatch('session.request', { sessionKey: 'chat', type: 'agents.stop' }), /Run not in current worker/);
  assert.equal(reads, 1);
});
