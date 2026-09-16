package dev.zyra.mobile
import dev.zyra.mobile.data.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class TimelineTest {
    @Test fun canonicalCommitUsesItsSavedIdentityAndDoesNotOverwriteAnotherStream() {
        val live = TimelineItem("other-stream", "assistant", "Unrelated live response", "stream")
        val message = JSONObject().put("id", "voice-answer").put("role", "assistant").put("content", "Saved voice answer")
            .put("zyraCanonicalMessage", JSONObject().put("canonicalMessageId", "voice-answer").put("providerItemId", "voice-provider-item"))
        val commit = event(9, "message_end", JSONObject().put("canonicalCommit", true).put("historyEntryIndex", 12).put("message", message))
        val result = TimelineReducer.apply(SessionView("chat", items = listOf(live), running = true), commit)
        assertEquals(2, result.items.size); assertEquals(live, result.items.first()); assertTrue(result.running)
        assertEquals("message:voice-answer", result.items.last().id); assertEquals(12L, result.items.last().historyIndex)
        assertEquals(result, TimelineReducer.apply(result, commit))
        assertTrue(dev.zyra.mobile.voice.VoiceTimeline.pending(result.items, listOf(dev.zyra.mobile.voice.VoiceTranscript("voice", "assistant", "Saved voice answer", providerId = "voice-provider-item"))).isEmpty())
    }
    private fun event(sequence: Long, type: String, extra: JSONObject = JSONObject()) =
        JSONObject().put("sequence", sequence).put("event", extra.put("type", type))
    @Test fun replayedDeltasCannotDuplicateText() {
        var state = SessionView("chat")
        state = TimelineReducer.apply(state, event(1, "text_delta", JSONObject().put("delta", "Hello")))
        state = TimelineReducer.apply(state, event(2, "text_delta", JSONObject().put("delta", " world")))
        state = TimelineReducer.apply(state, event(2, "text_delta", JSONObject().put("delta", " world")))
        assertEquals("Hello world", state.items.single().text)
        assertEquals(2L, state.sequence)
    }
    @Test fun pendingApprovalSurvivesCursorCheckpointAndResolvesOnce() {
        var state = TimelineReducer.apply(SessionView("chat"), event(8, "approval_requested", JSONObject().put("requestId", "approval").put("command", "git status")))
        state = TimelineReducer.decode(TimelineReducer.encode(state))
        assertTrue(state.items.single().pending)
        state = TimelineReducer.apply(state, event(9, "approval_resolved", JSONObject().put("requestId", "approval")))
        assertFalse(state.items.single().pending)
        assertEquals("resolved", state.items.single().kind)
    }
    @Test fun readsLegacyStringAndStructuredMessageBodies() {
        assertEquals("whole sentence", TimelineReducer.text("whole sentence"))
        val history = JSONObject("""{"entries":[{"type":"message","id":"one","message":{"role":"user","content":"question"}},{"type":"message","id":"two","message":{"role":"assistant","content":[{"type":"text","text":"answer"}]}}],"pageInfo":{"oldestCursor":"40"}}""")
        val state = TimelineReducer.history("chat", history)
        assertEquals(listOf("question", "answer"), state.items.map { it.text })
        assertEquals("40", state.olderCursor)
    }
    @Test fun assistantHistoryDoesNotMixReasoningOrToolArgumentsIntoReply() {
        val history = JSONObject("""{"entries":[{"type":"message","message":{"id":"answer","role":"assistant","content":[{"type":"thinking","text":"Check the source first."},{"type":"toolCall","id":"read-1","name":"read","arguments":{"path":"example.kt"}},{"type":"text","text":"Here is the answer."}]}}]}""")
        val item = TimelineReducer.history("chat", history).items.single()
        assertEquals("Here is the answer.", item.text)
        assertEquals("Check the source first.", item.reasoning)
        assertEquals(listOf("read"), item.toolNames)
    }
    @Test fun thinkingDeltasDoNotBecomeReplyText() {
        var state = TimelineReducer.apply(SessionView("chat"), event(1, "thinking_delta", JSONObject().put("delta", "Let me check.")))
        state = TimelineReducer.apply(state, event(2, "text_delta", JSONObject().put("delta", "The answer.")))
        assertEquals("The answer.", state.items.single().text)
        assertEquals("Let me check.", state.items.single().reasoning)
    }
    @Test fun toolCompletionAndCanonicalMessageProduceOneToolRow() {
        var state = TimelineReducer.apply(SessionView("chat"), event(1, "tool_execution_start", JSONObject().put("toolCallId", "tool-1").put("toolName", "read")))
        state = TimelineReducer.apply(state, event(2, "tool_execution_end", JSONObject().put("toolCallId", "tool-1").put("result", JSONObject().put("content", "contents"))))
        val message = JSONObject("""{"role":"toolResult","toolCallId":"tool-1","toolName":"read","content":"contents","timestamp":500}""")
        state = TimelineReducer.apply(state, event(3, "message_end", JSONObject().put("message", message)))
        assertEquals(1, state.items.size)
        assertEquals("tool", state.items.single().kind)
    }

    @Test fun replayedThinkingRetainsItsCheckpointAndSeparateReply() {
        val original = SessionView("chat", 2, listOf(TimelineItem("message", "assistant", "Answer", "stream", reasoning = "ab")))
        val restored = TimelineReducer.decode(TimelineReducer.encode(original))
        val replay = JSONObject("""{"firstSequence":1,"sequence":4,"deltaLengths":[1,1,2,1],"event":{"type":"thinking_delta","delta":"ab😀c"}}""")
        val state = TimelineReducer.apply(restored, replay)
        assertEquals("Answer", state.items.single().text)
        assertEquals("ab😀c", state.items.single().reasoning)
        assertEquals(state, TimelineReducer.apply(state, replay))
    }
    @Test fun finalTextOnlySnapshotPreservesReasoningAndRemovesRepeatedThinkingPrefix() {
        val thought = "Checking the source carefully."
        var state = TimelineReducer.apply(SessionView("chat"), event(1, "thinking_delta", JSONObject().put("delta", thought)))
        val message = JSONObject().put("role", "assistant").put("content", thought + "\n\nHere is the result.")
        state = TimelineReducer.apply(state, event(2, "message_end", JSONObject().put("message", message)))
        assertEquals(thought, state.items.single().reasoning)
        assertEquals("Here is the result.", state.items.single().text)
        assertEquals("message", state.items.single().kind)
    }
    @Test fun completedLegacyCacheSplitsFromCanonicalRawButIncompleteCacheKeepsEveryCharacter() {
        val content = org.json.JSONArray("""[{"type":"thinking","thinking":"Source checked."},{"type":"text","text":"Result"}]""")
        val raw = JSONObject().put("message", JSONObject().put("role", "assistant").put("content", content)).toString()
        val cached = JSONObject().put("id", "chat").put("items", org.json.JSONArray().put(JSONObject().put("id", "a").put("role", "assistant").put("kind", "message").put("text", TimelineReducer.text(content)).put("raw", raw)))
        val restored = TimelineReducer.decode(cached.toString()).items.single()
        assertEquals("Result", restored.text); assertEquals("Source checked.", restored.reasoning)
        cached.getJSONArray("items").getJSONObject(0).put("kind", "stream").put("text", "Source checked.\nResult plus unsaved delta")
        assertEquals("Source checked.\nResult plus unsaved delta", TimelineReducer.decode(cached.toString()).items.single().text)
    }

    @Test fun legacyToolRowsConvergeOnTheCanonicalResult() {
        val execution = JSONObject().put("id", "tool-1").put("role", "tool").put("kind", "tool").put("text", "Preview")
            .put("raw", JSONObject().put("type", "tool_execution_end").put("toolCallId", "tool-1").toString())
        val result = JSONObject().put("id", "legacy-message-key").put("role", "toolResult").put("kind", "tool").put("text", "Complete result")
            .put("raw", JSONObject().put("message", JSONObject().put("role", "toolResult").put("toolCallId", "tool-1")).toString())
        val cache = JSONObject().put("id", "chat").put("items", org.json.JSONArray().put(execution).put(result))
        val item = TimelineReducer.decode(cache.toString()).items.single()
        assertEquals("tool:tool-1", item.id); assertEquals("Complete result", item.text)
    }

}
