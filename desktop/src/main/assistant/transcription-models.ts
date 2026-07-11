import { app } from 'electron'
import { createWriteStream } from 'node:fs'
import { mkdir, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { AssistantTranscriptionModelState } from '../../shared/assistant/contracts'

const execFileAsync = promisify(execFile)

const MODEL_ID = 'vosk-model-small-en-us-0.15'
const MODEL_NAME = 'Vosk Small English (US)'
const MODEL_DOWNLOAD_URL = 'https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip'

const createMissingState = (): AssistantTranscriptionModelState => ({
    provider: 'vosk',
    modelId: MODEL_ID,
    modelName: MODEL_NAME,
    status: 'missing',
    installPath: null,
    downloadUrl: MODEL_DOWNLOAD_URL,
    error: null
})

class AssistantTranscriptionModelManager {
    private inFlightDownload: Promise<AssistantTranscriptionModelState> | null = null
    private inFlightPythonSetup: Promise<void> | null = null
    private state: AssistantTranscriptionModelState = createMissingState()

    private getRootDirectory() {
        return join(app.getPath('userData'), 'assistant', 'transcription')
    }

    private getDownloadsDirectory() {
        return join(this.getRootDirectory(), 'downloads')
    }

    private getModelsDirectory() {
        return join(this.getRootDirectory(), 'models')
    }

    private getArchivePath() {
        return join(this.getDownloadsDirectory(), `${MODEL_ID}.zip`)
    }

    private getInstallPath() {
        return join(this.getModelsDirectory(), MODEL_ID)
    }

    private getRuntimeDirectory() {
        return join(this.getRootDirectory(), 'runtime')
    }

    private getRunnerPath() {
        return join(this.getRuntimeDirectory(), 'vosk_transcribe.py')
    }

    private async detectInstalledState(): Promise<AssistantTranscriptionModelState> {
        const installPath = this.getInstallPath()
        try {
            const installStats = await stat(installPath)
            if (!installStats.isDirectory()) throw new Error('Installed model path is not a directory.')
            return {
                provider: 'vosk',
                modelId: MODEL_ID,
                modelName: MODEL_NAME,
                status: 'ready',
                installPath,
                downloadUrl: MODEL_DOWNLOAD_URL,
                error: null
            }
        } catch {
            return createMissingState()
        }
    }

    async getState(): Promise<AssistantTranscriptionModelState> {
        if (this.state.status === 'downloading') return this.state
        this.state = await this.detectInstalledState()
        return this.state
    }

    async downloadModel(): Promise<AssistantTranscriptionModelState> {
        if (this.inFlightDownload) return this.inFlightDownload

        this.inFlightDownload = this.performDownload().finally(() => {
            this.inFlightDownload = null
        })

        return this.inFlightDownload
    }

    private async performDownload(): Promise<AssistantTranscriptionModelState> {
        const archivePath = this.getArchivePath()
        const installPath = this.getInstallPath()

        this.state = {
            provider: 'vosk',
            modelId: MODEL_ID,
            modelName: MODEL_NAME,
            status: 'downloading',
            installPath: null,
            downloadUrl: MODEL_DOWNLOAD_URL,
            error: null
        }

        try {
            await mkdir(this.getDownloadsDirectory(), { recursive: true })
            await mkdir(this.getModelsDirectory(), { recursive: true })
            await rm(installPath, { recursive: true, force: true })
            await unlink(archivePath).catch(() => undefined)

            const response = await fetch(MODEL_DOWNLOAD_URL)
            if (!response.ok || !response.body) {
                throw new Error(`Model download failed (${response.status}).`)
            }

            await pipeline(Readable.fromWeb(response.body as any), createWriteStream(archivePath))
            await execFileAsync('powershell.exe', [
                '-NoProfile',
                '-Command',
                `Expand-Archive -LiteralPath '${archivePath.replace(/'/g, "''")}' -DestinationPath '${this.getModelsDirectory().replace(/'/g, "''")}' -Force`
            ])
            await unlink(archivePath).catch(() => undefined)

            this.state = await this.detectInstalledState()
            return this.state
        } catch (error) {
            this.state = {
                provider: 'vosk',
                modelId: MODEL_ID,
                modelName: MODEL_NAME,
                status: 'error',
                installPath: null,
                downloadUrl: MODEL_DOWNLOAD_URL,
                error: error instanceof Error ? error.message : 'Failed to download transcription model.'
            }
            return this.state
        }
    }

    private async ensurePythonPackage() {
        if (this.inFlightPythonSetup) return this.inFlightPythonSetup
        this.inFlightPythonSetup = (async () => {
            try {
                await execFileAsync('python', ['-c', 'import vosk'])
                return
            } catch {}

            await execFileAsync('python', ['-m', 'pip', 'install', '--user', 'vosk'])
        })().finally(() => {
            this.inFlightPythonSetup = null
        })

        return this.inFlightPythonSetup
    }

    private async ensureRunnerScript() {
        await mkdir(this.getRuntimeDirectory(), { recursive: true })
        const runnerPath = this.getRunnerPath()
        const script = `
import json
import sys
import wave

from vosk import KaldiRecognizer, Model, SetLogLevel

SetLogLevel(-1)

def fail(message: str):
    print(json.dumps({"success": False, "error": message}))
    raise SystemExit(0)

if len(sys.argv) < 3:
    fail("Missing transcription arguments.")

model_path = sys.argv[1]
audio_path = sys.argv[2]

try:
    wf = wave.open(audio_path, "rb")
except Exception as exc:
    fail(f"Failed to open audio: {exc}")

if wf.getnchannels() != 1 or wf.getsampwidth() != 2:
    fail("Audio must be mono PCM16 WAV.")

try:
    model = Model(model_path)
    rec = KaldiRecognizer(model, wf.getframerate())
except Exception as exc:
    fail(f"Failed to initialize Vosk: {exc}")

parts = []
while True:
    data = wf.readframes(4000)
    if len(data) == 0:
        break
    if rec.AcceptWaveform(data):
        try:
            value = json.loads(rec.Result()).get("text", "").strip()
            if value:
                parts.append(value)
        except Exception:
            pass

try:
    final_value = json.loads(rec.FinalResult()).get("text", "").strip()
    if final_value:
        parts.append(final_value)
except Exception:
    pass

print(json.dumps({"success": True, "text": " ".join(part for part in parts if part).strip()}))
`.trim()
        await writeFile(runnerPath, script, 'utf8')
        return runnerPath
    }

    async transcribeWav(audioBuffer: ArrayBuffer): Promise<string> {
        const state = await this.getState()
        if (state.status !== 'ready' || !state.installPath) {
            throw new Error('Local Vosk model is not installed yet.')
        }

        await this.ensurePythonPackage()
        const runnerPath = await this.ensureRunnerScript()
        const audioPath = join(this.getRuntimeDirectory(), `input-${Date.now()}.wav`)

        try {
            await writeFile(audioPath, Buffer.from(audioBuffer))
            const { stdout } = await execFileAsync('python', [runnerPath, state.installPath, audioPath], {
                maxBuffer: 1024 * 1024 * 8
            })
            const parsed = JSON.parse(String(stdout || '{}')) as { success?: boolean; text?: string; error?: string }
            if (!parsed.success) {
                throw new Error(parsed.error || 'Local transcription failed.')
            }
            return String(parsed.text || '').trim()
        } finally {
            await unlink(audioPath).catch(() => undefined)
        }
    }
}

let transcriptionModelManager: AssistantTranscriptionModelManager | null = null

export function getAssistantTranscriptionModelManager() {
    if (!transcriptionModelManager) {
        transcriptionModelManager = new AssistantTranscriptionModelManager()
    }
    return transcriptionModelManager
}
