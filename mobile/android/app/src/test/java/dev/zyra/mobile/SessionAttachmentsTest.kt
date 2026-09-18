package dev.zyra.mobile

import dev.zyra.mobile.network.SessionAttachments
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SessionAttachmentsTest {
    @Test fun abandonedAttachIsDetachedBeforeNewChatCanAttach() = runTest {
        val ready = CompletableDeferred<Unit>()
        val calls = mutableListOf<String>()
        val attachments = SessionAttachments { method, params ->
            val id = params.optString("session", params.optString("sessionKey"))
            calls += "$method:$id"
            if (method == "session.attach" && id == "old") ready.await()
            JSONObject().put("sessionKey", id)
        }
        val old = launch { attachments.attach(JSONObject().put("session", "old")) }
        runCurrent(); old.cancel()
        val fresh = async { attachments.attach(JSONObject().put("session", "new")) }
        runCurrent()
        assertEquals(listOf("session.attach:old"), calls)
        ready.complete(Unit); advanceUntilIdle()
        assertEquals(listOf("session.attach:old", "session.detach:old", "session.attach:new"), calls)
        assertEquals("new", fresh.await().getString("sessionKey"))
        assertTrue(old.isCancelled)
    }
    @Test fun cleanupRechecksWhetherUserReturnedToSameChat() = runTest {
        val ready = CompletableDeferred<Unit>()
        val calls = mutableListOf<String>()
        val attachments = SessionAttachments { method, _ ->
            calls += method
            if (method == "session.attach") ready.await()
            JSONObject().put("sessionKey", "same")
        }
        val attach = launch { attachments.attach(JSONObject().put("session", "same")) }
        runCurrent()
        var unwanted = true
        val cleanup = launch { attachments.detach("same") { unwanted } }
        runCurrent(); unwanted = false; ready.complete(Unit); advanceUntilIdle()
        assertEquals(listOf("session.attach"), calls)
        attach.join(); cleanup.join()
    }
}
