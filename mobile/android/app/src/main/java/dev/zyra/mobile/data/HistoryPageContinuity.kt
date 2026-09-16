package dev.zyra.mobile.data

import org.json.JSONObject

/** An exclusive cursor must meet the previous window exactly. Rewritten or
 * non-progressing pages must not be spliced into the currently visible chat. */
object HistoryPageContinuity {
    fun accepts(cursor: String, history: JSONObject): Boolean {
        val before = cursor.toLongOrNull() ?: return false
        val info = history.optJSONObject("pageInfo") ?: return false
        if (info.optString("endCursor").toLongOrNull() != before) return false
        val next = info.optString("oldestCursor").toLongOrNull()
        if (next != null && (next < 0 || next >= before)) return false
        val entries = history.optJSONArray("entries") ?: return false
        return (0 until entries.length()).all { index ->
            val locator = (entries.optJSONObject(index)?.opt("historyEntryIndex") as? Number)?.toLong()
            locator == null || (locator >= 0 && locator < before && (next == null || locator >= next))
        }
    }
}
