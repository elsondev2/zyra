package dev.zyra.mobile.data

import org.json.JSONArray
import org.json.JSONObject

data class QuestionAnswer(val question: String, val answer: String)

/** Match only the canonical continuation format to its immediately preceding question set. */
object QuestionResponses {
    fun project(items: List<TimelineItem>): Map<String, List<QuestionAnswer>> {
        val result = mutableMapOf<String, List<QuestionAnswer>>()
        var questions: JSONArray? = null
        var answers: JSONObject? = null
        for (item in items) {
            val raw = runCatching { JSONObject(item.raw) }.getOrNull() ?: JSONObject()
            val message = raw.optJSONObject("message") ?: raw
            if (item.role == "user") {
                val specs = questions
                if (specs != null && item.text.startsWith("Here are my answers:\n")) {
                    val parsed = parseContinuation(specs, item.text, answers)
                    if (parsed.isNotEmpty()) result[item.id] = parsed
                }
                questions = null; answers = null
                continue
            }
            if (raw.optString("type") == "user_input_requested" || raw.optString("type") == "user_input_resolved") {
                raw.optJSONArray("questions")?.let { questions = it }
                raw.optJSONObject("answers")?.let { answers = it }
            }
            val content = message.optJSONArray("content")
            for (i in 0 until (content?.length() ?: 0)) {
                val part = content?.optJSONObject(i) ?: continue
                if (part.optString("type") == "toolCall" && part.optString("name") == "request_user_input") {
                    questions = part.optJSONObject("arguments")?.optJSONArray("questions"); answers = null
                }
            }
            if (message.optString("toolName") == "request_user_input") {
                message.optJSONObject("details")?.let { details ->
                    details.optJSONArray("questions")?.let { questions = it }
                    details.optJSONObject("answers")?.let { answers = it }
                }
            }
        }
        return result
    }
    private fun parseContinuation(questions: JSONArray, text: String, answers: JSONObject?): List<QuestionAnswer> {
        val specs = (0 until questions.length()).mapNotNull { questions.optJSONObject(it) }
        if (specs.isEmpty()) return emptyList()
        var remaining = text.substringAfter("Here are my answers:\n").trimStart('\n')
        val result = mutableListOf<QuestionAnswer>()
        for ((index, question) in specs.withIndex()) {
            val header = question.optString("header").ifBlank { question.optString("label") }.ifBlank { "Question ${index + 1}" }
            val prefix = "- $header: "
            if (!remaining.startsWith(prefix)) return emptyList()
            remaining = remaining.removePrefix(prefix)
            val next = specs.getOrNull(index + 1)?.let { "\n- ${it.optString("header").ifBlank { it.optString("label") }.ifBlank { "Question ${index + 2}" }}: " }
            val end = if (next == null) remaining.length else remaining.indexOf(next).takeIf { it >= 0 } ?: return emptyList()
            val literal = remaining.substring(0, end)
            val structured = answers?.opt(question.optString("id"))
            val answer = when (structured) { is JSONArray -> (0 until structured.length()).joinToString(if (question.optString("type") == "ranking") " → " else ", ") { structured.optString(it) }; is String -> structured; else -> literal }
            val title = question.optString("question").ifBlank { question.optString("prompt") }
            if (title.isBlank()) return emptyList()
            result.add(QuestionAnswer(title, answer))
            remaining = remaining.substring(end).trimStart('\n')
        }
        return result
    }
}
