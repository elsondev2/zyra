package dev.zyra.mobile.data

import org.json.JSONObject

data class CapturedEdit(val text: String, val unified: Boolean)

/** Use the recorded result, never an intended edit from arguments or the current file. */
fun capturedEdit(raw: String): CapturedEdit? {
    val event = runCatching { JSONObject(raw) }.getOrNull() ?: return null
    val result = event.optJSONObject("result") ?: event.optJSONObject("partialResult")
        ?: event.optJSONObject("message") ?: event
    val details = result.optJSONObject("details") ?: return null
    (details.opt("patch") as? String)?.takeIf { it.isNotBlank() }?.let { return CapturedEdit(it, true) }
    return (details.opt("diff") as? String)?.takeIf { it.isNotBlank() }?.let {
        CapturedEdit(it, it.lineSequence().any { line -> line.startsWith("@@ ") })
    }
}

/** Older Pi transcripts contain signed, numbered lines instead of a unified patch. */
fun capturedEditRows(edit: CapturedEdit): List<GitDiffRow> {
    if (edit.unified) return gitDiffRows(edit.text)
    val numbered = Regex("^([+\\- ])\\s*(\\d+) (.*)$")
    return edit.text.lineSequence().filter { it.isNotEmpty() }.map { line ->
        val match = numbered.matchEntire(line)
        val number = match?.groupValues?.get(2)?.toIntOrNull()
        if (match == null || number == null) GitDiffRow(line, GitDiffKind.NOTE)
        else when (match.groupValues[1]) {
            "+" -> GitDiffRow(match.groupValues[3], GitDiffKind.ADD, after = number)
            "-" -> GitDiffRow(match.groupValues[3], GitDiffKind.REMOVE, before = number)
            else -> GitDiffRow(match.groupValues[3], GitDiffKind.CONTEXT, after = number)
        }
    }.toList()
}
