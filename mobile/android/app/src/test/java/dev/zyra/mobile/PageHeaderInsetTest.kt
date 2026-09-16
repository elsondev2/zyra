package dev.zyra.mobile

import dev.zyra.mobile.data.PageHeaderInset
import org.junit.Assert.assertEquals
import org.junit.Test

class PageHeaderInsetTest {
    @Test fun coldMeasurementAndFontChangesUpdateActivePage() {
        val inset = PageHeaderInset()
        assertEquals(0f, inset.resolve(true, 0f), 0f)
        assertEquals(96f, inset.resolve(true, 96f), 0f)
        assertEquals(112f, inset.resolve(true, 112f), 0f)
    }
    @Test fun outgoingPageDoesNotMoveWithReplacementHeader() {
        val outgoing = PageHeaderInset()
        outgoing.resolve(true, 96f)
        assertEquals(96f, outgoing.resolve(false, 0f), 0f)
        assertEquals(96f, outgoing.resolve(false, 120f), 0f)
        assertEquals(120f, outgoing.resolve(true, 120f), 0f)
    }
}
