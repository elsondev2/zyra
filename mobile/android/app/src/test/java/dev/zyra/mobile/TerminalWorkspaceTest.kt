package dev.zyra.mobile

import dev.zyra.mobile.ui.*
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class TerminalWorkspaceTest {
    private fun screen() = JSONObject("""{"screen":{"sequence":0,"cols":80,"rows":24,"data":"ready"}}""")
    @Test fun twoPanesKeepSeparateOutputAndBackLeavesShellsRunning() = runTest {
        val calls = mutableListOf<Pair<String, JSONObject>>()
        val workspace = TerminalWorkspaceController(backgroundScope)
        workspace.open(supportsSplit = true) { method, params ->
            calls.add(method to JSONObject(params.toString()))
            if (method == "terminal.list") JSONObject("""{"terminals":[{"id":"a"},{"id":"b"},{"id":"c"}]}""") else screen()
        }
        runCurrent(); workspace.select("a"); workspace.select("b"); workspace.select("c"); runCurrent()
        assertEquals(listOf("a", "b"), workspace.state.value.panes)
        val a = mutableListOf<TerminalFrame>(); val b = mutableListOf<TerminalFrame>()
        workspace.pane("a")!!.bind { a.add(it) }; workspace.pane("b")!!.bind { b.add(it) }; runCurrent()
        workspace.event(JSONObject("""{"terminalId":"a","event":{"type":"output","sequence":1,"data":"one"}}"""))
        workspace.event(JSONObject("""{"terminalId":"b","event":{"type":"output","sequence":1,"data":"two"}}"""))
        assertEquals("one", a.last().data); assertEquals("two", b.last().data)
        workspace.pane("b")!!.send("queued before exit"); runCurrent()
        workspace.event(JSONObject("""{"terminalId":"b","event":{"type":"exit"}}"""))
        assertTrue(workspace.pane("b")!!.state.value.finished)
        assertEquals("exited", workspace.state.value.terminals.find { it.id == "b" }!!.status)
        workspace.pane("b")!!.send("must not send"); advanceTimeBy(150); runCurrent()
        assertFalse(calls.any { it.first == "terminal.input" })
        assertTrue(workspace.back()); runCurrent()
        assertTrue(workspace.state.value.panes.isEmpty()); assertFalse(workspace.back())
        assertFalse(calls.any { it.first == "terminal.close" })
        assertEquals(setOf("a", "b"), calls.filter { it.first == "terminal.detach" }.map { it.second.getString("terminalId") }.toSet())
        assertTrue(calls.filter { it.first == "terminal.attach" }.all { it.second.getBoolean("keepExisting") && it.second.getString("subscriptionId").isNotBlank() })
    }
    @Test fun reopeningHasNewLeaseAndPendingInputCannotReachAnotherPane() = runTest {
        val calls = mutableListOf<Pair<String, JSONObject>>()
        val workspace = TerminalWorkspaceController(backgroundScope)
        workspace.open { method, params ->
            calls.add(method to JSONObject(params.toString()))
            if (method == "terminal.list") JSONObject("""{"terminals":[]}""") else screen()
        }
        runCurrent(); workspace.select("a"); runCurrent()
        workspace.pane("a")!!.send("old input"); runCurrent()
        workspace.remove("a"); workspace.select("a"); runCurrent(); advanceTimeBy(150); runCurrent()
        assertFalse(calls.any { it.first == "terminal.input" })
        val leases = calls.filter { it.first == "terminal.attach" }.map { it.second.getString("subscriptionId") }
        assertEquals(2, leases.distinct().size)
        assertEquals(leases.first(), calls.first { it.first == "terminal.detach" }.second.getString("subscriptionId"))
    }
    @Test fun creationOpensTheShellAndFailuresKeepTheListUsable() = runTest {
        val workspace = TerminalWorkspaceController(backgroundScope)
        var failure = true
        workspace.open { method, _ -> when (method) {
            "terminal.list" -> JSONObject("""{"terminals":[]}""")
            "terminal.create" -> if (failure) error("Unavailable") else JSONObject("""{"terminalId":"new"}""")
            else -> screen()
        } }
        runCurrent(); workspace.create(); runCurrent()
        assertEquals("Unavailable", workspace.state.value.error); assertFalse(workspace.state.value.busy)
        failure = false; workspace.create(); runCurrent()
        assertEquals(listOf("new"), workspace.state.value.panes)
        assertEquals("new", workspace.state.value.terminals.single().id)
    }
    @Test fun olderHostsStaySinglePane() = runTest {
        val workspace = TerminalWorkspaceController(backgroundScope)
        workspace.open { method, _ -> if (method == "terminal.list") JSONObject("""{"terminals":[]}""") else screen() }
        runCurrent(); workspace.select("a"); workspace.select("b"); runCurrent()
        assertFalse(workspace.state.value.supportsSplit)
        assertEquals(listOf("a"), workspace.state.value.panes)
    }
}
