package dev.zyra.mobile

import dev.zyra.mobile.voice.*
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class VoiceControllerTest {
    @Test fun `real audio drives only the owning call and mute preserves playback activity`() = runTest {
        var clock = 0L; lateinit var peer: Peer
        val controller = VoiceController(this, now = { clock }) { Peer(it).also { p -> peer = p } }
        fun loud() = byteArrayOf(0, 64)
        controller.start("chat") { method, _ -> if (method == "voice.start") answer() else JSONObject() }; runCurrent()
        peer.listener.samples(loud(), 2, 24000, 1); assertEquals(1f, controller.activity.level())
        controller.mute(); peer.listener.samples(loud(), 2, 24000, 1); assertEquals(0f, controller.activity.level())
        peer.listener.playbackSamples(loud(), 2, 24000, 1); assertEquals(1f, controller.activity.level())
        clock = 251; assertEquals(0f, controller.activity.level())
        val old = peer
        controller.stop(); assertEquals(0f, controller.activity.level()); advanceUntilIdle()
        controller.start("next") { method, _ -> if (method == "voice.start") answer() else JSONObject() }; runCurrent()
        old.listener.playbackSamples(loud(), 2, 24000, 1); old.listener.samples(loud(), 2, 24000, 1)
        assertEquals(0f, controller.activity.level())
        peer.listener.playbackSamples(loud(), 2, 24000, 1); assertEquals(1f, controller.activity.level())
        controller.stop(); assertEquals(0f, controller.activity.level()); advanceUntilIdle()
    }
    @Test fun `microphone waits for foreground service and cancellation cannot open it later`() = runTest {
        val ready = CompletableDeferred<Unit>(); var created = 0; var requests = 0
        val controller = VoiceController(this, prepare = { ready.await() }) { created++; Peer(it) }
        controller.start("chat") { _, _ -> requests++; answer() }
        runCurrent(); assertEquals("connecting", controller.state.value.phase); assertEquals(0, created)
        controller.stop(); advanceUntilIdle(); ready.complete(Unit); runCurrent()
        assertEquals(0, created); assertEquals(0, requests); assertFalse(controller.state.value.inCall)
    }
    @Test fun `foreground service failure leaves no peer or PC lease`() = runTest {
        var created = 0; var requests = 0
        val controller = VoiceController(this, prepare = { error("Microphone service unavailable") }) { created++; Peer(it) }
        controller.start("chat") { _, _ -> requests++; answer() }
        advanceUntilIdle()
        assertEquals(0, created); assertEquals(0, requests)
        assertEquals("Microphone service unavailable", controller.state.value.error)
    }
    @Test fun `outputs follow confirmed platform route and ignore callbacks from the previous call`() = runTest {
        lateinit var peer: Peer
        val controller = VoiceController(this) { Peer(it).also { value -> peer = value } }
        controller.start("chat") { method, _ -> if (method == "voice.start") answer() else JSONObject() }
        runCurrent()
        val old = peer
        val outputs = VoiceAudioOutputs(listOf(VoiceAudioOutput(4, "Headphones"), VoiceAudioOutput(5, "Speaker", dev.zyra.mobile.voice.VoiceOutputKind.Speaker)), 4)
        peer.listener.outputs(outputs); runCurrent(); assertEquals(outputs, controller.state.value.outputs)
        controller.output(999); assertNotNull(controller.state.value.error); assertEquals(4, controller.state.value.outputs.selected)
        controller.stop(); advanceUntilIdle()
        controller.start("next") { method, _ -> if (method == "voice.start") answer() else JSONObject() }; runCurrent()
        old.listener.outputs(outputs); runCurrent(); assertTrue(controller.state.value.outputs.available.isEmpty())
        controller.stop(); advanceUntilIdle()
    }
    private class Peer(val listener: VoicePeerListener, val autoReady: Boolean = true) : VoicePeer {
        var closed = false; var muted = false
        override suspend fun offer() = "v=0 offer"
        override suspend fun answer(sdp: String) { if (autoReady) { listener.connected(true); listener.channel(true); listener.outputReady(); listener.message("{\"type\":\"session.updated\"}") } }
        override fun send(message: String) = !closed
        override fun mute(muted: Boolean) { this.muted = muted }
        override fun speaker(enabled: Boolean) = true
        override fun close() { closed = true }
    }
    private fun answer() = JSONObject().put("adapterSessionId", "adapter").put("realtimeSessionId", "realtime").put("realtimeSessionGeneration", 1).put("sdp", "answer").put("realtimeVersion", "v3")

    @Test fun `selected voice is sent with signaling and unknown saved values fall back to Desktop default`() = runTest {
        var selected = ""
        val controller = VoiceController(this) { Peer(it) }
        for ((input, expected) in listOf("juniper" to "juniper", "obsolete" to "cove")) {
            controller.start("chat", voice = input) { method, params -> if (method == "voice.start") { selected = params.getString("voice"); answer() } else JSONObject() }
            runCurrent(); assertEquals(expected, selected)
            controller.stop(); advanceUntilIdle()
        }
    }

    @Test fun `captured speech recovers through signaling then enters the canonical transcript queue once`() = runBlocking {
        // The app owns its protocol queue on Main. Unconfined resumes recovery
        // on a worker and violates that ownership after PCM encoding suspends.
        val scope = CoroutineScope(coroutineContext + SupervisorJob())
        var clock = 0L; lateinit var peer: Peer
        val ingested = CompletableDeferred<JSONObject>(); var recoveryCompletions = 0
        val controller = VoiceController(scope, now = { clock }) { Peer(it).also { value -> peer = value } }
        try {
            controller.start("chat") { method, params -> when (method) {
                "voice.start" -> answer().put("recoveryAvailable", true)
                "voice.recovery.chunk" -> JSONObject().put("offset", params.getInt("offset") + java.util.Base64.getDecoder().decode(params.getString("data")).size)
                "voice.recovery.finish" -> JSONObject().put("providerItemId", "spoken").put("text", "Recovered words")
                "voice.ingest" -> {
                    val events = params.getJSONArray("events")
                    for (index in 0 until events.length()) if (events.getJSONObject(index).optString("type").endsWith("input_audio_transcription.completed")) { recoveryCompletions++; ingested.complete(events.getJSONObject(index)) }
                    JSONObject()
                }
                else -> JSONObject()
            } }
            yield() // Complete signaling before simulating the media callbacks.
            peer.listener.message("{\"type\":\"input_audio_buffer.speech_started\",\"item_id\":\"spoken\"}")
            yield()
            repeat(40) { peer.listener.samples(ByteArray(480), 2, 24000, 1) }
            peer.listener.message("{\"type\":\"input_audio_buffer.speech_stopped\",\"item_id\":\"spoken\"}")
            yield()
            clock = 2000
            assertEquals("Recovered words", withTimeout(3000) { ingested.await() }.getString("transcript"))
            peer.listener.message("{\"type\":\"conversation.item.input_audio_transcription.completed\",\"item_id\":\"spoken\",\"transcript\":\"Late original\"}")
            delay(200); assertEquals(1, recoveryCompletions)
        } finally { controller.stop(); controller.awaitStopped(); scope.cancel() }
    }

    @Test fun `stop ends capture immediately but drains transcript before releasing PC`() = runTest {
        lateinit var peer: Peer
        val calls = mutableListOf<String>()
        val ingested = CompletableDeferred<Unit>()
        val controller = VoiceController(this) { Peer(it).also { p -> peer = p } }
        controller.start("chat") { method, _ -> calls.add(method); when (method) { "voice.start" -> answer(); "voice.ingest" -> { ingested.await(); JSONObject() }; else -> JSONObject() } }
        runCurrent(); assertEquals("active", controller.state.value.phase)
        peer.listener.message("{\"type\":\"turn.done\"}"); runCurrent(); advanceTimeBy(101); runCurrent()
        controller.stop(); assertTrue(peer.closed); runCurrent()
        assertFalse("voice.stop" in calls)
        ingested.complete(Unit); advanceUntilIdle()
        assertEquals(listOf("voice.start", "voice.ingest", "voice.stop"), calls)
        assertEquals("idle", controller.state.value.phase)
    }
    @Test fun `cancelled startup cannot reactivate microphone or mutate next call`() = runTest {
        val peers = mutableListOf<Peer>(); val start = CompletableDeferred<JSONObject>(); val calls = mutableListOf<String>()
        val controller = VoiceController(this) { Peer(it).also(peers::add) }
        controller.start("a") { method, _ -> calls.add(method); if (method == "voice.start") start.await() else JSONObject() }
        runCurrent(); controller.stop(); runCurrent(); assertTrue(peers[0].closed)
        start.complete(answer()); advanceUntilIdle(); assertEquals("idle", controller.state.value.phase)
        controller.start("b") { method, _ -> if (method == "voice.start") answer() else JSONObject() }; runCurrent()
        peers[0].listener.failed("late"); runCurrent(); assertEquals("active", controller.state.value.phase)
        controller.stop(); advanceUntilIdle(); assertTrue(peers[1].closed)
    }
    @Test fun `readiness requires output and initialization and disconnect stops after grace`() = runTest {
        lateinit var peer: Peer
        val controller = VoiceController(this) { Peer(it, autoReady = false).also { p -> peer = p } }
        controller.start("a") { method, _ -> if (method == "voice.start") answer() else JSONObject() }; runCurrent()
        peer.listener.connected(true); peer.listener.channel(true); runCurrent(); assertEquals("connecting", controller.state.value.phase)
        peer.listener.message("{\"type\":\"session.updated\"}"); runCurrent(); assertEquals("connecting", controller.state.value.phase)
        peer.listener.outputReady(); runCurrent(); assertEquals("active", controller.state.value.phase)
        controller.mute(); assertTrue(peer.muted)
        peer.listener.connected(false); runCurrent(); assertEquals("reconnecting", controller.state.value.phase)
        advanceTimeBy(2000); peer.listener.connected(true); runCurrent(); assertEquals("active", controller.state.value.phase)
        peer.listener.connected(false); runCurrent(); advanceTimeBy(5001); advanceUntilIdle()
        assertTrue(peer.closed); assertTrue(controller.state.value.error!!.contains("interrupted"))
    }
    @Test fun `typing during voice uses bound adapter and stable message identity`() = runTest {
        var sent: JSONObject? = null
        val controller = VoiceController(this) { Peer(it) }
        controller.start("a") { method, params -> if (method == "voice.start") answer() else { if (method == "voice.message") sent = params; JSONObject() } }; runCurrent()
        assertTrue(controller.send("hello")); assertEquals("adapter", sent!!.getString("adapterSessionId")); assertTrue(sent!!.getString("clientMessageId").startsWith("voice-typed-"))
        controller.stop(); advanceUntilIdle()
    }
    @Test fun `PC termination reaches only the current call`() = runTest {
        lateinit var peer: Peer
        val controller = VoiceController(this) { Peer(it).also { p -> peer = p } }
        controller.start("a") { method, _ -> if (method == "voice.start") answer() else JSONObject() }; runCurrent()
        val event = answer().put("type", "session.closed")
        controller.event(JSONObject().put("session", "b").put("event", event)); assertFalse(peer.closed)
        controller.event(JSONObject().put("session", "a").put("event", event.put("realtimeSessionGeneration", 2))); assertFalse(peer.closed)
        controller.event(JSONObject().put("session", "a").put("event", event.put("realtimeSessionGeneration", 1))); assertTrue(peer.closed)
        advanceUntilIdle(); assertEquals("idle", controller.state.value.phase)
    }
    @Test fun `presentation accepts only the current adapter and reconciles only its machine and chat`() = runTest {
        val controller = VoiceController(this) { Peer(it) }
        controller.start("a", "pc:a") { method, _ -> if (method == "voice.start") answer() else JSONObject() }; runCurrent()
        val event = answer().put("type", "transcript.done").put("providerItemId", "spoken").put("role", "user").put("text", "Hello")
        controller.event(JSONObject().put("session", "a").put("event", event.put("adapterSessionId", "old")))
        assertTrue(controller.state.value.entries.isEmpty())
        controller.event(JSONObject().put("session", "a").put("event", event.put("adapterSessionId", "adapter")))
        assertEquals("Hello", controller.state.value.entries.single().text)
        val canonical = listOf(dev.zyra.mobile.data.TimelineItem("message:saved", "user", "Hello", raw = "{\"message\":{\"zyraCanonicalMessage\":{\"providerItemId\":\"spoken\"}}}"))
        controller.reconcile("other-pc:a", canonical); assertEquals(1, controller.state.value.entries.size)
        controller.reconcile("pc:a", canonical); assertTrue(controller.state.value.entries.isEmpty())
        controller.stop(); advanceUntilIdle()
    }
    @Test fun `RPC timeouts report uncertain sends and stop stalled transcript transport`() = runTest {
        lateinit var peer: Peer
        val controller = VoiceController(this) { Peer(it).also { p -> peer = p } }
        controller.start("a") { method, _ -> when (method) {
            "voice.start" -> answer()
            "voice.message", "voice.ingest" -> withTimeout(50) { delay(100); JSONObject() }
            else -> JSONObject()
        } }; runCurrent()
        val sent = async { controller.send("hello") }; advanceTimeBy(51); runCurrent()
        assertFalse(sent.await()); assertEquals("uncertain", controller.state.value.entries.single().delivery)
        assertTrue(controller.state.value.error!!.contains("not confirmed"))
        peer.listener.message("{\"type\":\"turn.done\"}"); runCurrent(); advanceTimeBy(151); advanceUntilIdle()
        assertTrue(peer.closed); assertEquals("idle", controller.state.value.phase)
        assertTrue(controller.state.value.error!!.contains("sync"))
    }
}
