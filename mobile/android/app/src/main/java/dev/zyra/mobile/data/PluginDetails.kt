package dev.zyra.mobile.data

import org.json.JSONObject

data class InstalledPluginInfo(val id: String, val name: String, val title: String, val state: String, val version: String, val activeReleaseId: String, val source: String)
data class SavedPluginVersion(val id: String, val version: String, val installedAt: String, val current: Boolean)
data class PluginReleaseInfo(val id: String, val version: String, val digest: String, val installedAt: String, val description: String,
    val fileCount: Int, val bytes: Long, val executableFiles: Boolean, val skills: List<Pair<String,String>>, val capabilities: List<String>, val contributions: List<Pair<String,String>>)
data class PluginDetails(val revision: Long, val manageMachine: Boolean, val plugin: InstalledPluginInfo, val release: PluginReleaseInfo, val releases: List<SavedPluginVersion>) {
    companion object {
        private fun JSONObject.rows(key: String) = optJSONArray(key)?.let { values -> (0 until values.length()).mapNotNull { values.optJSONObject(it) } }.orEmpty()
        fun parse(value: JSONObject): PluginDetails {
            val plugin = value.getJSONObject("plugin"); val release = value.getJSONObject("release")
            return PluginDetails(value.getLong("revision"), value.optBoolean("manageMachine"),
                InstalledPluginInfo(plugin.getString("id"),plugin.optString("name"),plugin.optString("title"),plugin.optString("state"),plugin.optString("version"),plugin.optString("activeReleaseId"),plugin.optString("source")),
                PluginReleaseInfo(release.getString("id"),release.optString("version"),release.getString("digest"),release.optString("installedAt"),release.optString("description"),release.optInt("fileCount"),release.optLong("bytes"),release.optBoolean("executableFiles"),
                    release.rows("skills").map { it.optString("name") to it.optString("description") },
                    release.optJSONArray("capabilities")?.let { items -> (0 until items.length()).map { items.optString(it) } }.orEmpty(),
                    release.rows("contributions").map { it.optString("kind") to it.optString("support") }),
                value.rows("releases").map { SavedPluginVersion(it.getString("id"),it.optString("version"),it.optString("installedAt"),it.optBoolean("current")) })
        }
    }
}
