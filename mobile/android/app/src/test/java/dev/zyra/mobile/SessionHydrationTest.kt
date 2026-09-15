package dev.zyra.mobile

import dev.zyra.mobile.network.SessionHydration
import dev.zyra.mobile.data.*
import kotlinx.coroutines.*
import kotlinx.coroutines.test.runTest
import org.json.JSONObject
import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Test

class SessionHydrationTest {
    @Test fun sparseWarmCacheGetsContextBeforeSlowAttachmentCompletes() = runTest {
        val attached = CompletableDeferred<Unit>()
        var previewed = false
        val result = SessionHydration.load("chat", JSONObject(), false, request = { method, params ->
            if (method == "session.attach") { attached.await(); JSONObject().put("canonicalChatId", "chat") }
            else { val end = params.optString("before").toIntOrNull() ?: 120; actionHeavyPage((end - 40).coerceAtLeast(0), end) }
        }, preview = { history ->
            assertEquals(120, history.getJSONArray("entries").length())
            previewed = true
            attached.complete(Unit)
        }, visibleStart = 80, needsContext = true).second!!
        assertTrue(previewed)
        assertEquals(120, result.getJSONArray("entries").length())
    }

    @Test fun mobilePromptAlignedInitialPageRemainsCoherentAboveTheSoftEventWindow() = runTest {
        var reads = 0
        val result = SessionHydration.load("chat", JSONObject(), true, request = { method, _ ->
            if (method == "session.attach") JSONObject().put("canonicalChatId", "chat")
            else {
                reads++
                actionHeavyPage(0, 302).also { response ->
                    val entries = response.getJSONObject("history").getJSONArray("entries")
                    for (index in 1 until 301) entries.getJSONObject(index).getJSONObject("message").put("role", "toolResult")
                }
            }
        }, preview = { snapshot ->
            val view = TimelineWindow.trim(TimelineReducer.history("chat", snapshot))
            assertEquals("user", view.items.first().role)
            assertEquals(302, view.items.size)
        }).second!!
        assertEquals(2, reads)
        assertEquals(302, result.getJSONArray("entries").length())
    }

    @Test fun largeLatestTurnStillLoadsEarlierConversationWithinTheHardWindow() = runTest {
        var reads = 0
        val result = SessionHydration.load("chat", JSONObject(), false, request = { method, params ->
            if (method == "session.attach") JSONObject().put("canonicalChatId", "chat")
            else {
                reads++
                val end = params.optString("before").toIntOrNull() ?: 1000
                val start = if (end == 1000) 700 else end - 40
                historyPage(start, end).also { response ->
                    val entries = response.getJSONObject("history").getJSONArray("entries")
                    for (index in 0 until entries.length()) {
                        val entry = entries.getJSONObject(index)
                        val position = entry.getInt("historyEntryIndex")
                        entry.getJSONObject("message").put("role", if (position in setOf(660, 680, 700)) "user" else "toolResult")
                    }
                }
            }
        }, preview = {}).second!!
        assertEquals(2, reads)
        assertEquals(340, result.getJSONArray("entries").length())
        assertEquals("660", result.getJSONObject("pageInfo").getString("oldestCursor"))
    }

    private fun historyPage(start: Int, end: Int, text: String = "fresh") = JSONObject().put("history", JSONObject()
        .put("entries", JSONArray().apply { for (i in start until end) put(JSONObject().put("historyEntryIndex", i).put("text", text)
            .put("type", "message").put("message", JSONObject().put("role", if (i % 10 == 0) "user" else "assistant").put("content", text))) })
        .put("pageInfo", JSONObject().put("startCursor", "$start").put("endCursor", "$end").put("oldestCursor", if (start > 0) "$start" else JSONObject.NULL).put("totalEntries", 120)))

