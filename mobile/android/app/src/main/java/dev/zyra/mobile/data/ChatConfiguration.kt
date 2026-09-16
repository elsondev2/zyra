package dev.zyra.mobile.data

import org.json.JSONObject

data class ChatConfiguration(val model: String = "", val thinking: String = "", val runtimeMode: String = "", val webSearch: Boolean = false, val webFetch: Boolean = false, val profile: String = "") {
    fun merge(source: JSONObject): ChatConfiguration {
        val value = source.optJSONObject("config") ?: source
        fun text(key: String, previous: String) = if (value.has(key) && !value.isNull(key)) value.optString(key) else previous
        val modelValue = value.optJSONObject("model")
        return copy(model = modelValue?.optString("id") ?: text("model", model), thinking = text("thinking", thinking), runtimeMode = text("runtimeMode", runtimeMode), profile = text("profile", profile),
            webSearch = if (value.has("webSearch")) value.optBoolean("webSearch") else webSearch, webFetch = if (value.has("webFetch")) value.optBoolean("webFetch") else webFetch)
    }
    fun encode(): JSONObject = JSONObject().put("model", model).put("thinking", thinking).put("runtimeMode", runtimeMode).put("webSearch", webSearch).put("webFetch", webFetch).put("profile", profile)
}

/** Unknown or not-yet-loaded permissions must never look like granted access. */
fun permissionLabel(mode: String): String = when (mode) {
    "approval-required" -> "Ask before actions"
    "auto-review" -> "Automatic review"
    "edits-only" -> "Allow file edits"
    "full-access" -> "Full access"
    else -> "Permissions unavailable"
}
