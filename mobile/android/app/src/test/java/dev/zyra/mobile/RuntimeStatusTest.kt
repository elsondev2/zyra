package dev.zyra.mobile

import dev.zyra.mobile.data.RuntimeConnection
import dev.zyra.mobile.data.RuntimePhase
import dev.zyra.mobile.data.RuntimeStatus
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RuntimeStatusTest {
    @Test fun `missing hello runtime status stays unknown`() {
        val status = RuntimeStatus.fromHello(JSONObject())
        assertFalse(status.known)
        assertEquals(RuntimePhase.Unknown, status.phase)
    }

    @Test fun `phone freshness does not depend on matching the PC clock`() {
        val payload = JSONObject("""{"phase":"ready","connection":"connected","lastConfirmedAt":"2026-01-01T00:00:00Z"}""")
        val serverTime = java.time.Instant.parse("2026-01-01T00:00:02Z").toEpochMilli()
        val localTime = serverTime + 3600000
        val status = RuntimeStatus.from(payload, serverTime, localTime)
        assertTrue(status.isLive(localTime))
        assertEquals("Live", status.syncLabel(localTime))
        assertFalse(status.isLive(localTime + 46000))
        assertEquals("Status stale", status.syncLabel(localTime + 46000))
        assertEquals("Disconnected", status.copy(connection = RuntimeConnection.Disconnected).syncLabel(localTime))
    }

    @Test fun `runtime event accepts bounded public instance metadata`() {
        val status = RuntimeStatus.fromEvent(JSONObject("""{"phase":"ready","connection":"connected","updatePending":true,"instance":{"instanceId":"runtime-7","channel":"stable"},"installation":{"kind":"installed","label":"Zyra","appVersion":"1.2.3"}}"""))
        assertTrue(status.known)
        assertEquals(RuntimePhase.Ready, status.phase)
        assertEquals(RuntimeConnection.Connected, status.connection)
        assertEquals("runtime-7", status.instance?.instanceId)
        assertEquals("Zyra", status.installation?.label)
    }
}
