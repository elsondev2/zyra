package dev.zyra.mobile

import dev.zyra.mobile.data.*
import org.junit.Assert.*
import org.junit.Test

class TimelineViewportTest {
    @Test fun contentPaddingItemsNeverBecomeThePrependAnchor() {
        val anchor = TimelineAnchor.capture(3, 47, listOf(2 to "under-header", 3 to "reading", 4 to "answer"))!!
        assertEquals("reading", anchor.key)
        assertEquals(47, anchor.scrollOffset)
        assertEquals(5 to 47, anchor.position(listOf("older1", "older2", "older3", "older4", "under-header", "reading", "answer")))
    }
    @Test fun passiveLayoutOrPrependAtBottomNeverResumesFollowingWhileReading() {
        val reading = TimelineScrollIntent().reading()
        assertFalse(reading.settled(atBottom = true).followingLatest)
        assertFalse(reading.userScroll(30f).settled(atBottom = true).followingLatest)
    }
    @Test fun onlyUserMovementTowardLatestCanResumeFollowingAtTheEnd() {
        val towardEnd = TimelineScrollIntent().reading().userScroll(-20f)
        assertTrue(towardEnd.settled(atBottom = true).followingLatest)
        val stoppedEarlier = towardEnd.settled(atBottom = false)
        assertFalse(stoppedEarlier.followingLatest)
        assertFalse(stoppedEarlier.settled(atBottom = true).followingLatest)
        assertEquals(stoppedEarlier, stoppedEarlier.userScroll(0f))
    }

    @Test fun collapsedGroupCannotPullEveryOlderPageWithoutAnotherUserGesture() {
        val gate = TimelinePagingGate()
        assertFalse(gate.request("120", following = false, gesture = 0))
        assertTrue(gate.request("120", following = false, gesture = 1))
        assertFalse(gate.request("80", following = false, gesture = 1))
        assertFalse(gate.request("40", following = false, gesture = 1))
        assertTrue(gate.request("80", following = false, gesture = 2))
        // A failed request can be retried deliberately without reopening.
        assertTrue(gate.request("80", following = false, gesture = 3))
    }
    @Test fun automaticFillRemainsBoundedWithoutConsumingTheFirstReadingGesture() {
        val gate = TimelinePagingGate()
        repeat(6) { assertTrue(gate.request("${1000 - it * 40}", true, 0)) }
        assertFalse(gate.request("760", true, 0))
        assertTrue(gate.request("760", false, 1))
    }
    @Test fun prependedRowsAndDisappearingSpinnerKeepTheSameContentKeyAndPixelOffset() {
        val anchor = TimelineAnchor("work:10", 87)
        assertEquals(3 to 87, anchor.position(listOf("history:earlier", "user:0", "work:0", "work:10", "answer")))
        assertEquals(2 to 87, anchor.position(listOf("user:0", "work:0", "work:10", "answer")))
        assertNull(anchor.position(listOf("new-chat")))
    }

    private val view = SessionView("chat", items = (0..39).map { TimelineItem("tool:$it", "tool", "Read a file", kind = "tool") }, olderCursor = "100")
    private val short = TimelineViewport(0, 4, false, false)

    @Test fun `collapsed event-heavy history fills a short viewport without requiring a swipe`() {
        assertTrue(short.needsOlder(view, following = true, busy = false, loading = false))
        assertFalse(short.copy(canScrollBack = true).needsOlder(view, true, false, false))
        assertFalse(short.copy(canScrollForward = true).needsOlder(view, true, false, false))
    }
    @Test fun `initial fill waits for attachment and layout and never overlaps history requests`() {
        assertFalse(short.needsOlder(view, true, true, false))
        assertFalse(short.needsOlder(view, true, false, true))
        assertFalse(short.copy(total = 0).needsOlder(view, true, false, false))
        assertFalse(short.needsOlder(view.copy(olderCursor = null), true, false, false))
    }
    @Test fun `automatic fill is bounded while explicitly reading can load earlier pages`() {
        val large = view.copy(items = (0..239).map { TimelineItem("m:$it", "user", "Message") })
        assertFalse(short.needsOlder(large, true, false, false))
        assertFalse(short.needsOlder(view.copy(items = listOf(TimelineItem("big", "assistant", "x".repeat(400000)))), true, false, false))
        assertTrue(short.needsOlder(large, false, false, false))
        assertFalse(short.copy(first = 5).needsOlder(large, false, false, false))
    }
}
