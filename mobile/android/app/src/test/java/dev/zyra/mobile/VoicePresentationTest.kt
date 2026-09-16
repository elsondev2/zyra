package dev.zyra.mobile

import dev.zyra.mobile.data.TimelineItem
import dev.zyra.mobile.voice.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class VoicePresentationTest {
    @Test fun `physical chunks become one logical turn and stay gone after canonical save`() {
        val view = VoicePresentation()
        fun chunk(id: String, words: String, role: String = "user") = view.event(event("transcript.delta", id, words, role).put("transcriptSource", "chunk"))
        fun turn(type: String, id: String, words: String, role: String = "user") = view.event(event(type, id, words, role).put("transcriptSource", "turn"))
        chunk("chunk-one", "Hello"); chunk("chunk-two", " there")
        assertEquals("Hello there", view.entries.single().text)
        turn("transcript.delta", "turn-one", "Hello there")
        chunk("mirror", " there")
        assertEquals("Hello there", view.entries.single().text)
        turn("transcript.done", "turn-one", "Hello there.")
        view.reconcile(listOf(saved("saved-one", "turn-one", "Hello there.")))
        chunk("late", " there")
        assertTrue(view.entries.isEmpty())
        turn("transcript.done", "turn-two", "Hello there.")
        assertEquals("turn-two", view.entries.single().providerId)
        chunk("assistant-chunk", "Ready", "assistant")
        turn("transcript.done", "assistant-turn", "Ready.", "assistant")
        assertEquals(2, view.entries.size)
        view.reconcile(listOf(saved("saved-two", "turn-two", "Hello there."), saved("saved-answer", "assistant-turn", "Ready.", "assistant")))
        assertTrue(view.entries.isEmpty())
    }
    private fun event(type: String, id: String, text: String, role: String = "user") = JSONObject().put("type", type).put("providerItemId", id).put("role", role).put(if (type.endsWith("delta")) "delta" else "text", text)
    private fun saved(canonical: String, provider: String, text: String, role: String = "user") = TimelineItem("message:$canonical", role, text,
        raw = JSONObject().put("message", JSONObject().put("zyraCanonicalMessage", JSONObject().put("canonicalMessageId", canonical).put("providerItemId", provider))).toString())

    @Test fun `live words update in place until the matching canonical identity arrives`() {
        val view = VoicePresentation()
        view.event(event("transcript.delta", "one", " Hello")); view.event(event("transcript.delta", "one", "Hello there"))
        assertEquals("Hello there", view.entries.single().text)
        view.event(event("transcript.done", "one", "Hello there."))
        view.event(event("transcript.delta", "one", "late delta"))
        view.event(event("transcript.done", "one", "Hello there. Please continue."))
        assertEquals("Hello there. Please continue.", view.entries.single().text)
        assertTrue(view.entries.single().complete)
        val unrelated = saved("other", "two", view.entries.single().text)
        view.reconcile(listOf(unrelated)); assertEquals(1, view.entries.size)
        val actual = saved("actual", "one", view.entries.single().text)
        assertTrue(VoiceTimeline.pending(listOf(actual), view.entries).isEmpty())
        view.reconcile(listOf(actual)); assertTrue(view.entries.isEmpty())
    }
    @Test fun `repeated words in distinct utterances and speakers stay distinct`() {
        val view = VoicePresentation()
        view.event(event("transcript.done", "one", "Yes")); view.event(event("transcript.done", "two", "Yes"))
        view.event(event("transcript.done", "one", "Yes", "assistant"))
        view.reconcile(listOf(saved("canonical", "one", "Yes")))
        assertEquals(2, view.entries.size)
        assertTrue(view.entries.any { it.role == "assistant" }); assertTrue(view.entries.any { it.providerId == "two" })
    }
    @Test fun `hydration and spoken canonical replays remove partial rows and ignore late chunks`() {
        val view = VoicePresentation()
        view.event(event("transcript.delta", "playback", "The saved answer", "assistant"))
        view.event(event("transcript.suppressed", "playback", "", "assistant"))
        assertTrue(view.entries.isEmpty())
        view.event(event("transcript.delta", "playback", "late", "assistant")); assertTrue(view.entries.isEmpty())
        view.event(event("transcript.done", "new", "The saved answer", "assistant")); assertEquals(1, view.entries.size)
    }
    @Test fun `typed responses reconcile by canonical id and failed delivery stays reviewable`() {
        val view = VoicePresentation()
        view.typed("input", "Please continue"); view.delivery("input", "uncertain")
        assertEquals("uncertain", view.entries.single().delivery)
        view.event(JSONObject().put("type", "composer.response.done").put("turnId", "turn").put("text", "Continuing.").put("canonicalMessageId", "answer"))
        view.reconcile(listOf(saved("input-message", "typed:input", "Please continue"), saved("answer", "typed-response:input", "Continuing.", "assistant")))
        assertTrue(view.entries.isEmpty())
    }
    @Test fun `unconfirmed transcript memory is bounded and interruption is explicit`() {
        val view = VoicePresentation()
        repeat(120) { view.event(event("transcript.delta", "$it", "words")) }
        assertThrows(IllegalArgumentException::class.java) { view.event(event("transcript.delta", "overflow", "more")) }
        view.interrupted(); assertTrue(view.entries.all { it.complete && it.delivery == "interrupted" })
    }
}
