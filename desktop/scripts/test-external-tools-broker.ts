import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { AgentControlBroker } from '../src/main/agent-control/agent-control-broker'
import { FakeControlDriver } from '../src/main/agent-control/drivers/fake-driver'
import { ZyraAgentServer } from '../../src/agent-server/server.mjs'
import { ZyraAgentServerClient } from '../../src/agent-server/client.mjs'
import { ZyraExternalToolsClient, EXTERNAL_TOOL_METHODS } from '../../src/agent-control/external-tools-client.mjs'
import { createBrowserToolSet } from '../../src/agent-control/browser-toolset.mjs'

const directory = mkdtempSync(path.join(os.tmpdir(), 'zyra-tool-broker-'))
const options = { stateDirectory: directory, channel: 'broker-fixture', endpoint: 0, desktopAuthorityToken: 'fixture-proof' }
const server = new ZyraAgentServer(options)
const desktop = new ZyraAgentServerClient({ ...options, autoStart: false, verifyRuntimeRevision: false,
    clientId: 'desktop:broker', surface: 'desktop', authorities: ['desktop-control', 'desktop-workspace'], authorityProof: 'fixture-proof' })
const raw = new ZyraAgentServerClient({ ...options, autoStart: false, verifyRuntimeRevision: false,
    clientId: 'pi:broker', surface: 'pi', requiredMethods: EXTERNAL_TOOL_METHODS })
const pi = new ZyraExternalToolsClient({ client: raw, project: directory, sourceSessionId: 'broker-parent' })
const driver = new FakeControlDriver()
const broker = new AgentControlBroker({ drivers: [driver] })
const tools = new Map(createBrowserToolSet({ client: pi }).map((tool: any) => [tool.name, tool]))
let principal: any
try {
    await server.start()
    desktop.setControlHandler(async (operation: unknown, message: any) => {
        principal = message.principal
        return broker.handleToolOperation(principal, operation)
    })
    desktop.setDesktopWorkspaceTurnEndHandler((_chatId: string, turnId: string) => {
        if (principal?.turnId === turnId) broker.revokePrincipal(principal, 'Pi turn ended')
    })
    await desktop.connect()
    const session = await pi.ensureSession()
    const targetId = broker.targets.createTargetId('zyra-browser')
    broker.registerTarget({ target: { kind: 'zyra-browser', targetId, tabId: 'fixture:tab',
        ownerThreadId: session.canonicalChatId, guestIdentity: 'fixture:guest', origin: 'http://127.0.0.1' }, driver, trustedIdentity: {} })
    const listed: any = await tools.get('browser_tabs').execute('list', { operation: 'list' })
    assert(listed.content[0].text.includes(targetId))
    const access = tools.get('browser_access').execute('access', { operation: 'request', targetId,
        capabilities: ['observe.structure', 'pointer.click'], durationMs: 30_000, maxActions: 3, allowedOrigins: ['http://127.0.0.1'] })
    let pending: any
    const deadline = Date.now() + 3_000
    while (!(pending = broker.grants.listPending()[0]) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5))
    assert(pending, 'Pi browser access uses the real Desktop approval path')
    assert.equal(pending.principal.threadId, session.canonicalChatId)
    const grant = broker.approvePendingGrant({ pendingRequestId: pending.requestId, targetId,
        capabilities: pending.capabilities, durationMs: 30_000, maxActions: 3 })
    const granted: any = await access
    assert.equal(granted.details.grant.grantId, grant.grantId)
    const clicked: any = await tools.get('browser_act').execute('click', { grantId: grant.grantId, targetId,
        observationRevision: granted.details.observation.revision, action: { type: 'click', elementRef: 'fixture:button', sideEffect: 'none' } })
    assert.equal(clicked.details.observation.title, 'Clicked', 'Pi action changes the driver through the real broker')
    await pi.endTurn()
    await new Promise(resolve => setTimeout(resolve, 20))
    assert.throws(() => broker.grants.requireActive(grant.grantId, principal), /revoked|active|found|expired/i)
    console.log('PASS Pi -> server -> Desktop broker: real approval, observed action and principal revocation (synthetic target; no foreground)')
} finally { await pi.close(); desktop.close(); broker.dispose(); await server.stop(); rmSync(directory, { recursive: true, force: true }) }
