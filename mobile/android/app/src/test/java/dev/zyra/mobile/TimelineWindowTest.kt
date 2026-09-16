package dev.zyra.mobile

import dev.zyra.mobile.data.*
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class TimelineWindowTest {
    @Test fun recentConversationWindowIsNotTrimmedBackToOnlyTheLatestTurn() {
        val view = SessionView("chat", items = (660 until 1000).map { index ->
            TimelineItem("$index", if (index in setOf(660,680,700)) "user" else "tool", "small", historyIndex = index.toLong())
        }, olderCursor = "660")
        val retained = TimelineWindow.trim(view)
        assertEquals(340, retained.items.size)
        assertEquals(listOf("660", "680", "700"), retained.items.filter { it.role == "user" }.map { it.id })
        assertTrue(TimelineWindow.canCache(retained))
        assertFalse(TimelineWindow.needsContext(retained))
    }

    @Test fun coherentPreviewRetainsItsPromptWhenExtractedTextExceedsSoftCacheBudget() {
        val prompt = TimelineItem("prompt", "user", "Explain this output", historyIndex = 10)
        val answer = TimelineItem("answer", "assistant", "a".repeat(220000), raw = "b".repeat(220000), historyIndex = 11)
        val snapshot = TimelineWindow.trim(SessionView("chat", items = listOf(prompt, answer), olderCursor = "10"))
        assertEquals(listOf("prompt", "answer"), snapshot.items.map { it.id })
        assertEquals("10", snapshot.olderCursor)
        assertTrue(TimelineWindow.canCache(snapshot))
        assertTrue(TimelineWindow.needsContext(snapshot))
        assertTrue(TimelineWindow.needsContext(snapshot.copy(items = listOf(answer))))
    }

    @Test fun preservingContextNeverMakesTheCacheUnbounded() {
        val items = listOf(TimelineItem("prompt", "user", "prompt", historyIndex = 1),
            TimelineItem("large", "assistant", "a".repeat(850000), historyIndex = 2))
        val snapshot = TimelineWindow.trim(SessionView("chat", items = items))
        assertEquals(listOf("large"), snapshot.items.map { it.id })
        assertEquals("2", snapshot.olderCursor)
        assertFalse(TimelineWindow.canCache(snapshot))
    }

    private fun entry(index: Int) = JSONObject().put("type", "message").put("historyEntryIndex", index)
        .put("message", JSONObject().put("id", "m$index").put("role", "user").put("content", "Message $index"))
    private fun history(indices: List<Int>, before: String? = null) = JSONObject()
        .put("entries", JSONArray(indices.map(::entry))).put("pageInfo", JSONObject().put("oldestCursor", before))

    @Test fun evictedRowsReloadFromExclusiveCursorIncludingNonMessageGaps() {
        val positions = listOf(2, 5, 8, 12, 20)
        val original = TimelineReducer.history("chat", history(positions))
        val trimmed = TimelineWindow.trim(original, maxItems = 2)
        assertEquals(listOf("message:m12", "message:m20"), trimmed.items.map { it.id })
        assertEquals("9", trimmed.olderCursor)
        val restored = TimelineReducer.decode(TimelineReducer.encode(trimmed))
        val earlier = TimelineReducer.history("chat", history(positions.filter { it < restored.olderCursor!!.toInt() }))
        assertEquals(original.items.map { it.id }, (earlier.items + restored.items).map { it.id })
        assertEquals(listOf(12L, 20L), restored.items.map { it.historyIndex })
    }

    @Test fun readingEarlierHistoryDoesNotMoveTheViewport() {
        val original = TimelineReducer.history("chat", history((0..20).toList()))
        assertSame(original, TimelineWindow.trim(original, followingLatest = false, maxItems = 2))
    }

    @Test fun pendingAndStreamingRowsCannotBeEvictedEvenWithLocators() {
        for (protected in listOf(TimelineItem("approval", "system", "Allow?", pending = true, historyIndex = 2),
            TimelineItem("live", "assistant", "Working", kind = "stream", historyIndex = 2))) {
            val original = SessionView("chat", items = listOf(protected) + (3..8).map { TimelineItem("$it", "user", "text", historyIndex = it.toLong()) })
            assertSame(original, TimelineWindow.trim(original, maxItems = 2))
        }
    }

    @Test fun liveOnlyAndLegacyRowsStayUntilTheirRecoveryPositionIsKnown() {
        val original = SessionView("chat", items = listOf(TimelineItem("legacy", "user", "Keep me")) +
            (3..8).map { TimelineItem("$it", "user", "text", historyIndex = it.toLong()) }, olderCursor = "1")
        assertSame(original, TimelineWindow.trim(original, maxItems = 2))
    }

    @Test fun bodyBudgetCountsRawAndReasoningAndPreservesLatestRow() {
        val original = SessionView("chat", items = (0..3).map {
            TimelineItem("$it", "assistant", "a".repeat(30), raw = "b".repeat(30), reasoning = "c".repeat(30), historyIndex = it.toLong())
        })
        val trimmed = TimelineWindow.trim(original, maxCharacters = 100)
        assertEquals(listOf("3"), trimmed.items.map { it.id })
        assertEquals("3", trimmed.olderCursor)
    }

    @Test fun liveReplacementAndLegacyCacheKeepProvenLocators() {
        val original = TimelineReducer.history("chat", history(listOf(7)))
        val envelope = JSONObject().put("sequence", 1).put("event", JSONObject().put("type", "message_end")
            .put("message", JSONObject().put("id", "m7").put("role", "user").put("content", "Updated")))
        val updated = TimelineReducer.apply(original, envelope)
        assertEquals(7L, updated.items.single().historyIndex)
        val legacy = JSONObject(TimelineReducer.encode(updated))
        legacy.getJSONArray("items").getJSONObject(0).remove("historyIndex")
        // Old cache raw history still carries the authoritative transport locator.
        legacy.getJSONArray("items").getJSONObject(0).put("raw", entry(7).toString())
        assertEquals(7L, TimelineReducer.decode(legacy.toString()).items.single().historyIndex)
    }
}
