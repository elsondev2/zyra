package dev.zyra.mobile.data

import org.json.JSONObject

private fun JSONObject.rows(key: String) = optJSONArray(key)?.let { values -> (0 until values.length()).mapNotNull { values.optJSONObject(it) } }.orEmpty()
private fun JSONObject.strings(key: String) = optJSONArray(key)?.let { values -> (0 until values.length()).map { values.optString(it) } }.orEmpty()
data class StorePlugin(val name: String, val title: String, val description: String, val detail: String, val version: String, val publisher: String, val category: String,
    val license: String, val sourceUrl: String, val hasSkills: Boolean, val installable: Boolean, val contributions: List<String>, val installedVersion: String = "", val installedState: String = "")
data class PluginStoreCatalog(val revision: String = "", val manageMachine: Boolean = false, val categories: List<String> = emptyList(), val entries: List<StorePlugin> = emptyList(), val nextCursor: String? = null, val total: Int = 0) {
    companion object { fun parse(value: JSONObject) = PluginStoreCatalog(value.optString("revision"), value.optBoolean("manageMachine"), value.strings("categories"),
        value.rows("entries").map { StorePlugin(it.getString("name"), it.optString("title"), it.optString("description"), it.optString("detail"), it.optString("version"), it.optString("publisher"), it.optString("category"), it.optString("license"), it.optString("sourceUrl"), it.optBoolean("hasSkills"), it.optBoolean("installable"), it.strings("contributions"), it.optString("installedVersion"), it.optString("installedState")) },
        value.optString("nextCursor").takeIf { it.isNotBlank() && it != "null" }, value.optInt("total")) }
}
data class PluginInstallReview(val id: String, val expiresAt: String, val title: String, val version: String, val digest: String, val description: String,
    val fileCount: Int, val bytes: Long, val executableFiles: Boolean, val capabilities: List<String>, val skillCount: Int, val skills: List<Pair<String, String>>, val contributions: List<Pair<String, String>>, val diagnosticCount: Int, val notes: List<String> = emptyList())
data class PluginDownload(val id: String, val status: String, val phase: String = "metadata", val completedBytes: Long = 0, val totalBytes: Long = 0, val completedFiles: Int = 0, val totalFiles: Int = 0, val review: PluginInstallReview? = null, val error: String? = null) {
    companion object { fun parse(value: JSONObject): PluginDownload {
        val progress = value.optJSONObject("progress")
        val review = value.optJSONObject("review")?.let { PluginInstallReview(it.getString("id"), it.getString("expiresAt"), it.optString("title"), it.optString("version"), it.getString("digest"), it.optString("description"), it.optInt("fileCount"), it.optLong("bytes"), it.optBoolean("executableFiles"), it.strings("capabilities"), it.optInt("skillCount"), it.rows("skills").map { row -> row.optString("name") to row.optString("description") }, it.rows("contributions").map { row -> row.optString("kind") to row.optString("support") }, it.optInt("diagnosticCount"), it.strings("notes")) }
        return PluginDownload(value.getString("id"), value.getString("status"), progress?.optString("phase") ?: "metadata", progress?.optLong("completedBytes") ?: 0, progress?.optLong("totalBytes") ?: 0, progress?.optInt("completedFiles") ?: 0, progress?.optInt("totalFiles") ?: 0, review, value.optString("error").takeIf { it.isNotBlank() && it != "null" })
    } }
}
