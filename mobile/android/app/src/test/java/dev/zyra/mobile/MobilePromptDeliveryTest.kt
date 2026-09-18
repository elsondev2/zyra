package dev.zyra.mobile

import dev.zyra.mobile.data.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class MobilePromptDeliveryTest {
    private fun event(type: String, role: String = "user", turn: String = "mobile:send") = JSONObject()
        .put("requestContext", JSONObject().put("turnId", turn))
        .put("event", JSONObject().put("type", type).put("message", JSONObject().put("role", role)))

    @Test fun startupAndCompactionNeverSettleTheOutbox() {
        for (type in listOf("agent_start", "compaction_start", "compaction_end", "zyra_server_prompt_accepted"))
            assertNull(MobilePromptDelivery.confirmedOperation(event(type)))
        assertEquals("send", MobilePromptDelivery.confirmedOperation(event("message_start")))
        assertEquals("send", MobilePromptDelivery.confirmedOperation(event("message_end")))
        assertNull(MobilePromptDelivery.confirmedOperation(event("message_start", "assistant")))
        assertNull(MobilePromptDelivery.confirmedOperation(event("message_start", turn = "desktop:send")))
    }

    @Test fun acceptedAndCanonicalRowsSuppressOnlyTheMatchingPendingPreview() {
        val pending = listOf(PendingSend("send", "same", "sending"), PendingSend("other", "same", "sending"))
        val accepted = TimelineItem("accepted:mobile:send", "user", "same")
        assertEquals(listOf("other"), MobilePromptDelivery.visiblePending(pending, listOf(accepted)).map { it.id })
        val canonical = TimelineItem("message:user:1", "user", "same", raw = JSONObject().put("_mobileTurnId", "mobile:send").toString())
        assertEquals(listOf("other"), MobilePromptDelivery.visiblePending(pending, listOf(canonical)).map { it.id })
        assertEquals(pending, MobilePromptDelivery.visiblePending(pending, listOf(TimelineItem("message:user:2", "user", "same"))))
        assertEquals(2, pending.size)
    }
}
