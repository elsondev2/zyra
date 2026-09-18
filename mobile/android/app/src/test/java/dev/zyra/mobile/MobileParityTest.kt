package dev.zyra.mobile
import dev.zyra.mobile.data.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant

class MobileParityTest {
    private val now = Instant.parse("2026-09-20T12:00:00Z").toEpochMilli()
    @Test fun idleChatsAutomaticallySettleAfterExactlyThreeDays() {
        val chat = Chat("a", "A", "/work", "ready", null, false, "pc", modifiedAt = "2026-09-17T12:00:00Z")
        assertTrue(ChatSettlement.isSettled(chat, emptyMap(), now))
        assertFalse(ChatSettlement.isSettled(chat, emptyMap(), now - 1))
        assertFalse(ChatSettlement.isSettled(chat.copy(state = "running"), emptyMap(), now))
        assertFalse(ChatSettlement.isSettled(chat.copy(attention = "approval"), emptyMap(), now))
        assertFalse(ChatSettlement.isSettled(chat.copy(lastTurnState = "failed"), emptyMap(), now))
        assertFalse(ChatSettlement.isSettled(chat.copy(modifiedAt = "invalid"), emptyMap(), now))
        val active = ChatSettlement.update(emptyMap(), chat, false)
        assertFalse(ChatSettlement.isSettled(chat, active, now))
        assertFalse(ChatSettlement.isSettled(chat.copy(modifiedAt = "2026-09-20T11:00:00Z"), active, now))
    }
    @Test fun interruptedHistoryKeepsWorkLastNarrationThenStatusAndNextPrompt() {
        val view = TimelineReducer.history("chat", JSONObject("""{"entries":[
          {"type":"message","message":{"id":"u","role":"user","content":"First"}},
          {"type":"message","message":{"id":"a","role":"assistant","content":[{"type":"text","text":"Checking"},{"type":"toolCall","id":"t","name":"read","arguments":{"path":"a.kt"}}],"stopReason":"toolUse"}},
          {"type":"message","message":{"role":"toolResult","toolCallId":"t","toolName":"read","content":"file"}},
          {"type":"message","message":{"id":"b","role":"assistant","content":[{"type":"text","text":"I will fix it"},{"type":"toolCall","id":"batch","name":"begin_action_batch","arguments":{"title":"Fixing layout"}}],"stopReason":"aborted"}},
          {"type":"message","message":{"id":"next","role":"user","content":"Also this"}}
        ]}"""))
        val rows = TimelineWork().rows(view)
        assertEquals(listOf("message:u", "work:message:u", "message:b", "interrupted:message:u", "message:next"), rows.map { it.id })
        assertEquals(1, rows.filterIsInstance<ChatRailRow.Work>().single().actions.size)
        assertEquals("Interrupted", (rows[3] as ChatRailRow.Message).item.text)
    }
    @Test fun interruptionWithoutAssistantMessageIsVisibleAndSurvivesCache() {
        var view = SessionView("chat", items = listOf(TimelineItem("u", "user", "Start")), running = true)
        view = TimelineReducer.apply(view, JSONObject("""{"sequence":1,"event":{"type":"zyra_server_turn_completed","outcome":"interrupted"}}"""))
        assertFalse(view.running)
        assertEquals("interrupted", (TimelineWork().rows(view).last() as ChatRailRow.Message).item.kind)
    }
    @Test fun visualizationBlocksFollowDesktopFencesAndStreamingRules() {
        val text = "Before\n<visualization title=\"Chart\" height=\"280\">\n<svg viewBox=\"0 0 20 20\"><circle r=\"8\"/></svg>\n</visualization>\nAfter"
        val parts = VisualizationBlocks.parse(text)
        assertEquals(listOf("text", "complete", "text"), parts.map { it.state })
        assertEquals(280, parts[1].height)
        assertEquals("Chart", parts[1].title)
        assertEquals("text", VisualizationBlocks.parse("```html\n$text\n```").single().state)
        assertEquals("incomplete", VisualizationBlocks.parse("<visualization>\n<div>partial").single().state)
        assertEquals("", VisualizationBlocks.parse("<visualization>\n<div>partial").single().html)
        assertEquals("too-large", VisualizationBlocks.parse("<visualization>\n" + "x".repeat(65537) + "\n</visualization>").single().state)
    }
    @Test fun visualizationRetainsDrawingButCannotRunCodeOrFetchResources() {
        val safe = VisualizationDocument.sanitize("<style>.x{color:red}</style><svg viewBox=\"0 0 20 20\"><defs><linearGradient id=\"g\"><stop offset=\"0\"/></linearGradient></defs><circle r=\"8\" onclick=\"alert(1)\"/></svg><script>alert(2)</script><iframe src=\"file:///private\"></iframe><img src=\"https://remote/image\"><a href=\"https://remote\">link</a>")
        assertTrue(safe.contains("viewBox")); assertTrue(safe.contains("linearGradient")); assertTrue(safe.contains("<style>"))
        assertFalse(safe.contains("onclick")); assertFalse(safe.contains("<script")); assertFalse(safe.contains("iframe")); assertFalse(safe.contains("https://"))
        assertTrue(VisualizationDocument.build(safe,"#000000","#ffffff","#aaaaaa","#00ffff","#333333").contains("script-src 'none'"))
    }
}
