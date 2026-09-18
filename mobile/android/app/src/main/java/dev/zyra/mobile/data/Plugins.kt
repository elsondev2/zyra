package dev.zyra.mobile.data

import org.json.JSONObject

data class ChatPlugin(val id: String, val name: String, val version: String, val releaseId: String, val state: String)
data class AvailablePlugin(val id: String, val name: String, val description: String, val version: String, val state: String, val selectable: Boolean, val skillCount: Int, val contributions: List<Pair<String, String>>)
data class PluginCatalog(val revision: Long = 0, val defaultsRevision: Long = 1, val defaultsKind: String = "project", val defaultIds: Set<String> = emptySet(),
    val defaults: List<ChatPlugin> = emptyList(), val current: List<ChatPlugin> = emptyList(), val plugins: List<AvailablePlugin> = emptyList(),
    val manageDefaults: Boolean = false, val manageMachine: Boolean = false, val selectionLimit: Int = 24, val nextCursor: String? = null, val total: Int = 0, val viewVersion: String = "", val hasChat: Boolean = true) {
    val differs get() = hasChat && current.map { it.id to it.releaseId }.toSet() != defaults.filter { it.state == "active" }.map { it.id to it.releaseId }.toSet()
    companion object {
        private fun list(value: JSONObject?, key: String): List<JSONObject> = value?.optJSONArray(key)?.let { rows -> (0 until rows.length()).mapNotNull { rows.optJSONObject(it) } }.orEmpty()
        private fun chat(value: JSONObject) = ChatPlugin(value.getString("id"), value.optString("name"), value.optString("version"), value.optString("releaseId"), value.optString("state"))
        fun parse(value: JSONObject): PluginCatalog {
            val defaults = value.getJSONObject("defaults")
            return PluginCatalog(value.getLong("revision"), defaults.getLong("revision"), defaults.optString("kind"),
                defaults.optJSONArray("pluginIds")?.let { ids -> (0 until ids.length()).map { ids.getString(it) }.toSet() }.orEmpty(),
                list(defaults, "plugins").map(::chat), list(value.optJSONObject("scope"), "plugins").map(::chat),
                list(value, "plugins").map { plugin -> AvailablePlugin(plugin.getString("id"), plugin.optString("name"), plugin.optString("description"), plugin.optString("version"), plugin.optString("state"), plugin.optBoolean("selectable"), plugin.optInt("skillCount"), list(plugin, "contributions").map { it.optString("kind") to it.optString("support") }) },
                value.optBoolean("manageDefaults"), value.optBoolean("manageMachine"), value.optInt("selectionLimit", 24), value.optString("nextCursor").takeIf { it.isNotBlank() && it != "null" }, value.optInt("total"), value.optString("viewVersion"), value.optBoolean("hasChat", true))
        }
    }
}
