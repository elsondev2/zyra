package dev.zyra.mobile.data

import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate

data class QuestionOption(val label: String, val description: String, val recommended: Boolean)
data class QuestionSpec(val id: String, val title: String, val type: String, val options: List<QuestionOption>, val required: Boolean,
    val allowOther: Boolean, val multiple: Boolean, val min: Double?, val max: Double?, val minSelections: Int, val maxSelections: Int?, val placeholder: String) {
    val arrayAnswer get() = type in listOf("multi_select", "file_select", "ranking")
    fun validate(values: List<String>): String? {
        val selected = values.filter { it.isNotBlank() }
        if (selected.isEmpty()) return if (required) "An answer is required." else null
        if (type == "ranking") return if (selected.toSet().size == options.size && selected.size == options.size && selected.all { value -> options.any { it.label == value } }) null else "Rank every option once."
        if (arrayAnswer) {
            if (selected.size < maxOf(if (required) 1 else 0, minSelections)) return "Choose at least "+maxOf(if (required) 1 else 0, minSelections)+"."
            if (maxSelections != null && selected.size > maxSelections) return "Choose no more than $maxSelections."
            if (type == "file_select" && !multiple && selected.size > 1) return "Choose one file."
        }
        if (type in listOf("single_select", "multi_select", "file_select", "confirm") && !allowOther && selected.any { answer -> options.none { it.label == answer } }) return "Choose from the available options."
        if (type == "number") {
            val number = selected.first().toDoubleOrNull()
            if (number == null || !number.isFinite()) return "Enter a number."
            if (min != null && number < min) return "Enter at least $min."
            if (max != null && number > max) return "Enter no more than $max."
        }
        if (type == "date" && runCatching { LocalDate.parse(selected.first()) }.isFailure) return "Use a valid date: YYYY-MM-DD."
        return null
    }
    companion object {
        fun parse(value: JSONObject): QuestionSpec {
            val type = value.optString("type", "text")
            val array = value.optJSONArray("options") ?: JSONArray()
            var options = (0 until array.length()).map { index ->
                val item = array.optJSONObject(index)
                QuestionOption(item?.optString("label") ?: array.optString(index), item?.optString("description").orEmpty(), item?.optBoolean("recommended") == true)
            }
            if (type == "confirm" && options.size < 2) options = listOf(QuestionOption("Yes", "", false), QuestionOption("No", "", false))
            return QuestionSpec(value.getString("id"), value.optString("question"), type, options, value.optBoolean("required", true),
                value.optBoolean("allowOther"), value.optBoolean("multiple"), value.optDouble("min").takeIf { it.isFinite() }, value.optDouble("max").takeIf { it.isFinite() },
                value.optInt("minSelections", 0), value.optInt("maxSelections", -1).takeIf { it >= 0 }, value.optString("placeholder"))
        }
    }
}
