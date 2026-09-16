package dev.zyra.mobile.dictation

import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import org.json.JSONObject

interface DictationRecorder {
    suspend fun record(level: (Int, Float) -> Unit): ByteArray
    fun stop()
}
data class DictationState(val phase: String = "idle", val durationMs: Int = 0, val levels: List<Float> = emptyList(), val progress: Float = 0f, val error: String? = null, val retry: Boolean = false, val insert: Boolean = false) {
    val active get() = phase != "idle"
}

class DictationController(private val scope: CoroutineScope, private val recorderFactory: () -> DictationRecorder) {
    private val mutable = MutableStateFlow(DictationState())
    val state = mutable.asStateFlow()
    @Volatile private var revision = 0
    private var job: Job? = null
    private var retiring: Job? = null
    private var recorder: DictationRecorder? = null
    private var audio: ByteArray? = null
    private var transcript = ""
    private var request: DictationRequest? = null
    private var insert: ((String) -> Boolean)? = null
    private var owner: Pair<String, String>? = null
    fun start(request: DictationRequest, owner: Pair<String, String>? = null, insert: (String) -> Boolean) {
        if (state.value.active) return
        this.request = request; this.insert = insert; this.owner = owner
        val epoch = ++revision
        mutable.value = DictationState(phase = "checking")
        job = scope.launch {
            try {
                retiring?.join(); retiring = null
                val status = request("dictation.status", JSONObject())
                ensureActive(); if (epoch != revision) return@launch
                check(status.optBoolean("available") && status.optBoolean("signedIn")) { (status.opt("message") as? String).orEmpty().ifBlank { "Connect transcription on this computer first." } }
                val source = recorderFactory(); recorder = source
                mutable.value = DictationState(phase = "recording")
                val captured = source.record { duration, level -> if (epoch == revision) mutable.update { it.copy(durationMs = duration, levels = (it.levels + level.coerceIn(0f, 1f)).takeLast(20)) } }
                if (epoch != revision || !isActive) { captured.fill(0); return@launch }
                recorder = null
                if (captured.size !in 12044..5760044) { captured.fill(0); error("Record at least a moment of speech, up to two minutes.") }
                audio = captured
                transcribe(epoch)
            } catch (e: Exception) { fail(epoch, e) }
            finally { if (epoch == revision) { recorder = null; job = null } }
        }
    }
    fun rebind(owner: Pair<String, String>, request: DictationRequest) {
        if (!state.value.active) return
        if (this.owner != owner) { cancel(); return }
        // A running transfer retains its original callback. Only a later explicit retry uses this connection.
        this.request = request
    }
    fun finish() { if (state.value.phase == "recording") recorder?.stop() }
    fun retry() {
        if (job?.isActive == true || !state.value.retry) return
        val epoch = revision
        job = scope.launch { try { transcribe(epoch) } catch (e: Exception) { fail(epoch, e) } finally { if (epoch == revision) job = null } }
    }
    private suspend fun transcribe(epoch: Int) {
        if (transcript.isBlank()) {
            val bytes = audio ?: return
            mutable.update { it.copy(phase = "uploading", progress = 0f, error = null, retry = false) }
            transcript = uploadDictation(bytes, request!!) { progress -> if (epoch == revision) mutable.update { it.copy(progress = progress, phase = if (progress >= 1f) "transcribing" else "uploading") } }
            audio?.fill(0); audio = null
        }
        currentCoroutineContext().ensureActive()
        if (epoch != revision) return
        check(insert?.invoke(transcript) == true) { "The draft is full. Shorten it, then insert your transcript." }
        transcript = ""; request = null; insert = null
        mutable.value = DictationState()
    }
    private fun fail(epoch: Int, error: Exception) {
        if (epoch != revision || error is CancellationException) return
        mutable.update { it.copy(phase = "error", error = error.message ?: "Dictation could not finish.", retry = audio != null || transcript.isNotBlank(), insert = transcript.isNotBlank()) }
    }
    fun denied() { if (!state.value.active) mutable.value = DictationState(phase = "error", error = "Allow microphone access to dictate a message.") }
    fun cancel() {
        revision++; recorder?.stop(); recorder = null; job?.let { it.cancel(); retiring = it }; job = null
        audio?.fill(0); audio = null; transcript = ""; request = null; insert = null
        mutable.value = DictationState()
    }
}

fun appendDictatedText(draft: String, transcript: String): String? {
    val text = transcript.trim()
    if (text.isBlank()) return draft
    val result = if (draft.isEmpty()) text else draft + (if (draft.last().isWhitespace()) "" else " ") + text
    return result.takeIf { it.length <= 60000 }
}
