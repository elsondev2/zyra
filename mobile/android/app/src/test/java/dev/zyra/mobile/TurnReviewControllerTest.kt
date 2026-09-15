package dev.zyra.mobile

import dev.zyra.mobile.ui.TurnReviewController
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class TurnReviewControllerTest {
    private fun turn(id: String = "turn-2", number: Int = 2) = JSONObject().put("id", id).put("number", number)
        .put("prompt", "Update the guide").put("response", "Updated").put("state", "completed")
        .put("changes", JSONArray().put(JSONObject().put("activityId", "write-1").put("rootId", "work-root").put("path", "docs/guide.md")
            .put("kind", "update").put("additions", 4).put("deletions", 2)))
    private fun page(vararg turns: JSONObject, next: String? = null) = JSONObject().put("turns", JSONArray(turns.toList())).put("nextCursor", next ?: JSONObject.NULL)

    @Test fun loadsAndPagesMetadataWithoutFetchingAnyPatch() = runTest {
        val requests = mutableListOf<Pair<String, JSONObject>>()
        val controller = TurnReviewController(this)
        controller.bind { method, params ->
            requests += method to params
            if (params.has("before")) page(turn(), turn("turn-1", 1)) else page(turn(), next = "turn-2")
        }
        controller.refresh(); runCurrent()
        assertEquals(40, requests.single().second.getInt("limit"))
        assertEquals("turn-2", controller.state.value.next)
        controller.more(); runCurrent()
        assertEquals("turn-2", requests.last().second.getString("before"))
        assertEquals(listOf("turn-2", "turn-1"), controller.state.value.turns.map { it.id })
        assertNull(controller.state.value.next)
        assertTrue(requests.all { it.first == "review.list" })
        controller.refresh(); runCurrent()
        assertEquals(listOf("turn-2"), controller.state.value.turns.map { it.id })
    }

    @Test fun explicitFileTapUsesAuthorizedSelectorAndPreservesTruncation() = runTest {
        var requested: Pair<String, JSONObject>? = null
        val controller = TurnReviewController(this)
        controller.bind { method, params -> requested = method to params; JSONObject().put("patch", "@@ -1 +1 @@\n-old\n+new").put("truncated", true).put("unavailableReason", "too-large") }
        val turn = TurnReviewController.parseTurn(turn())
        val file = turn.changes.single()
        assertEquals(4, file.additions); assertEquals(2, file.deletions)
        controller.diff(turn, file); runCurrent()
        assertEquals("review.diff", requested!!.first)
        assertEquals("turn-2", requested!!.second.getString("turnId"))
        assertEquals("write-1", requested!!.second.getString("activityId"))
        assertEquals("work-root", requested!!.second.getString("rootId"))
        assertEquals("docs/guide.md", requested!!.second.getString("path"))
        assertTrue(controller.state.value.truncated)
        assertEquals("too-large", controller.state.value.unavailable)
        assertTrue(controller.back()); assertNull(controller.state.value.file); assertNull(controller.state.value.patch)
    }

    @Test fun oldComputerCannotPublishLateNonCancellableReview() = runTest {
        val held = CompletableDeferred<Unit>()
        val controller = TurnReviewController(this)
        controller.bind { _, _ -> withContext(NonCancellable) { held.await() }; page(turn("old")) }
        controller.refresh(); runCurrent()
        controller.bind { _, _ -> page(turn("new")) }
        controller.refresh(); runCurrent()
        held.complete(Unit); runCurrent()
        assertEquals(listOf("new"), controller.state.value.turns.map { it.id })
        assertFalse(controller.state.value.busy); assertNull(controller.state.value.error)
    }

    @Test fun backCancelsLateDiffWithoutReopeningIt() = runTest {
        val held = CompletableDeferred<Unit>()
        val controller = TurnReviewController(this)
        controller.bind { _, _ -> withContext(NonCancellable) { held.await() }; JSONObject().put("patch", "late") }
        val turn = TurnReviewController.parseTurn(turn())
        controller.diff(turn, turn.changes.single()); runCurrent()
        assertTrue(controller.back())
        held.complete(Unit); runCurrent()
        assertNull(controller.state.value.file); assertNull(controller.state.value.patch); assertFalse(controller.state.value.busy)
    }

    @Test fun failedRefreshKeepsVisibleTurnsForRetry() = runTest {
        var fail = false
        val controller = TurnReviewController(this)
        controller.bind { _, _ -> if (fail) error("PC disconnected") else page(turn()) }
        controller.refresh(); runCurrent(); fail = true
        controller.refresh(); runCurrent()
        assertEquals(1, controller.state.value.turns.size)
        assertEquals("PC disconnected", controller.state.value.error)
        fail = false; controller.refresh(); runCurrent(); assertNull(controller.state.value.error)
    }

    @Test fun refreshingOpenFileRefetchesItsDiffAndBackReturnsThroughSelectedTurn() = runTest {
        val calls = mutableListOf<String>()
        val controller = TurnReviewController(this)
        controller.bind { method, _ -> calls += method; when (method) { "review.list" -> page(turn()); "review.turn" -> JSONObject().put("turn", turn()).put("messages", JSONArray()); else -> JSONObject().put("patch", "revision ${calls.size}") } }
        val turn = TurnReviewController.parseTurn(turn())
        controller.diff(turn, turn.changes.single()); runCurrent()
        controller.refresh(); runCurrent()
        assertEquals(listOf("review.diff", "review.diff"), calls)
        assertEquals("revision 2", controller.state.value.patch)
        controller.back(); controller.refresh(); runCurrent()
        assertEquals("review.turn", calls.last())
        assertEquals("turn-2", controller.state.value.selected?.id)
        controller.back(); controller.refresh(); runCurrent()
        assertEquals("review.list", calls.last())
    }

    @Test fun selectingTurnLoadsFullMessagesOnceAndDiffBackKeepsDetail() = runTest {
        val calls = mutableListOf<String>()
        val controller = TurnReviewController(this)
        controller.bind { method, _ -> calls += method
            if (method == "review.diff") JSONObject().put("patch", "patch") else JSONObject().put("turn", turn()).put("messages", JSONArray()
                .put(JSONObject().put("role", "user").put("text", "Full prompt"))
                .put(JSONObject().put("role", "assistant").put("text", "Full response").put("truncated", true)))
        }
        val entry = TurnReviewController.parseTurn(turn())
        controller.select(entry); runCurrent()
        assertEquals(listOf("review.turn"), calls)
        assertEquals(listOf("Full prompt", "Full response"), controller.state.value.messages.map { it.text })
        assertTrue(controller.state.value.messages.last().truncated)
        controller.select(entry); controller.more(); runCurrent()
        assertEquals(1, calls.size)
        controller.diff(entry, entry.changes.single()); runCurrent(); controller.back()
        assertEquals(entry.id, controller.state.value.selected?.id)
        assertEquals(2, controller.state.value.messages.size)
        assertTrue(controller.state.value.detailLoaded)
        assertTrue(controller.back()); assertNull(controller.state.value.selected)
        assertFalse(controller.back())
    }

    @Test fun leavingSelectedTurnRejectsLateDetailAndRefreshRetriesFailure() = runTest {
        val held = CompletableDeferred<Unit>()
        val controller = TurnReviewController(this)
        val entry = TurnReviewController.parseTurn(turn())
        controller.bind { _, _ -> withContext(NonCancellable) { held.await() }; JSONObject().put("turn", turn()).put("messages", JSONArray()) }
        controller.select(entry); runCurrent(); controller.back(); held.complete(Unit); runCurrent()
        assertNull(controller.state.value.selected); assertFalse(controller.state.value.detailLoaded)
        var fail = true
        controller.bind { _, _ -> if (fail) error("Disconnected") else JSONObject().put("turn", turn()).put("messages", JSONArray()) }
        controller.select(entry); runCurrent()
        assertEquals(entry.id, controller.state.value.selected?.id); assertEquals("Disconnected", controller.state.value.error)
        fail = false; controller.refresh(); runCurrent()
        assertTrue(controller.state.value.detailLoaded); assertNull(controller.state.value.error)
    }

    @Test fun unavailableTextDoesNotExposeInternalCodesOrArbitraryPaths() {
        assertEquals("Preview unavailable", TurnReviewController.unavailableLabel("snapshot-failed"))
        assertEquals("Preview unavailable", TurnReviewController.unavailableLabel("C:/private/error"))
        assertEquals("Binary file · no text preview", TurnReviewController.unavailableLabel("binary"))
    }
}
