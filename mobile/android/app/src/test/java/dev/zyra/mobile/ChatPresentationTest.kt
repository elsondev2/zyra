package dev.zyra.mobile

import dev.zyra.mobile.data.*
import dev.zyra.mobile.ui.relativeChatTime
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class ChatPresentationTest {
    private fun chat(id: String, state: String = "ready", attention: String? = null) = Chat(id, "Title", "/project", state, attention, false, "pc")
    @Test fun modelAndTuiMetadataSurviveCanonicalParsing() {
        val value = Chat.parse(JSONObject("""{"canonicalChatId":"one","model":"openai-codex/gpt-6-astra","presence":{"state":"ready","latestTurn":{"state":"completed"},"clients":[{"surface":"tui"}]}}"""), "pc")
        assertEquals("gpt-6-astra", value.modelLabel);assertEquals("completed", value.lastTurnState);assertTrue(value.tuiOpen)
        assertEquals("openai/gpt-test", chatModel(JSONObject("""{"provider":"openai","id":"gpt-test"}""")))
    }
    @Test fun legacyChatDoesNotInventAModelOrTerminalPresence() {
        val value = Chat.parse(JSONObject("""{"canonicalChatId":"old","model":null}"""))
        assertEquals("", value.model);assertEquals("Assistant", value.modelLabel);assertFalse(value.tuiOpen);assertEquals("", value.lastTurnState)
        assertEquals("", chatModel("bad\nmodel"));assertEquals("", chatModel(42))
    }
    @Test fun attentionAndBackgroundWorkAreVisibleWithoutDuplicatingRows() {
        val chats = listOf(chat("recent"), chat("background", "background"), chat("approval", "running", "approval"), chat("working", "running"))
        val sections = chatInboxSections(chats)
        assertEquals(listOf("Needs you", "Working", "Recent"), sections.map { it.first })
        assertEquals(listOf("approval", "background", "working", "recent"), sections.flatMap { it.second }.map { it.id })
        assertTrue(chatVisibleInFilter(chats[1], "working"));assertTrue(chatVisibleInFilter(chats[2], "attention"))
        assertFalse(chatVisibleInFilter(chats[0].copy(archived = true), "all"))
    }
    @Test fun relativeTimesHandleUnknownAndFutureTimestamps() {
        assertEquals("", relativeChatTime(""));assertEquals("Now", relativeChatTime("2026-09-14T12:00:00Z", 0))
        assertEquals("1h", relativeChatTime("2026-09-14T12:00:00Z", java.time.Instant.parse("2026-09-14T13:15:00Z").toEpochMilli()))
    }
}