    @Test fun warmRefreshKeepsVisibleRangeWithoutCopyingOldCachedTurns() = runTest {
        val before = mutableListOf<String>()
        val result = SessionHydration.load("chat", JSONObject(), false, { method, params ->
            if (method == "session.attach") JSONObject().put("canonicalChatId", "chat")
            else { before += params.optString("before"); val end = params.optString("before").toIntOrNull() ?: 120; historyPage((end - 40).coerceAtLeast(0), end) }
        }, { fail("Warm cache stays visible") }, visibleStart = 0).second!!
        assertEquals(listOf("", "80", "40"), before)
        assertEquals(120, result.getJSONArray("entries").length())
        assertEquals(0, result.getJSONArray("entries").getJSONObject(0).getInt("historyEntryIndex"))
        assertEquals(119, result.getJSONArray("entries").getJSONObject(119).getInt("historyEntryIndex"))
        assertTrue(result.getJSONObject("pageInfo").isNull("oldestCursor"))
        assertEquals("120", result.getJSONObject("pageInfo").getString("endCursor"))
    }
    @Test fun warmRefreshStopsAtItsVisibleStartAndRemainsPageable() = runTest {
        var reads = 0
        val result = SessionHydration.load("chat", JSONObject(), false, { method, params ->
            if (method == "session.attach") JSONObject().put("canonicalChatId", "chat")
            else { reads++; val end = params.optString("before").toIntOrNull() ?: 120; historyPage(end - 40, end) }
        }, {}, visibleStart = 50).second!!
        assertEquals(2, reads); assertEquals(80, result.getJSONArray("entries").length())
        assertEquals("40", result.getJSONObject("pageInfo").getString("oldestCursor"))
    }
    @Test fun veryOldWarmWindowCannotTriggerUnboundedReads() = runTest {
        var reads = 0
        val result = SessionHydration.load("chat", JSONObject(), false, { method, params ->
            if (method == "session.attach") JSONObject().put("canonicalChatId", "chat")
            else { reads++; val end = params.optString("before").toIntOrNull() ?: 1000; historyPage(end - 40, end) }
        }, {}, visibleStart = 0).second!!
        assertEquals(6, reads); assertEquals(240, result.getJSONArray("entries").length())
        assertEquals("760", result.getJSONObject("pageInfo").getString("oldestCursor"))
    }
    @Test fun changedCanonicalTargetDoesNotFetchAnotherChatsCachedRange() = runTest {
        var reads = 0
        SessionHydration.load("alias", JSONObject(), false, { method, _ ->
            if (method == "session.attach") JSONObject().put("canonicalChatId", "different") else { reads++; historyPage(80, 120) }
        }, {}, visibleStart = 0)
        assertEquals(1, reads)
    }
    @Test fun truncatedFileIsRefreshedWithoutSplicingInAnOlderSnapshot() = runTest {
        var reads = 0
        val result = SessionHydration.load("chat", JSONObject(), false, { method, _ ->
            if (method == "session.attach") JSONObject().put("canonicalChatId", "chat")
            else { reads++; if (reads == 1) historyPage(80, 120, "old") else historyPage(0, 20, "new") }
        }, {}, visibleStart = 0).second!!
        assertEquals(3, reads); assertEquals(20, result.getJSONArray("entries").length())
        assertEquals("new", result.getJSONArray("entries").getJSONObject(0).getString("text"))
    }
    @Test fun largePageStopsBackgroundRefillAtCharacterBudget() = runTest {
        var reads = 0
        SessionHydration.load("chat", JSONObject(), false, { method, _ ->
            if (method == "session.attach") JSONObject().put("canonicalChatId", "chat") else { reads++; historyPage(80, 120, "x".repeat(12000)) }
        }, {}, visibleStart = 0)
        assertEquals(1, reads)
    }
    @Test fun coldHistoryRevealsBeforeRuntimeButRefreshesAfterSnapshotSoNoMessagesAreLost() = runTest {
        val started = CompletableDeferred<Unit>(); val proceed = CompletableDeferred<Unit>()
        var calls = 0; var previewed = false
        val result = async {
            SessionHydration.load("chat", JSONObject(), true, request = { method, _ ->
                if (method == "session.attach") { started.complete(Unit); proceed.await(); JSONObject().put("canonicalChatId", "chat") }
                else { calls++; if (calls == 1) started.await() else assertTrue(proceed.isCompleted); JSONObject().put("history", JSONObject().put("revision", calls)) }
            }, preview = { assertEquals(1, it.getInt("revision")); previewed = true; proceed.complete(Unit) })
        }.await()
        assertTrue(previewed); assertEquals(2, result.second!!.getInt("revision")); assertEquals(2, calls)
    }
    @Test fun warmHistoryUsesOneAuthoritativeTransfer() = runTest {
        var reads = 0
        SessionHydration.load("chat", JSONObject(), false, { method, _ ->
            if (method == "session.attach") JSONObject().put("canonicalChatId", "chat") else { reads++; JSONObject() }
        }, { fail("Warm timeline should already be visible") })
        assertEquals(1, reads)
    }
    private fun actionHeavyPage(start: Int, end: Int): JSONObject = historyPage(start, end).also { result ->
        val entries = result.getJSONObject("history").getJSONArray("entries")
        for (i in 0 until entries.length()) {
            val entry = entries.getJSONObject(i)
            val index = entry.getInt("historyEntryIndex")
            entry.getJSONObject("message").put("role", if (index % 50 == 0) "user" else if (index == end - 1) "assistant" else "toolResult")
        }
    }
    @Test fun coldActionHeavyHistoryShowsRecentTurnsBeforeSlowRuntimeFinishes() = runTest {
        val proceed = CompletableDeferred<Unit>()
        val previewSizes = mutableListOf<Int>()
        val result = SessionHydration.load("chat", JSONObject(), true, { method, params ->
            if (method == "session.attach") { proceed.await(); JSONObject().put("canonicalChatId", "chat") }
            else { val end = params.optString("before").toIntOrNull() ?: 120; actionHeavyPage((end - 40).coerceAtLeast(0), end) }
        }, { history ->
            previewSizes += history.getJSONArray("entries").length()
            proceed.complete(Unit)
        }).second!!
        // The last 40 events contain one user turn. A long response occupies a
        // scrollable viewport, so geometry alone never requested its context.
        assertEquals(listOf(120), previewSizes)
        assertEquals(120, result.getJSONArray("entries").length())
    }
    @Test fun oldSingleTurnCacheRefreshesContextWithoutWaitingForASwipe() = runTest {
        var reads = 0
        val result = SessionHydration.load("chat", JSONObject(), false, { method, params ->
            if (method == "session.attach") JSONObject().put("canonicalChatId", "chat")
            else { reads++; val end = params.optString("before").toIntOrNull() ?: 120; actionHeavyPage((end - 40).coerceAtLeast(0), end) }
        }, {}, visibleStart = 80).second!!
        assertEquals(3, reads)
        assertEquals(120, result.getJSONArray("entries").length())
    }
    @Test fun coldActionOnlyHistoryStillStopsAtWindowBudget() = runTest {
        val pageSizes = mutableListOf<Int>()
        var reads = 0
        val result = SessionHydration.load("chat", JSONObject(), true, { method, params ->
            if (method == "session.attach") JSONObject().put("canonicalChatId", "chat")
            else {
                reads++; val end = params.optString("before").toIntOrNull() ?: 1000
                historyPage(end - 40, end).also { result ->
                    val entries = result.getJSONObject("history").getJSONArray("entries")
                    for (i in 0 until entries.length()) entries.getJSONObject(i).getJSONObject("message").put("role", "toolResult")
                }
            }
        }, { pageSizes += it.getJSONArray("entries").length() }).second!!
        assertEquals(listOf(240), pageSizes)
        assertEquals(12, reads)
        assertEquals(240, result.getJSONArray("entries").length())
        assertEquals("760", result.getJSONObject("pageInfo").getString("oldestCursor"))
    }
    @Test fun liveEventsPreserveAlreadyLoadedHistoryAndPagingCursor() {
        val old = SessionView("chat", items = (0..499).map { TimelineItem("item:$it", "user", "Message $it") }, olderCursor = "120")
        val next = TimelineReducer.apply(old, JSONObject().put("sequence", 1).put("event", JSONObject().put("type", "agent_start")))
        assertEquals(old.items, next.items); assertEquals("120", next.olderCursor)
    }
}
