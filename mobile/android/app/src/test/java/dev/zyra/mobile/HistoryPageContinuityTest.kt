package dev.zyra.mobile

import dev.zyra.mobile.data.HistoryPageContinuity
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class HistoryPageContinuityTest {
    private fun page(end: Int, next: Int?, indices: List<Int>) = JSONObject()
        .put("pageInfo", JSONObject().put("endCursor", "$end").put("oldestCursor", next?.toString() ?: JSONObject.NULL))
        .put("entries", JSONArray(indices.map { JSONObject().put("historyEntryIndex", it) }))
    @Test fun exclusivePagesMeetTheVisibleWindowAndMoveBackwards() {
        assertTrue(HistoryPageContinuity.accepts("80", page(80, 40, listOf(40, 50, 79))))
        assertTrue(HistoryPageContinuity.accepts("40", page(40, null, listOf(0, 20, 39))))
    }
    @Test fun rewrittenDuplicateAndOutOfWindowPagesAreRejected() {
        assertFalse(HistoryPageContinuity.accepts("80", page(30, null, listOf(0, 29))))
        assertFalse(HistoryPageContinuity.accepts("80", page(80, 80, listOf(80))))
        assertFalse(HistoryPageContinuity.accepts("80", page(80, 40, listOf(39, 79))))
        assertFalse(HistoryPageContinuity.accepts("80", page(80, 40, listOf(40, 80))))
    }
}
