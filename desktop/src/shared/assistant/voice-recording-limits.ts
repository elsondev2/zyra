export const VOICE_RECORDING_SAMPLE_RATE_HZ = 24_000
// Eight minutes of mono PCM fits the existing 32 MiB JSON browser bridge even
// after base64 encoding. Recording length is independent of upload length.
export const VOICE_RECORDING_MAX_DURATION_MS = 8 * 60_000
export const VOICE_TRANSCRIPTION_CHUNK_DURATION_MS = 120_000
export const VOICE_RECORDING_MAX_AUDIO_BYTES =
    (VOICE_RECORDING_SAMPLE_RATE_HZ * 2 * VOICE_RECORDING_MAX_DURATION_MS) / 1000 + 64 * 1024
