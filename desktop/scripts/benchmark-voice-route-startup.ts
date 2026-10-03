import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, basename } from 'node:path'
import { performance } from 'node:perf_hooks'
import { ForegroundControllerPersistence } from '../src/main/assistant/foreground/foreground-controller-persistence'
import { ForegroundRouteController } from '../src/main/assistant/foreground/foreground-route-controller'
import { createInitialChatRoute } from '../src/main/assistant/foreground/foreground-route-reducer'

const directory = await mkdtemp(join(tmpdir(), 'zyra-perf-voice-routes-'))
const identities = { routeId: (id: string, epoch: number) => `route_${id}_${epoch}`, ownerClaimId: (id: string, epoch: number) => `claim_${id}_${epoch}` }
const now = '2026-01-01T00:00:00.000Z'
const sampleCount = process.argv.includes('--verify-only') ? 0 : 3
const inputs = Array.from({ length: sampleCount ? 100 : 10 }, (_, i) => ({ conversationId: `chat-${i}`, contextVersion: i + 1, activationReason: 'migration' as const, attachedTaskIds: [`task-${i}`] }))
const samples: Record<string, Array<{ wallMs: number; cpuMs: number; atomicWrites: number; exportedBytes: number }>> = { before: [], after: [] }
try {
    for (let sample = -1; sample < sampleCount; sample++) {
        for (const mode of sample % 2 ? ['after', 'before'] : ['before', 'after']) {
            const path = join(directory, `${sample}-${mode}.sqlite`)
            const persistence: any = await ForegroundControllerPersistence.open(path)
            const controller = new ForegroundRouteController(persistence, identities, { now: () => now })
            let writes = 0, exportedBytes = 0
            const flush = persistence.flush.bind(persistence)
            const exportDb = persistence.db.export.bind(persistence.db)
            persistence.flush = () => { writes++; return flush() }
            persistence.db.export = () => { const bytes = exportDb(); exportedBytes += bytes.length; return bytes }
            const cpuStart = process.cpuUsage()
            const start = performance.now()
            const routes = mode === 'before' ? inputs.map(input => controller.initializeChat(input)) : controller.initializeChats(inputs)
            const wallMs = performance.now() - start
            const cpu = process.cpuUsage(cpuStart)
            assert.equal(routes.length, inputs.length)
            for (const input of inputs) assert.deepEqual(persistence.activeRoute(input.conversationId), createInitialChatRoute({ ...input, createdAt: now, identities }))
            if (sample >= 0) samples[mode]!.push({ wallMs, cpuMs: (cpu.user + cpu.system) / 1000, atomicWrites: writes, exportedBytes })
            const priorWrites = writes
            controller.initializeChats([...inputs, inputs[0]!]); assert.equal(writes, priorWrites, 'existing routes do not write')
            persistence.close()
            const reopened = await ForegroundControllerPersistence.open(path)
            for (const input of inputs) assert.equal(reopened.activeRoute(input.conversationId)?.context_version, input.contextVersion)
            const valid = createInitialChatRoute({ conversationId: 'rollback-new', contextVersion: 1, activationReason: 'migration', createdAt: now, identities })
            const conflict = { ...routes[0]!, foreground_route_id: 'different-route' }
            assert.throws(() => reopened.initializeConversations([valid, conflict]))
            assert.equal(reopened.activeRoute(valid.conversation_id), null, 'partial batch rolls back')
            assert.equal(reopened.activeRoute(inputs[0]!.conversationId)?.foreground_route_id, routes[0]!.foreground_route_id)
            reopened.close()
        }
    }
    const failurePath = join(directory, 'flush-failure.sqlite')
    const failurePersistence: any = await ForegroundControllerPersistence.open(failurePath)
    const failureController = new ForegroundRouteController(failurePersistence, identities, { now: () => now })
    const duplicateInput = { conversationId: 'duplicate-new', contextVersion: 1, activationReason: 'migration' as const }
    const duplicates = failureController.initializeChats([duplicateInput, { ...duplicateInput, contextVersion: 2 }])
    assert.deepEqual(duplicates[0], duplicates[1], 'new duplicate inputs use the first route')
    assert.equal(duplicates[1]!.context_version, 1)
    const flushBeforeFailure = failurePersistence.flush.bind(failurePersistence)
    failurePersistence.flush = () => { throw Error('Injected durable flush failure') }
    assert.throws(() => failureController.initializeChats([{ ...duplicateInput, conversationId: 'flush-failed' }]), /Injected durable flush failure/)
    assert.equal(failurePersistence.activeRoute('flush-failed'), null, 'failed flush rolls back memory')
    assert.equal(failurePersistence.activeRoute('duplicate-new')?.context_version, 1)
    const diskAfterFailure = await ForegroundControllerPersistence.open(failurePath)
    assert.equal(diskAfterFailure.activeRoute('flush-failed'), null, 'failed flush leaves the durable file unchanged')
    assert.equal(diskAfterFailure.activeRoute('duplicate-new')?.context_version, 1)
    diskAfterFailure.close()
    failurePersistence.flush = flushBeforeFailure
    failureController.initializeChats([{ ...duplicateInput, conversationId: 'flush-failed' }])
    assert.equal(failurePersistence.activeRoute('flush-failed')?.context_version, 1, 'failed batch can retry')
    failurePersistence.close()
    const report = { protocol: { chats: inputs.length, samples: sampleCount, warmups: 1, alternatingOrder: true, workload: 'Actual foreground controller, new synthetic file DBs, atomic fsync writes; initialization only. Live voice mutations unchanged.' }, samples, correctness: { routeParity: true, durableReopen: true, rollback: true, duplicatesAndExisting: true, newDuplicates: true, flushFailureAndRetry: true }, memory: process.memoryUsage() }
    const outputIndex = process.argv.indexOf('--output')
    if (outputIndex >= 0) await writeFile(resolve(process.argv[outputIndex + 1]!), JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report, null, 2))
} finally {
    if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith('zyra-perf-voice-routes-')) throw Error('Unexpected cleanup path')
    await rm(directory, { recursive: true, force: true })
}
