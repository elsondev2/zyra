package dev.zyra.mobile

import dev.zyra.mobile.data.ConnectionState
import dev.zyra.mobile.network.MachineUsageLoader
import kotlinx.coroutines.*
import kotlinx.coroutines.test.runTest
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class MachineUsageLoaderTest {
    @Test fun connectionWaitAndOfflineNeverFetchOrPublish() = runTest {
        val request: suspend (String, String) -> JSONObject = { _, _ -> fail("Not connected"); JSONObject() }
        for (status in listOf(null, ConnectionState.Connecting, ConnectionState.Reconnecting)) {
            val result = MachineUsageLoader.load("pc", status, "zyra", request) { fail("No data") }
            assertTrue(result.waiting); assertNull(result.error)
        }
        assertNotNull(MachineUsageLoader.load("pc", ConnectionState.Offline, "zyra", request) {}.error)
    }
    @Test fun partialHistoryContinuesOnlyBoundedSlicesAndKeepsTheSameMachineAndHarness() = runTest {
        var calls = 0; val frames = mutableListOf<JSONObject>()
        val result = MachineUsageLoader.load("pc", ConnectionState.Connected, "claude", { machine, harness ->
            assertEquals("pc", machine); assertEquals("claude", harness); calls++
            JSONObject().put("indexing", true).put("bytesRead", 1024)
        }, { frames += it })
        assertNull(result.error); assertEquals(8, calls); assertEquals(8, frames.size)
    }
    @Test fun finishedAndUnproductiveSlicesStopWithoutExtraRequests() = runTest {
        for (reply in listOf(JSONObject().put("indexing", false), JSONObject().put("indexing", true).put("bytesRead", 0), JSONObject().put("indexing", true).put("limited", true).put("bytesRead", 400))) {
            var calls = 0
            MachineUsageLoader.load("pc", ConnectionState.Connected, "zyra", { _, _ -> calls++; reply }) {}
            assertEquals(1, calls)
        }
    }
    @Test fun timeoutIsVisibleAndCancelledOwnershipNeverPublishesLateData() = runTest {
        val failure = MachineUsageLoader.load("pc", ConnectionState.Connected, "zyra", { _, _ -> withTimeout(1) { delay(2); JSONObject() } }) {}
        assertTrue(failure.error!!.contains("too long"))
        var published = false
        val job = launch { MachineUsageLoader.load("pc", ConnectionState.Connected, "zyra", { _, _ -> withContext(NonCancellable) { delay(10); JSONObject() } }) { published = true } }
        testScheduler.runCurrent(); job.cancelAndJoin(); assertFalse(published)
    }
    @Test fun cancelledRequestCannotPublishALateGenericError() = runTest {
        var publishedError: String? = null
        val job = launch { publishedError = (MachineUsageLoader.load("pc", ConnectionState.Connected, "zyra", { _, _ -> withContext(NonCancellable) { delay(10); throw IllegalStateException("Late failure") } }) {}).error }
        testScheduler.runCurrent()
        job.cancel()
        testScheduler.advanceUntilIdle()
        job.join()
        assertNull("A cancelled owner must not replace the current page error", publishedError)
    }

}
