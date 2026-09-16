package dev.zyra.mobile

import dev.zyra.mobile.ui.ChatPreferencesController
import dev.zyra.mobile.data.ChatConfiguration
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ChatPreferencesTest {
    @Test fun olderHostsShowAnActionableUpdateMessage() = runTest {
        val controller = ChatPreferencesController(this)
        controller.open { _, _ -> throw IllegalStateException("Bridge request type is not allowed: preferences.get.") }
        advanceUntilIdle()
        assertEquals("Update Zyra on this PC to use speaking styles and memory settings.", controller.state.value.error)
        assertFalse(controller.state.value.loaded)
        assertFalse(controller.state.value.busy)
    }
    private fun snapshot() = JSONObject("""{"profile":"concise","memoryMode":"enabled","profiles":[{"name":"concise","description":"Concise style"},{"name":"friendly","description":"Friendly style"}]}""")

    @Test fun oldPcResponseCannotPopulateTheNewChat() = runTest {
        val old = CompletableDeferred<JSONObject>()
        val controller = ChatPreferencesController(this)
        controller.open { _, _ -> withContext(NonCancellable) { old.await() } }
        runCurrent()
        controller.open { _, _ -> snapshot().put("profile", "friendly") }
        runCurrent(); old.complete(snapshot()); advanceUntilIdle()
        assertEquals("friendly", controller.state.value.profile)
        assertTrue(controller.state.value.loaded)
    }

    @Test fun newerSharedMemoryChangeWinsOverDelayedSaveAndDoubleTaps() = runTest {
        val save = CompletableDeferred<JSONObject>()
        val calls = mutableListOf<String>()
        val controller = ChatPreferencesController(this)
        controller.open { type, payload ->
            calls += type
            if (type == "preferences.get") snapshot() else { assertFalse(payload.getBoolean("enabled")); save.await() }
        }
        runCurrent(); controller.setMemory(false); controller.setMemory(false); runCurrent()
        assertEquals(listOf("preferences.get", "memory.configure"), calls)
        controller.event(JSONObject().put("type", "session_memory").put("memoryMode", "enabled"))
        save.complete(JSONObject().put("memoryMode", "disabled")); advanceUntilIdle()
        assertEquals("enabled", controller.state.value.memoryMode)
        assertFalse(controller.state.value.saving)
    }

    @Test fun liveProfileAndMemoryUpdatesWinOverOldInitialRead() = runTest {
        val read = CompletableDeferred<JSONObject>()
        val controller = ChatPreferencesController(this)
        controller.open { _, _ -> read.await() }; runCurrent()
        controller.event(JSONObject().put("type", "session_config").put("profile", "friendly"))
        controller.event(JSONObject().put("type", "session_memory").put("memoryMode", "disabled"))
        read.complete(snapshot()); advanceUntilIdle()
        assertEquals("friendly", controller.state.value.profile)
        assertEquals("disabled", controller.state.value.memoryMode)
    }

    @Test fun onlyListedProfilesCanBeChosenAndActualProfilePersistsInSessionConfig() = runTest {
        val calls = mutableListOf<JSONObject>()
        val controller = ChatPreferencesController(this)
        controller.open { type, payload -> if (type == "preferences.get") snapshot() else {
            calls += payload; JSONObject().put("config", JSONObject().put("profile", "friendly"))
        } }
        runCurrent(); controller.setProfile("unknown"); controller.setProfile("friendly"); advanceUntilIdle()
        assertEquals(1, calls.size); assertEquals("friendly", calls.single().getString("profile"))
        assertEquals("friendly", controller.state.value.profile)
        val configured = ChatConfiguration().merge(JSONObject().put("profile", "friendly"))
        assertEquals(configured, ChatConfiguration().merge(configured.encode()))
    }
}
