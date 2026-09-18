package dev.zyra.mobile

import dev.zyra.mobile.data.*
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class HiddenMessageTest {
    private fun event(sequence: Long, type: String, message: JSONObject? = null) = JSONObject().put("sequence", sequence)
        .put("event", JSONObject().put("type", type).apply { message?.let { put("message", it) } })
    private fun internalUpdate() = JSONObject().put("id", "poll-update").put("role", "custom")
        .put("customType", "zyra.managed-bash.update.v1").put("display", false)
        .put("content", "[Zyra managed command update]\nCommand exited with code 1.\nUse this command output to decide")

    @Test fun hiddenContextDoesNotEnterLiveNarrationOrStopAnActiveTurn() {
        val message = internalUpdate()
        val original = message.toString()
        var state = SessionView("chat", running = true, items = listOf(TimelineItem("reply", "assistant", "Checking", "stream")))
        for ((index, type) in listOf("message_start", "message_update", "message_end").withIndex()) {
            state = TimelineReducer.apply(state, event(index + 1L, type, message))
            assertEquals(listOf("Checking"), state.items.map { it.text }); assertTrue(state.running)
        }
        assertEquals(3L, state.sequence); assertEquals(original, message.toString())
        state = TimelineReducer.apply(state, event(4, "message_hidden"))
        assertEquals(4L, state.sequence); assertTrue(state.running)
        val narration = JSONObject().put("id", "reply").put("role", "assistant").put("content", "Still checking")
        state = TimelineReducer.apply(state, event(5, "message_end", narration))
        assertTrue(state.running)
        state = TimelineReducer.apply(state, event(6, "agent_end"))
        assertFalse(state.running)
    }

    @Test fun hiddenContextIsConsistentInHistoryAndLegacyCacheWithoutTextFiltering() {
        val hidden = internalUpdate()
        val authored = JSONObject().put("id", "authored").put("role", "assistant").put("content", hidden.getString("content"))
        val visibleCustom = JSONObject().put("id", "visible").put("role", "custom").put("display", true).put("content", "Visible notice")
        val entries = JSONArray()
        for (message in listOf(hidden, authored, visibleCustom)) entries.put(JSONObject().put("type", "message").put("message", message))
        val history = TimelineReducer.history("chat", JSONObject().put("entries", entries))
        assertEquals(listOf(hidden.getString("content"), "Visible notice"), history.items.map { it.text })
        val cachedLeak = TimelineItem("message:poll-update", "custom", hidden.getString("content"), raw = JSONObject().put("message", hidden).toString())
        val restored = TimelineReducer.decode(TimelineReducer.encode(history.copy(items = history.items + cachedLeak, running = true)))
        assertEquals(history.items, restored.items); assertTrue(restored.running)
        val oldDeferred = cachedLeak.copy(raw = JSONObject().put("message", JSONObject().put("role", "custom").put("id", "poll-update")).toString())
        assertTrue(TimelineReducer.decode(TimelineReducer.encode(SessionView("chat", items = listOf(oldDeferred)))).items.isEmpty())
    }

    @Test fun hiddenCommitRemovesAnAlreadyCachedRowWithTheSameIdentity() {
        val state = SessionView("chat", items = listOf(TimelineItem("message:poll-update", "custom", "legacy leak")))
        assertTrue(TimelineReducer.apply(state, event(1, "message_end", internalUpdate())).items.isEmpty())
    }
}
