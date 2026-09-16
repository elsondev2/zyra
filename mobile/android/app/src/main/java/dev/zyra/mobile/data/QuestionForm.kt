package dev.zyra.mobile.data

import org.json.JSONArray
import org.json.JSONObject

/** Serializable, request-scoped answers; recommended choices are never submitted implicitly. */
object QuestionForm {
    fun questions(raw: String): List<QuestionSpec> = runCatching {
        val array = JSONObject(raw).optJSONArray("questions") ?: JSONArray()
        (0 until array.length()).map { QuestionSpec.parse(array.getJSONObject(it)) }
    }.getOrDefault(emptyList())
    fun values(serialized: String, id: String): List<String> = runCatching {
        val array = JSONObject(serialized).optJSONArray(id) ?: JSONArray()
        (0 until array.length()).map(array::getString)
    }.getOrDefault(emptyList())
    fun change(serialized: String, id: String, values: List<String>): String =
        JSONObject(serialized).put(id, JSONArray(values)).toString()
    fun valid(questions: List<QuestionSpec>, serialized: String) = questions.isNotEmpty() &&
        questions.all { it.validate(values(serialized, it.id)) == null }
    fun response(questions: List<QuestionSpec>, serialized: String): JSONObject {
        require(valid(questions, serialized)) { "Complete the required answers first." }
        return JSONObject().apply { questions.forEach { question ->
            val values = values(serialized, question.id).filter(String::isNotBlank)
            put(question.id, if (question.arrayAnswer) JSONArray(values) else values.firstOrNull().orEmpty())
        } }
    }
}
