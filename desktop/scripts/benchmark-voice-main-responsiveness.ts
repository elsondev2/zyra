import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { monitorEventLoopDelay } from 'node:perf_hooks'
import {
    CODEX_VOICE_SAMPLE_RATE_HZ,
    decodeCodexVoiceInput
} from '../src/main/assistant/codex-voice-transcription'
import { OpenAIAuthWorkerClient } from '../src/main/setup/openai-auth-worker-client'

const fixture = await mkdtemp(path.join(os.tmpdir(), 'zyra-voice-responsiveness-'))
const previousAgentDir = process.env.PI_CODING_AGENT_DIR
process.env.PI_CODING_AGENT_DIR = fixture

function createMaximumDurationWav(): Buffer {
    const dataBytes = CODEX_VOICE_SAMPLE_RATE_HZ * 2 * 120
    const wav = Buffer.alloc(44 + dataBytes)
    wav.write('RIFF', 0)
    wav.writeUInt32LE(wav.length - 8, 4)
    wav.write('WAVE', 8)
    wav.write('fmt ', 12)
    wav.writeUInt32LE(16, 16)
    wav.writeUInt16LE(1, 20)
    wav.writeUInt16LE(1, 22)
    wav.writeUInt32LE(CODEX_VOICE_SAMPLE_RATE_HZ, 24)
    wav.writeUInt32LE(CODEX_VOICE_SAMPLE_RATE_HZ * 2, 28)
    wav.writeUInt16LE(2, 32)
    wav.writeUInt16LE(16, 34)
    wav.write('data', 36)
    wav.writeUInt32LE(dataBytes, 40)
    return wav
}

const worker = new OpenAIAuthWorkerClient()
try {
    const eventLoop = monitorEventLoopDelay({ resolution: 5 })
    eventLoop.enable()
    const workerStartedAt = performance.now()
    await worker.warm()
    const workerElapsedMs = performance.now() - workerStartedAt
    await new Promise((resolve) => setTimeout(resolve, 20))
    eventLoop.disable()

    const wav = createMaximumDurationWav()
    const encoded = wav.toString('base64')
    const decodeDurations: number[] = []
    for (let index = 0; index < 8; index += 1) {
        const startedAt = performance.now()
        decodeCodexVoiceInput({
            audioBase64: encoded,
            mimeType: 'audio/wav',
            sampleRateHz: CODEX_VOICE_SAMPLE_RATE_HZ,
            durationMs: 120_000
        })
        decodeDurations.push(performance.now() - startedAt)
    }
    decodeDurations.sort((left, right) => left - right)

    const maxMainEventLoopDelayMs = eventLoop.max / 1_000_000
    assert.ok(maxMainEventLoopDelayMs < 250, `worker auth load blocked main for ${maxMainEventLoopDelayMs.toFixed(1)} ms`)

    console.log(JSON.stringify({
        workerAuthLoadMs: Number(workerElapsedMs.toFixed(2)),
        workerAuthMaxMainEventLoopDelayMs: Number(maxMainEventLoopDelayMs.toFixed(2)),
        maximumWavBytes: wav.length,
        decodeMedianMs: Number(decodeDurations[Math.floor(decodeDurations.length / 2)].toFixed(2)),
        decodeMaxMs: Number(decodeDurations.at(-1)!.toFixed(2))
    }))
} finally {
    await worker.dispose()
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir
    await rm(fixture, { recursive: true, force: true })
}
