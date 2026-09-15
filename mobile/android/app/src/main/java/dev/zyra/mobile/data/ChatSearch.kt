package dev.zyra.mobile.data

import org.json.JSONObject

data class ChatSearchMatch(val chat: Chat, val threadId: String, val messageId: String, val role: String, val snippet: String) {
    val key get() = chat.key + ":" + messageId
    companion object {
        fun parse(value: JSONObject, machine: String) = ChatSearchMatch(Chat.parse(value.getJSONObject("chat"), machine), value.getString("threadId"), value.getString("messageId"), value.optString("role"), value.optString("snippet"))
    }
}
data class ChatSearchPage(val query: String, val matches: List<ChatSearchMatch>, val indexing: Boolean = false, val available: Boolean = true)
