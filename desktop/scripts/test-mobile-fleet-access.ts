import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MobileFleetAccess } from '../src/main/mobile-fleet-access'

const directory = await mkdtemp(join(tmpdir(), 'zyra-mobile-fleet-'))
try {
    const file = join(directory, 'child.jsonl')
    await writeFile(file, JSON.stringify({ type: 'message', message: { role: 'assistant', content: 'Saved result' } }) + '\n')
    const snapshot = { agents: { saved: { agentRunId: 'saved', status: 'completed', sessionFile: file } }, workflows: { flow: { workflowRunId: 'flow', status: 'completed' } } }
    const calls: string[] = []
    const access = new MobileFleetAccess(() => ({
        getSnapshot: async () => ({ sessions: [{ threads: [{ id: 'local', providerThreadId: 'canonical' }] }] }),
        getFleetSnapshot: async (id: string) => { calls.push(id); return { snapshot } }
    } as any))
    assert.equal((await access.read('canonical', 'agents.list', {}, { definitions: { active: [] }, runs: [] })).runs[0].agentRunId, 'saved')
    assert.equal((await access.read('canonical', 'workflows.list', {}, { runs: [] })).runs[0].workflowRunId, 'flow')
    assert.equal((await access.read('canonical', 'agents.status', { agentRunId: 'saved' })).status, 'completed')
    assert.equal((await access.read('canonical', 'agents.transcript', { agentRunId: 'saved', sessionFile: '/spoofed' })).entries[0].message.content, 'Saved result')
    assert.equal(await access.read('canonical', 'agents.status', { agentRunId: 'foreign' }), undefined)
    assert.equal(await access.read('foreign', 'agents.list', {}), undefined)
    assert.ok(calls.every(id => id === 'local'))
    assert.equal((await access.read('canonical', 'agents.list', {}, { runs: [{ agentRunId: 'saved', status: 'running' }] })).runs[0].status, 'running')
    console.log('PASS: saved agents/workflows, transcript, chat scope, live-run precedence')
} finally { await rm(directory, { recursive: true, force: true }) }
