import assert from 'node:assert/strict'
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { ZyraAgentServer } from '../src/agent-server/server.mjs'
import { ZyraAgentServerClient } from '../src/agent-server/client.mjs'

const root = await mkdtemp(path.join(os.tmpdir(), 'zyra-desktop-workspace-route-'))
const authority = 'desktop-workspace-test-authority'
const chat = {
  canonicalChatId: 'chat:test', sessionPath: '/tmp/chat.jsonl', project: root, cwd: root, title: 'Routing test',
  archived: false, deleted: false, createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(), messageCount: 1
}
const catalog = {
  find: async (selector) => selector === chat.canonicalChatId ? chat : null
}
const server = new ZyraAgentServer({ stateDirectory: root, channel: 'workspace-test', endpoint: 0, desktopAuthorityToken: authority, catalog })
await server.start()
const common = { root: process.cwd(), stateDirectory: root, channel: 'workspace-test', autoStart: false }
const desktop = new ZyraAgentServerClient({ ...common, clientId: 'desktop:test', surface: 'desktop', authorities: ['desktop-workspace', 'desktop-control'], authorityProof: authority })
let received = null
let observedTurn = null
let observedTurnEnd = null
desktop.setDesktopWorkspaceTurnHandler((canonicalChatId, turnId) => { observedTurn = { canonicalChatId, turnId } })
desktop.setDesktopWorkspaceTurnEndHandler((canonicalChatId, turnId) => { observedTurnEnd = { canonicalChatId, turnId } })
desktop.setControlHandler(async (operation) => ({ handled: operation.operation }))
desktop.setDesktopWorkspaceHandler(async (request) => {
  received = request
  return { tabId: 'utility:test', chatTitle: request.chatTitle, label: 'Details' }
})
await desktop.connect()
const tui = new ZyraAgentServerClient({ ...common, clientId: 'tui:test', surface: 'tui' })
await tui.connect()
const tuiServerClient = [...server.clients.values()].find((client) => client.clientId === 'tui:test')
let detachedControlResponse = null
const fakeSession = { clients: new Set([tuiServerClient]), foregroundTuiClient: tuiServerClient, activeRequestContext: null, controlOwners: new Map(), worker: { sendControlResponse: (response) => { detachedControlResponse = response } }, summary: () => ({ sessionKey: chat.canonicalChatId }), detach: () => undefined, dispose: () => undefined, sessionKey: chat.canonicalChatId }
server.sessions.set(chat.canonicalChatId, fakeSession)
server.routeControlRequest(fakeSession, { type: 'control.request', requestId: 'control:detached', operation: { operation: 'list_targets' } })
await new Promise((resolve) => setTimeout(resolve, 10))
assert.deepEqual(detachedControlResponse?.result, { handled: 'list_targets' })
const result = await tui.request('desktop.workspace.open', { operation: 'open', workspace: 'details', sourceCanonicalChatId: chat.canonicalChatId, canonicalChatId: chat.canonicalChatId })
assert.equal(received.canonicalChatId, chat.canonicalChatId)
assert.equal(result.tabId, 'utility:test')
server.notifyDesktopWorkspaceTurn(chat.canonicalChatId, 'turn:tui')
await new Promise((resolve) => setTimeout(resolve, 10))
assert.deepEqual(observedTurn, { canonicalChatId: chat.canonicalChatId, turnId: 'turn:tui' })
server.notifyDesktopWorkspaceTurnEnded(chat.canonicalChatId, 'turn:tui')
await new Promise((resolve) => setTimeout(resolve, 10))
assert.deepEqual(observedTurnEnd, { canonicalChatId: chat.canonicalChatId, turnId: 'turn:tui' })
const secondTui = new ZyraAgentServerClient({ ...common, clientId: 'tui:forged', surface: 'tui' })
await secondTui.connect()
const forgedServerClient = [...server.clients.values()].find((client) => client.clientId === 'tui:forged')
server.sessions.get(chat.canonicalChatId).clients.add(forgedServerClient)
await assert.rejects(() => secondTui.request('desktop.workspace.open', { operation: 'open', workspace: 'browser', background: true, sourceCanonicalChatId: chat.canonicalChatId, canonicalChatId: chat.canonicalChatId }), (error) => error.code === 'AGENT_SERVER_AUTH_FAILED')
server.sessions.get(chat.canonicalChatId).activeRequestContext = { turnId: 'turn:canonical' }
await assert.rejects(() => tui.request('desktop.workspace.open', { operation: 'open', workspace: 'browser', background: true, sourceCanonicalChatId: chat.canonicalChatId, canonicalChatId: chat.canonicalChatId }), (error) => error.code === 'AGENT_SERVER_AUTH_FAILED')
await assert.rejects(() => tui.request('desktop.workspace.open', { operation: 'open', workspace: 'browser', background: true, activeTurnId: 'turn:forged', sourceCanonicalChatId: chat.canonicalChatId, canonicalChatId: chat.canonicalChatId }), (error) => error.code === 'AGENT_SERVER_AUTH_FAILED')
server.sessions.get(chat.canonicalChatId).activeRequestContext = null
const browserClient = new ZyraAgentServerClient({ ...common, clientId: 'browser:test', surface: 'browser' })
await assert.rejects(() => browserClient.request('desktop.workspace.open', { operation: 'open', workspace: 'details', sourceCanonicalChatId: chat.canonicalChatId, canonicalChatId: chat.canonicalChatId }), (error) => error.code === 'AGENT_SERVER_AUTH_FAILED')
browserClient.close()
secondTui.close()
tui.close()
desktop.close()
server.sessions.delete(chat.canonicalChatId)
await server.stop()
await rm(root, { recursive: true, force: true })

const conflictRoot = await mkdtemp(path.join(os.tmpdir(), 'zyra-agent-server-generation-'))
await writeFile(path.join(conflictRoot, 'agent-server-v3-conflict.json'), JSON.stringify({ version: 3, pid: process.pid }))
const conflictServer = new ZyraAgentServer({ stateDirectory: conflictRoot, channel: 'conflict', endpoint: 0, catalog })
await assert.rejects(() => conflictServer.start(), (error) => error.code === 'AGENT_SERVER_PROTOCOL_CONFLICT')
await rm(conflictRoot, { recursive: true, force: true })

const staleRoot = await mkdtemp(path.join(os.tmpdir(), 'zyra-agent-server-stale-generation-'))
const staleDescriptor = path.join(staleRoot, 'agent-server-v3-stale.json')
const staleLock = path.join(staleRoot, 'agent-server-v3-stale.lock')
await writeFile(staleDescriptor, JSON.stringify({ version: 3, pid: 2_147_483_647 }))
await writeFile(staleLock, JSON.stringify({ pid: 2_147_483_647 }))
const staleServer = new ZyraAgentServer({ stateDirectory: staleRoot, channel: 'stale', endpoint: 0, catalog })
await staleServer.start()
await assert.rejects(() => access(staleDescriptor), (error) => error.code === 'ENOENT')
await assert.rejects(() => access(staleLock), (error) => error.code === 'ENOENT')
await staleServer.stop()
await rm(staleRoot, { recursive: true, force: true })
console.log('Zyra Desktop workspace routing: ok')
