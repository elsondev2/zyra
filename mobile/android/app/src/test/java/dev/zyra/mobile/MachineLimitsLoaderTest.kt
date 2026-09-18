package dev.zyra.mobile

import dev.zyra.mobile.data.ConnectionState
import dev.zyra.mobile.network.MachineLimitsLoader
import kotlinx.coroutines.*
import kotlinx.coroutines.test.runTest
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class MachineLimitsLoaderTest {
    @Test fun startupAndReconnectWaitWithoutErrorThenRequestTheConnectedMachine() = runTest {
        val requested = mutableListOf<String>()
        val request: suspend (String) -> JSONObject = { requested += it; JSONObject().put("available", true) }
        for (status in listOf(null, ConnectionState.Connecting, ConnectionState.Reconnecting)) {
            val result = MachineLimitsLoader.load("pc", status, request)
            assertTrue(result.waiting); assertNull(result.error); assertNull(result.data)
        }
        assertTrue(requested.isEmpty())
        val result = MachineLimitsLoader.load("pc", ConnectionState.Connected, request)
        assertEquals(listOf("pc"), requested); assertTrue(result.data!!.getBoolean("available"))
        assertFalse(result.waiting); assertNull(result.error)
    }
    @Test fun unpairedAndKnownOfflineNeverRequestAccountData() = runTest {
        val request: suspend (String) -> JSONObject = { fail("Not connected"); JSONObject() }
        assertNull(MachineLimitsLoader.load(null, null, request).error)
        assertTrue(MachineLimitsLoader.load("pc", ConnectionState.Offline, request).error!!.contains("Connect"))
    }
    @Test fun requestTimeoutIsVisibleButScreenCancellationStillPropagates() = runTest {
        val result = MachineLimitsLoader.load("pc", ConnectionState.Connected) { withTimeout(1) { delay(2); JSONObject() } }
        assertTrue(result.error!!.contains("too long"))
        try {
            withTimeout(1) { MachineLimitsLoader.load("pc", ConnectionState.Connected) { delay(2); JSONObject() } }
            fail("Parent cancellation was swallowed")
        } catch (_: TimeoutCancellationException) { }
    }
    @Test fun cancelledRequestCannotPublishALateGenericError() = runTest {
        var publishedError: String? = null
        val job = launch { publishedError = (MachineLimitsLoader.load("pc", ConnectionState.Connected) { withContext(NonCancellable) { delay(10); throw IllegalStateException("Late failure") } }).error }
        testScheduler.runCurrent()
        job.cancel()
        testScheduler.advanceUntilIdle()
        job.join()
        assertNull("A cancelled owner must not replace the current page error", publishedError)
    }

}
