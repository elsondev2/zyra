package dev.zyra.mobile

import dev.zyra.mobile.data.AccountLimitPresentation
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class AccountLimitPresentationTest {
    @Test fun legacyWindowsGroupByAccountModelWithoutCombiningTheirAllowances() {
        val source = JSONObject("""{"groups":[{"id":"weekly","label":"Codex","windows":[{"remainingPercent":71,"durationMinutes":10080}]},{"id":"spark-hourly","label":"Spark","windows":[{"remainingPercent":97,"durationMinutes":300}]},{"id":"spark-weekly","label":"Spark","windows":[{"remainingPercent":63,"durationMinutes":10080}]}]}""")
        val groups = AccountLimitPresentation.groups(source)
        assertEquals(listOf("Codex", "Spark"), groups.map { it.label })
        assertEquals(listOf(97.0, 63.0), groups.last().windows.map(AccountLimitPresentation::remaining))
        assertEquals(listOf(300, 10080), groups.last().windows.map { it.getInt("durationMinutes") })
        assertEquals(3, source.getJSONArray("groups").length())
    }
    @Test fun unavailableAllowanceNeverBecomesZeroOrFull() {
        assertNull(AccountLimitPresentation.remaining(JSONObject()))
        assertNull(AccountLimitPresentation.remaining(JSONObject().put("remainingPercent", JSONObject.NULL)))
        assertNull(AccountLimitPresentation.remaining(JSONObject().put("remainingPercent", "unknown")))
        assertEquals(0.0, AccountLimitPresentation.remaining(JSONObject().put("remainingPercent", -10)))
        assertEquals(100.0, AccountLimitPresentation.remaining(JSONObject().put("remainingPercent", 110)))
    }
    @Test fun malformedEmptyAndPartialGroupsRemainSafe() {
        assertTrue(AccountLimitPresentation.groups(null).isEmpty())
        assertTrue(AccountLimitPresentation.groups(JSONObject("""{"groups":[null,{}, {"label":"No windows","windows":[]}]}""")).isEmpty())
        val groups = AccountLimitPresentation.groups(JSONObject("""{"groups":[{"label":null,"windows":[null,{"remainingPercent":null}]}]}"""))
        assertEquals("Account", groups.single().label)
        assertNull(AccountLimitPresentation.remaining(groups.single().windows.single()))
    }
}
