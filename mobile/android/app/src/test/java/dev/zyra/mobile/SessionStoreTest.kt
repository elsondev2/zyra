package dev.zyra.mobile

import dev.zyra.mobile.lifecycle.SessionStore
import org.junit.Assert.*
import org.junit.Test

class SessionStoreTest {
    private class Session : AutoCloseable { var closed = 0; override fun close() { closed++ } }
    @Test fun `call outlives activity and reopened UI observes the same session`() {
        val store = SessionStore { Session() }
        val activity = store.acquire(); val service = store.acquire()
        activity.close(); activity.close()
        assertEquals(0, service.value.closed)
        val reopened = store.acquire(); assertSame(service.value, reopened.value)
        service.close(); assertEquals(0, reopened.value.closed)
        reopened.close(); assertEquals(1, reopened.value.closed)
        val fresh = store.acquire(); assertNotSame(reopened.value, fresh.value)
        fresh.close()
    }
    @Test fun `task removal retains session until service transcript drain finishes`() {
        val store = SessionStore { Session() }
        val ui = store.acquire(); val call = store.acquire()
        ui.close(); assertEquals(0, call.value.closed)
        call.close(); assertEquals(1, call.value.closed)
        call.close(); assertEquals(1, call.value.closed)
    }
}
