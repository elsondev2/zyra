package dev.zyra.mobile.voice

import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import org.json.JSONObject
import java.util.UUID
import dev.zyra.mobile.data.TimelineItem

data class VoiceState(val phase: String = "idle", val muted: Boolean = false, val speaker: Boolean = true,
    val error: String? = null, val sending: Boolean = false, val ownerKey: String = "", val entries: List<VoiceTranscript> = emptyList(), val outputs: VoiceAudioOutputs = VoiceAudioOutputs(), val voice: String = "cove") {
    val inCall get() = phase in setOf("connecting", "active", "reconnecting", "stopping")
}

/** One chat owns microphone, peer and gateway lease together, independently of its Activity. */
class VoiceController(private val scope: CoroutineScope, private val now: () -> Long = { System.nanoTime() / 1000000 }, private val prepare: suspend () -> Unit = {}, private val createPeer: (VoicePeerListener) -> VoicePeer) {
    private val mutable = MutableStateFlow(VoiceState())
    val state = mutable.asStateFlow()
    val activity = VoiceActivity(now)
    private var activityCapture: VoiceActivity.Capture? = null
    private var generation = 0
    private var peer: VoicePeer? = null
    private var protocol = VoiceProtocol()
    private var presentation = VoicePresentation()
    private var call: (suspend (String, JSONObject) -> JSONObject)? = null
    private var startup: Job? = null
    private var transfer: Job? = null
    private var disconnect: Job? = null
    private var stopping: Job? = null
    private var recovery: VoiceInputRecovery? = null
    private var recovering: Job? = null
    private var peerReady = false
    private var channelReady = false
    private var sessionReady = false
    private var audioReady = false
    private var ownerSession = ""
    private var submitted = false
    private var syncFailure: String? = null

