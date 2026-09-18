package dev.zyra.mobile
import dev.zyra.mobile.data.*
import dev.zyra.mobile.ui.*
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class TerminalControllerTest {
    private fun screen(sequence: Int) = JSONObject().put("screen", JSONObject().put("cols", 80).put("rows", 24).put("sequence", sequence).put("data", "ready"))
    @Test fun outputsDuringAttachAreAppliedAfterTheSnapshotWithoutDuplicates() = runTest {
        val controller = TerminalController(backgroundScope)
        val snapshot = CompletableDeferred<JSONObject>()
        controller.open { method, _ -> if (method == "terminal.list") JSONObject().put("terminals", JSONArray()) else snapshot.await() }
        runCurrent()
        val frames = mutableListOf<TerminalFrame>(); controller.bind { frames.add(it) }
        controller.select("shell"); runCurrent()
        controller.event(JSONObject("""{"terminalId":"shell","event":{"type":"output","sequence":2,"data":"already saved"}}"""))
        controller.event(JSONObject("""{"terminalId":"shell","event":{"type":"output","sequence":3,"data":"new"}}"""))
        snapshot.complete(screen(2)); runCurrent()
        assertEquals(listOf(2L, 3L), frames.map { it.sequence }); assertEquals("new", frames.last().data)
    }
    @Test fun keyboardInputIsNeverReplayedAfterConnectionLoss() = runTest {
        val controller = TerminalController(backgroundScope); val sent = mutableListOf<String>()
        controller.open { method, params ->
            when (method) { "terminal.list" -> JSONObject().put("terminals", JSONArray()); "terminal.attach" -> screen(0)
                else -> { sent.add(params.optString("data")); JSONObject() } }
        }
        runCurrent(); controller.select("shell"); runCurrent()
        controller.send("dangerous command"); runCurrent(); controller.connection(false)
        advanceTimeBy(150); runCurrent(); controller.connection(true); runCurrent()
        assertTrue(sent.isEmpty())
    }
    @Test fun reconnectPartwayThroughCoalescedTextDoesNotDuplicateItsPrefix() {
        val current = SessionView("chat", 2, listOf(TimelineItem("message", "assistant", "ab", "stream")))
        val envelope = JSONObject("""{"firstSequence":1,"sequence":4,"deltaLengths":[1,1,2,1],"event":{"type":"text_delta","delta":"ab😀c"}}""")
        val result = TimelineReducer.apply(current, envelope)
        assertEquals("ab😀c", result.items.single().text); assertEquals(4L, result.sequence)
    }
    @Test fun liveSnapshotReplacesTheSameSavedMessage() {
        val history = JSONObject("""{"entries":[{"type":"message","id":"entry","message":{"role":"assistant","timestamp":1000,"content":"partial"}}]}""")
        val current = TimelineReducer.history("chat", history)
        val result = TimelineReducer.apply(current, JSONObject("""{"sequence":8,"event":{"type":"message_update","message":{"role":"assistant","timestamp":1000,"content":"complete"}}}"""), true)
        assertEquals(1, result.items.size); assertEquals("complete", result.items.single().text)
    }
}
