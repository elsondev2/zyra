package dev.zyra.mobile.data

import org.json.JSONObject

data class AccountLimitGroup(val label: String, val windows: List<JSONObject>)

object AccountLimitPresentation {
    /** Legacy gateways split primary/weekly windows into separate rows for the same model. */
    fun groups(result: JSONObject?): List<AccountLimitGroup> {
        val groups = result?.optJSONArray("groups") ?: return emptyList()
        val grouped = linkedMapOf<String, MutableList<JSONObject>>()
        for (i in 0 until minOf(groups.length(), 32)) {
            val group = groups.optJSONObject(i) ?: continue
            val label = group.optString("label").takeIf { it.isNotBlank() && it != "null" } ?: "Account"
            val windows = group.optJSONArray("windows") ?: continue
            for (j in 0 until minOf(windows.length(), 8)) windows.optJSONObject(j)?.let { grouped.getOrPut(label) { mutableListOf() }.add(it) }
        }
        return grouped.map { (label, windows) -> AccountLimitGroup(label, windows.toList()) }
    }
    fun remaining(window: JSONObject): Double? = (window.opt("remainingPercent") as? Number)?.toDouble()?.takeIf { it.isFinite() }?.coerceIn(0.0, 100.0)
}
