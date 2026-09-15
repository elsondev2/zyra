package dev.zyra.mobile.network

import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import org.json.JSONArray
import org.json.JSONObject

/** Cold history can be shown before runtime startup, but only a history read
 * after the attachment snapshot may become the synchronized timeline. */
object SessionHydration {
    private const val RECENT_TURNS = 3

    suspend fun load(id: String?, params: JSONObject, cold: Boolean, request: suspend (String, JSONObject) -> JSONObject, preview: (JSONObject) -> Unit,
                     visibleStart: Long? = null, needsContext: Boolean = cold): Pair<JSONObject, JSONObject?> = coroutineScope {
        val attach = async { request("session.attach", params) }
        // A page is 40 raw events, not 40 visible messages. Tool-heavy turns
        // collapse to one row and a long final response can fill the viewport
        // alone. Load conversation context before revealing the cold snapshot,
        // independently of whether the user scrolls or runtime startup finishes.
        var previewStart: Long? = null
        if ((cold || needsContext) && id != null) refreshHistory(id, null, request)?.let { history ->
            val entries = history.optJSONArray("entries")
            previewStart = entries?.let { rows -> (0 until rows.length()).mapNotNull {
                (rows.optJSONObject(it)?.opt("historyEntryIndex") as? Number)?.toLong()
            }.minOrNull() }
            preview(history)
        }
        val attached = attach.await()
        val canonical = attached.getString("canonicalChatId")
        val history = refreshHistory(canonical, (visibleStart ?: previewStart).takeIf { canonical == id }, request)
        attached to history
    }

    /** Keep the cached window on screen until its visible range is refreshed.
     * Re-read durable rows instead of merging potentially stale cached turns.
     * Include recent user turns even when a cached or cold page contains only
     * one long response. Work is bounded; older history remains pageable. */
    private suspend fun refreshHistory(id: String, visibleStart: Long?, request: suspend (String, JSONObject) -> JSONObject): JSONObject? {
        suspend fun page(before: Long? = null): JSONObject? = request("catalog.history", JSONObject().put("session", id).put("limit", 40).apply {
            if (before != null) put("before", before.toString())
        }).optJSONObject("history")
        val latest = page() ?: return null
        var entries = latest.optJSONArray("entries") ?: JSONArray()
        var info = latest.optJSONObject("pageInfo") ?: return latest
        var characters = entries.toString().length
        var reads = 1
        fun userTurns(rows: JSONArray) = (0 until rows.length()).count {
            val entry = rows.optJSONObject(it)
            entry?.optString("type") == "message" && entry.optJSONObject("message")?.optString("role") == "user"
        }
        var turns = userTurns(entries)
        while (reads < 6 && entries.length() < 480 && characters < 400_000) {
            val before = info.optString("oldestCursor").toLongOrNull() ?: break
            if (before <= 0 || (turns >= RECENT_TURNS && (visibleStart == null || before <= visibleStart))) break
            val older = page(before) ?: break
            reads++
            val olderInfo = older.optJSONObject("pageInfo") ?: break
            // A rewritten/truncated file cannot be spliced into this snapshot.
            if (olderInfo.optString("endCursor").toLongOrNull() != before) return page()
            val next = olderInfo.optString("oldestCursor").toLongOrNull()
            if (next != null && next >= before) break
            val preceding = older.optJSONArray("entries") ?: break
            val added = preceding.toString().length
            if (entries.length() + preceding.length() > 480 || characters + added > 400_000) break
            val current = entries
            entries = JSONArray().apply {
                for (i in 0 until preceding.length()) put(preceding.get(i))
                for (i in 0 until current.length()) put(current.get(i))
            }
            characters += added
            turns += userTurns(preceding)
            info = JSONObject(olderInfo.toString()).put("endCursor", latest.optJSONObject("pageInfo")?.opt("endCursor"))
                .put("totalEntries", latest.optJSONObject("pageInfo")?.opt("totalEntries"))
            latest.put("entries", entries).put("pageInfo", info)
        }
        return latest
    }
}
