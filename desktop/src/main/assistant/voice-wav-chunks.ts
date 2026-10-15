import {
    VOICE_RECORDING_SAMPLE_RATE_HZ,
    VOICE_TRANSCRIPTION_CHUNK_DURATION_MS,
} from '../../shared/assistant/voice-recording-limits'

/** Input has already passed decodeCodexVoiceInput's full RIFF/PCM validation. */
export function* splitVoiceWav(audio: Buffer): Generator<Buffer> {
    const parts: Buffer[] = []
    for (let offset = 12; offset + 8 <= audio.length; ) {
        const size = audio.readUInt32LE(offset + 4)
        if (offset + 8 + size > audio.length) throw new Error('Invalid WAV chunk.')
        if (audio.toString('ascii', offset, offset + 4) === 'data')
            parts.push(audio.subarray(offset + 8, offset + 8 + size))
        offset += 8 + size + (size % 2)
    }
    const pcm = parts.length === 1 ? parts[0] : Buffer.concat(parts)
    const maxBytes = (VOICE_RECORDING_SAMPLE_RATE_HZ * 2 * VOICE_TRANSCRIPTION_CHUNK_DURATION_MS) / 1000
    if (pcm.length <= maxBytes) {
        yield audio
        return
    }
    for (let start = 0; start < pcm.length; ) {
        let end = Math.min(start + maxBytes, pcm.length)
        if (end < pcm.length) {
            // Prefer a quiet 200ms stretch within the last two seconds. Every
            // sample is sent exactly once, including when no pause is found.
            const windowBytes = (VOICE_RECORDING_SAMPLE_RATE_HZ * 2) / 5
            const earliest = Math.max(start, end - VOICE_RECORDING_SAMPLE_RATE_HZ * 4)
            for (let candidate = end - windowBytes; candidate >= earliest; candidate -= 960) {
                let quiet = true
                for (let i = candidate; i < candidate + windowBytes; i += 2) {
                    if (Math.abs(pcm.readInt16LE(i)) > 160) {
                        quiet = false
                        break
                    }
                }
                if (quiet) {
                    end = candidate + windowBytes / 2
                    break
                }
            }
        }
        const size = end - start
        const wav = Buffer.alloc(44 + size)
        wav.write('RIFF', 0)
        wav.writeUInt32LE(wav.length - 8, 4)
        wav.write('WAVEfmt ', 8)
        wav.writeUInt32LE(16, 16)
        wav.writeUInt16LE(1, 20)
        wav.writeUInt16LE(1, 22)
        wav.writeUInt32LE(VOICE_RECORDING_SAMPLE_RATE_HZ, 24)
        wav.writeUInt32LE(VOICE_RECORDING_SAMPLE_RATE_HZ * 2, 28)
        wav.writeUInt16LE(2, 32)
        wav.writeUInt16LE(16, 34)
        wav.write('data', 36)
        wav.writeUInt32LE(size, 40)
        pcm.copy(wav, 44, start, end)
        yield wav
        start = end
    }
}