    fun start(session: String, ownerKey: String = session, voice: String = "cove", request: suspend (String, JSONObject) -> JSONObject) {
        if (mutable.value.inCall) return
        val epoch = ++generation
        ownerSession = session; call = request; protocol = VoiceProtocol()
        presentation = VoicePresentation()
        val input = VoiceInputRecovery(now); recovery = input
        val levels = activity.begin(); activityCapture = levels
        submitted = false; syncFailure = null
        peerReady = false; channelReady = false; sessionReady = false; audioReady = false
        mutable.value = VoiceState(phase = "connecting", ownerKey = ownerKey, voice = VoiceChoice.resolve(voice).id)
        val listener = object : VoicePeerListener {
            override fun outputs(value: VoiceAudioOutputs) = onCurrent { mutable.update { it.copy(outputs = value, speaker = value.available.find { output -> output.id == value.selected }?.speaker == true) } }
            override fun samples(data: ByteArray, format: Int, rate: Int, channels: Int) {
                input.samples(data, format, rate, channels)
                levels.samples(data, format, rate, channels)
            }
            override fun playbackSamples(data: ByteArray, format: Int, rate: Int, channels: Int) = levels.samples(data, format, rate, channels, playback = true)
            private fun onCurrent(action: () -> Unit) { scope.launch { if (generation == epoch) try { action() } catch (e: Exception) { stop(e.message ?: "Voice connection failed.") } } }
            override fun connected(connected: Boolean) = onCurrent {
                peerReady = connected
                if (connected) { disconnect?.cancel(); ready() }
                else if (mutable.value.phase == "active") {
                    mutable.update { it.copy(phase = "reconnecting") }
                    disconnect = scope.launch { delay(5000); if (generation == epoch && !peerReady) stop("The Voice connection was interrupted.") }
                }
            }
            override fun channel(open: Boolean) = onCurrent {
                channelReady = open
                if (open) { flush(); ready() } else stop("The Voice event channel closed.")
            }
            override fun outputReady() = onCurrent { audioReady = true; ready() }
            override fun failed(message: String) = onCurrent { stop(message) }
            override fun message(text: String) = onCurrent {
                require(text.toByteArray().size <= 128 * 1024) { "Voice returned an oversized event." }
                val event = runCatching { JSONObject(text) }.getOrNull() ?: return@onCurrent
                if (event.optString("type") == "error") throw IllegalStateException(event.optJSONObject("error")?.optString("message") ?: "Voice returned an error.")
                if (event.optString("type") in setOf("session.started", "session.updated")) { sessionReady = true; ready() }
                if (!input.provider(event)) return@onCurrent
                val boundary = event.optString("type")
                if (boundary in setOf("input_audio_buffer.speech_started", "input_audio_buffer.speech_stopped")) {
                    VoiceInputRecovery.providerId(event)?.let { presentation.speech(it, if (boundary.endsWith("started") && !mutable.value.muted) "listening" else "transcribing"); publish() }
                }
                protocol.provider(event); flush()
            }
        }
        startup = scope.launch {
            try {
                withTimeout(60000) {
                    prepare()
                    ensureActive()
                    val media = createPeer(listener); peer = media
                    val offer = media.offer()
                    media.mute(mutable.value.muted)
                    submitted = true
                    val result = request("voice.start", JSONObject().put("sdp", offer).put("voice", VoiceChoice.resolve(voice).id))
                    ensureActive()
                    if (generation != epoch) return@withTimeout
                    check(result.optString("realtimeVersion", "v3") == "v3") { "This PC uses an unsupported Voice version." }
                    protocol.binding = VoiceBinding.parse(result)
                    input.available(result.optBoolean("recoveryAvailable"))
                    media.answer(result.getString("sdp")); flush()
                    recovering = scope.launch {
                        try {
                            VoiceRecoveryRunner(input, protocol.binding!!.adapter, request,
                                { id, status -> if (epoch == generation) { presentation.speech(id, status); publish() } },
                                { event -> if (epoch == generation) { protocol.provider(event); flush() } }).run()
                        } catch (e: CancellationException) { throw e }
                        catch (e: Exception) { if (epoch == generation) stop(e.message ?: "Voice transcript recovery failed.") }
                    }
                    transfer = scope.launch {
                        try {
                            while (isActive && epoch == generation) {
                                delay(100)
                                if (protocol.hasEvents) sendBatch(request, protocol)
                            }
                        } catch (e: CancellationException) {
                            if (e is TimeoutCancellationException) { syncFailure = "Voice could not sync its transcript in time."; if (epoch == generation) stop(syncFailure) }
                            else throw e
                        }
                        catch (e: Exception) { syncFailure = e.message ?: "Voice could not sync its transcript."; if (epoch == generation) stop(syncFailure) }
                    }
                    while (mutable.value.phase != "active") delay(50)
                }
            } catch (e: CancellationException) { if (e is TimeoutCancellationException && epoch == generation) stop("Voice took too long to connect. Try again."); else throw e }
            catch (e: Exception) { if (epoch == generation) stop(e.message ?: "Could not start Voice.") }
        }
    }

