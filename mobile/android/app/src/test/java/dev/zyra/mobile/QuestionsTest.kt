package dev.zyra.mobile
import dev.zyra.mobile.data.QuestionSpec
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
class QuestionsTest {
    private fun question(extra: String) = QuestionSpec.parse(JSONObject("{\"id\":\"q\",\"question\":\"Choose\"," + extra + "}"))
    @Test fun multiSelectionPreservesConstraints() {
        val q = question("\"type\":\"multi_select\",\"minSelections\":2,\"options\":[{\"label\":\"A\"},{\"label\":\"B\"}]")
        assertNotNull(q.validate(listOf("A"))); assertNull(q.validate(listOf("A", "B"))); assertNotNull(q.validate(listOf("A", "X")))
    }
    @Test fun numbersAndDatesAreValidated() {
        val q = question("\"type\":\"number\",\"min\":2,\"max\":4")
        assertNotNull(q.validate(listOf("NaN"))); assertNotNull(q.validate(listOf("5"))); assertNull(q.validate(listOf("3")))
        val date = question("\"type\":\"date\""); assertNotNull(date.validate(listOf("2026-02-30"))); assertNull(date.validate(listOf("2026-02-28")))
    }
    @Test fun rankingRequiresEveryOptionOnce() {
        val q = question("\"type\":\"ranking\",\"options\":[{\"label\":\"A\"},{\"label\":\"B\"}]")
        assertNotNull(q.validate(listOf("A", "A"))); assertNull(q.validate(listOf("B", "A")))
    }
}
