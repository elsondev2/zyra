package dev.zyra.mobile.data

import org.json.JSONObject

/** Display-only; leave canonical/raw envelopes untouched for the agent. */
object BrowserContext {
    private val block = Regex("(?:^|\\r?\\n\\r?\\n)<browser-context>([\\s\\S]*?)</browser-context>(?=\\s*(?:$|Attached files \\())")
    fun display(text: String): String = block.replace(text) { match ->
        var fence: String? = null
        text.take(match.range.first).lineSequence().forEach { line ->
            Regex("^ {0,3}(`{3,}|~{3,})(.*)$").matchEntire(line)?.let { f ->
                val run = f.groupValues[1]; val previous = fence
                if (previous == null) fence = run
                else if (run.first() == previous.first() && run.length >= previous.length && f.groupValues[2].isBlank()) fence = null
            }
        }
        val valid = runCatching {
            val c = JSONObject(match.groupValues[1])
            fun target(id: String) = Regex("control-target:chrome-tab:[a-zA-Z0-9-]+").matches(id)
            val targets = c.optJSONArray("targets")
            c.optString("source") == "Zyra Chrome sidebar" && (target(c.optString("targetId")) || targets != null && targets.length() > 0 && (0 until targets.length()).all { target(targets.optJSONObject(it)?.optString("targetId").orEmpty()) })
        }.getOrDefault(false)
        if (fence == null && valid) "" else match.value
    }
}
