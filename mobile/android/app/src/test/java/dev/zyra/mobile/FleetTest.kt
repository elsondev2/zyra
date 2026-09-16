package dev.zyra.mobile
import dev.zyra.mobile.ui.*
import kotlinx.coroutines.test.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import kotlin.coroutines.Continuation
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine

@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class FleetTest {
    @Test fun runMetadataUsesCanonicalNumbersAndRetainsThemWhenStatusOmitsUsage() = runTest {
        val fleet = FleetController(backgroundScope)
        var status = JSONObject("""{"status":"running","elapsedMs":63000}""")
        fleet.open("agents") { type, _ -> when (type) {
            "agents.list" -> JSONObject("""{"runs":[{"agentRunId":"run","label":"Review","status":"running","selectedModel":"gpt-5","elapsedMs":61000,"usage":{"totalTokens":1250}}],"nextOffset":null}""")
            "agents.status" -> status
            else -> JSONObject()
        } }
        runCurrent()
        val run = fleet.state.value.runs.single()
        assertEquals(61000L, run.elapsedMs); assertEquals(1250L, run.totalTokens)
        assertEquals("gpt-5 · 1.3k tokens · 1m 1s", fleetRunMetadata(run))
        fleet.select(run); runCurrent()
        assertEquals(63000L, fleet.state.value.selected!!.elapsedMs)
        assertEquals(1250L, fleet.state.value.selected!!.totalTokens)
        status = JSONObject("""{"status":"completed","elapsedMs":70000,"usage":{"totalTokens":2000}}""")
        fleet.refresh(); runCurrent()
        assertEquals(2000L, fleet.state.value.selected!!.totalTokens)
        assertEquals(70000L, fleet.state.value.selected!!.elapsedMs)
        assertEquals("", fleetRunMetadata(FleetRun("empty", "Empty", "queued", "", "")))
    }
    @Test fun failedDefinitionLoadCannotLaunchUnreviewedWorkflow() = runTest {
        var started = false
        val fleet = FleetController(backgroundScope)
        fleet.open("workflows") { type, _ ->
            if (type == "definition") error("Offline")
            if (type == "workflows.run") started = true
            JSONObject()
        }
        runCurrent(); fleet.definition(FleetDefinition("review", "Review", true, "")); runCurrent()
        assertFalse(fleet.state.value.definitionReady)
        fleet.launch(""); runCurrent()
        assertFalse(started)
    }
    @Test fun leavingARunIgnoresEvenANoncancellableLateResponse() = runTest {
        lateinit var pending: Continuation<JSONObject>
        val fleet = FleetController(backgroundScope)
        fleet.open("agents") { type, _ -> if (type == "agents.status") suspendCoroutine { pending = it } else JSONObject() }
        runCurrent()
        fleet.select(FleetRun("old", "Old run", "running", "", "")); runCurrent()
        assertEquals("old", fleet.state.value.selected?.id)
        assertTrue(fleet.back())
        pending.resume(JSONObject("""{"status":"completed","result":{"text":"Late result"}}""")); runCurrent()
        assertNull(fleet.state.value.selected); assertEquals("", fleet.state.value.output); assertFalse(fleet.state.value.busy)
        assertFalse(fleet.back())
    }
    @Test fun failedFollowUpKeepsDraftButAcceptedSendSurvivesRefreshFailure() = runTest {
        var rejectSend = true; var rejectList = false; var draft = "Please check tests"
        val fleet = FleetController(backgroundScope)
        fleet.open("agents") { type, _ ->
            if (type == "agents.send" && rejectSend) error("Disconnected")
            if (type == "agents.list" && rejectList) error("Refresh failed")
            JSONObject()
        }
        runCurrent(); fleet.select(FleetRun("run", "Review", "running", "", "")); runCurrent()
        fleet.action("send", draft) { draft = "" }; runCurrent()
        assertEquals("Please check tests", draft)
        rejectSend = false; rejectList = true
        fleet.action("send", draft) { draft = "" }; runCurrent()
        assertEquals("", draft); assertEquals("Refresh failed", fleet.state.value.error)
    }
    @Test fun transcriptAndCanonicalResultRemainSeparateAcrossRefresh() = runTest {
        val fleet = FleetController(backgroundScope)
        fleet.open("agents") { type, _ -> when(type) {
            "agents.status" -> JSONObject("""{"status":"completed","result":{"text":"**Finished**"},"error":null}""")
            "agents.transcript" -> JSONObject("""{"entries":[{"message":{"role":"assistant","content":"Working notes"}}]}""")
            else -> JSONObject()
        } }
        runCurrent(); fleet.select(FleetRun("run", "Review", "running", "", "")); runCurrent()
        fleet.transcript(); runCurrent(); fleet.refresh(); runCurrent()
        assertEquals("**Finished**", fleet.state.value.output)
        assertTrue(fleet.state.value.transcript!!.contains("Working notes")); assertEquals("", fleet.state.value.runError)
    }
    @Test fun agentCardsAndActionsUseCanonicalRunIdentifiers() = runTest {
        val calls = mutableListOf<Pair<String, JSONObject>>()
        val fleet = FleetController(backgroundScope)
        fleet.open("agents") { type, payload ->
            calls.add(type to payload)
            when (type) {
                "agents.list" -> JSONObject("""{"definitions":[{"name":"reviewer","description":"Review","runnable":true,"tools":["read"]}],"runs":[{"agentRunId":"run-1","label":"Review files","status":"running","goal":"Find defects"}],"nextOffset":null}""")
                "agents.status" -> JSONObject("""{"status":"running","goal":"Find defects","sessionFile":"private-host-path"}""")
                else -> JSONObject()
            }
        }
        runCurrent(); assertEquals("Review files", fleet.state.value.runs.single().name)
        fleet.select(fleet.state.value.runs.single()); runCurrent()
        assertTrue(fleet.state.value.detail.contains("Find defects")); assertFalse(fleet.state.value.detail.contains("private-host-path"))
        fleet.action("send", "Check errors too"); runCurrent()
        val sent = calls.single { it.first == "agents.send" }.second
        assertEquals("run-1", sent.getString("agentRunId")); assertEquals("Check errors too", sent.getString("message"))
    }
    @Test fun workflowStartsOnlyAfterTheExplicitLaunchAction() = runTest {
        val calls = mutableListOf<Pair<String, JSONObject>>()
        val fleet = FleetController(backgroundScope)
        fleet.open("workflows") { type, payload ->
            calls.add(type to payload)
            if (type == "definition") JSONObject("""{"definition":{"source":"review source","budgets":{"maxCalls":4}}}""")
            else JSONObject("""{"definitions":[{"name":"review","description":"Review","runnable":true}],"runs":[],"nextOffset":null}""")
        }
        runCurrent(); fleet.definition(fleet.state.value.definitions.single()); runCurrent()
        assertEquals("review source", fleet.state.value.source); assertFalse(calls.any { it.first == "workflows.run" })
        fleet.launch("", JSONObject().put("maxAgents", 2)); runCurrent()
        val action = calls.single { it.first == "workflows.run" }.second
        assertTrue(action.getBoolean("approved")); assertTrue(action.getBoolean("background")); assertEquals(2, action.getJSONObject("args").getInt("maxAgents"))
    }
}
