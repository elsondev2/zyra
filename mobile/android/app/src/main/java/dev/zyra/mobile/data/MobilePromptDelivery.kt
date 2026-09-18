package dev.zyra.mobile.data

import org.json.JSONObject

/** Acceptance renders immediately; only the canonical message settles the durable outbox. */
object MobilePromptDelivery {
    fun confirmedOperation(envelope: JSONObject): String? {
        val event = envelope.optJSONObject("event") ?: return null
        if (event.optString("type") !in setOf("message_start", "message_end")) return null
        val message = event.optJSONObject("message") ?: return null
        if (message.optString("role") != "user" || message.opt("display") == false) return null
        val turn = envelope.optJSONObject("requestContext")?.optString("turnId").orEmpty()
        return turn.takeIf { it.startsWith("mobile:") && it.length > 7 }?.removePrefix("mobile:")
    }

    fun visiblePending(pending: List<PendingSend>, items: List<TimelineItem>): List<PendingSend> {
        if (pending.isEmpty()) return pending
        val visibleTurns = items.asSequence().filter { it.role == "user" }.mapNotNull { item ->
            if (item.id.startsWith("accepted:")) item.id.removePrefix("accepted:")
            else runCatching { JSONObject(item.raw).optString("_mobileTurnId") }.getOrNull()
        }.toSet()
        return pending.filterNot { "mobile:" + it.id in visibleTurns }
    }
}