    private suspend fun sendBatch(request: suspend (String, JSONObject) -> JSONObject, queue: VoiceProtocol) {
        val binding = queue.binding ?: return
        val batch = queue.nextBatch()
        if (batch.length() > 0) request("voice.ingest", JSONObject().put("adapterSessionId", binding.adapter).put("events", batch))
    }
    private fun ready() { if (peerReady && channelReady && sessionReady && audioReady && protocol.binding != null) mutable.update { it.copy(phase = "active") } }
    private fun flush() { if (channelReady) protocol.flush { peer?.send(it) == true }; ready() }
    private fun publish() { val entries = presentation.entries; mutable.update { it.copy(entries = entries) } }
    fun reconcile(ownerKey: String, canonical: List<TimelineItem>) {
        if (mutable.value.ownerKey != ownerKey) return
        presentation.reconcile(canonical); publish()
    }
    fun event(envelope: JSONObject) {
        if (!mutable.value.inCall || envelope.optString("session") != ownerSession) return
        val event = envelope.optJSONObject("event") ?: return
        try {
            if (event.optString("type") == "client.command") { protocol.command(event); flush() }
            if (protocol.binding?.matches(event) == true) { recovery?.fromPc(event); presentation.event(event); publish() }
            if (event.optString("type") == "session.closed" && protocol.binding?.matches(event) == true) stop()
            if (event.optString("type") == "session.error" && protocol.binding?.matches(event) == true) stop(event.optString("message", event.optString("error", "Voice ended on this PC.")))
        } catch (e: Exception) { stop(e.message ?: "Could not apply the PC's Voice instruction.") }
    }
    fun mute() { if (!mutable.value.inCall) return; val value = !mutable.value.muted; activityCapture?.mute(value); recovery?.pause(value); peer?.mute(value); mutable.update { it.copy(muted = value) } }
    fun speaker() {
        if (!mutable.value.inCall || peer == null) return
        val value = !mutable.value.speaker
        try {
            if (peer?.speaker(value) == true) mutable.update { it.copy(speaker = value, error = null) }
            else mutable.update { it.copy(error = "That audio output is unavailable on this device.") }
        } catch (e: Exception) { mutable.update { it.copy(error = "Could not change the audio output.") } }
    }
    fun denied() { mutable.update { it.copy(error = "Allow microphone access to talk with Zyra. You can keep typing here.") } }
    fun output(id: Int) {
        if (!mutable.value.inCall || peer == null) return
        try {
            if (peer?.output(id) != true) mutable.update { it.copy(error = "That audio output disconnected. Choose another output.") }
            else mutable.update { it.copy(error = null) }
        } catch (e: Exception) { mutable.update { it.copy(error = "Android could not change the audio output. Try again.") } }
    }
    fun dismissError() { mutable.update { it.copy(error = null) } }
    suspend fun send(text: String): Boolean {
        if (mutable.value.phase != "active" || mutable.value.sending || text.isBlank()) return false
        val request = call ?: return false
        val epoch = generation
        val messageId = "voice-typed-${UUID.randomUUID()}"
        mutable.update { it.copy(sending = true, error = null) }
        return try {
            require(text.length <= 8000) { "Write a shorter Voice message." }
            presentation.typed(messageId, text); publish()
            request("voice.message", JSONObject().put("adapterSessionId", protocol.binding!!.adapter).put("text", text).put("clientMessageId", messageId))
            if (epoch == generation) { presentation.delivery(messageId, "sent"); publish() }
            epoch == generation
        } catch (e: CancellationException) {
            if (e !is TimeoutCancellationException) throw e
            if (epoch == generation) { presentation.delivery(messageId, "uncertain"); publish(); mutable.update { it.copy(error = "Delivery was not confirmed. Check this chat before sending that message again.") } }
            false
        }
        catch (e: Exception) {
            if (epoch == generation) { presentation.delivery(messageId, "uncertain"); publish(); mutable.update { it.copy(error = e.message ?: "Could not confirm delivery of the Voice message.") } }
            false
        }
        finally { if (epoch == generation) mutable.update { it.copy(sending = false) } }
    }
    fun stop(error: String? = null) {
        if (!mutable.value.inCall || mutable.value.phase == "stopping") return
        ++generation; startup?.cancel(); disconnect?.cancel()
        activityCapture?.close(); activityCapture = null
        recovery?.close(); recovery = null
        val pendingRecovery = recovering; recovering = null; pendingRecovery?.cancel()
        // End capture immediately, before waiting for transcript/control requests.
        if (channelReady) runCatching { peer?.send("{\"type\":\"session.close\"}") }
        peer?.close(); peer = null; channelReady = false
        val request = call.takeIf { submitted }; call = null
        val queue = protocol; val pending = transfer; transfer = null
        mutable.update { it.copy(phase = "stopping", error = error) }
        stopping = scope.launch {
            var failure = error
            try {
                withTimeout(5000) {
                    pendingRecovery?.join()
                    pending?.join()
                    syncFailure?.let { throw IllegalStateException(it) }
                    if (request != null && error == null && queue.binding != null) while (queue.hasEvents) sendBatch(request, queue)
                }
            } catch (e: Exception) { failure = failure ?: "Voice ended before the last transcript could sync."; pending?.cancel() }
            finally {
                withContext(NonCancellable) { runCatching { withTimeout(10000) { request?.invoke("voice.stop", JSONObject()) } }.onFailure { failure = failure ?: "Voice stopped on this phone. Reconnect to confirm the PC has ended the call." } }
                presentation.interrupted()
                mutable.value = VoiceState(error = failure, ownerKey = mutable.value.ownerKey, entries = presentation.entries)
            }
        }
    }
    fun close() { stop(); peer?.close(); peer = null }
    suspend fun awaitStopped() { stopping?.join() }
}
