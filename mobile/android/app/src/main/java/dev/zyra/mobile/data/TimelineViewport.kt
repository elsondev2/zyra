package dev.zyra.mobile.data

/** Paging follows rendered geometry: many canonical actions may occupy one
 * collapsed work row. Raw event count alone cannot decide whether a screen is full. */
data class TimelineViewport(val first: Int, val total: Int, val canScrollBack: Boolean, val canScrollForward: Boolean) {
    fun needsOlder(view: SessionView, following: Boolean, busy: Boolean, loading: Boolean): Boolean {
        if (busy || loading || view.olderCursor == null || total == 0) return false
        if (!following) return first <= 2
        return !canScrollBack && !canScrollForward && TimelineWindow.canPrefill(view)
    }
}

/** A changed history cursor is a result, not a fresh request to scroll. A
 * collapsed work group can absorb an entire page without moving any row. */
class TimelinePagingGate {
    private var consumedGesture = 0
    private var automaticPages = 0
    private var automaticCursor: String? = null

    fun request(cursor: String, following: Boolean, gesture: Int): Boolean {
        if (following) {
            if (automaticPages >= 6 || automaticCursor == cursor) return false
            automaticCursor = cursor
            automaticPages++
        } else {
            if (gesture <= consumedGesture) return false
            consumedGesture = gesture
        }
        return true
    }
}

data class TimelineAnchor(val key: String, val scrollOffset: Int) {
    companion object {
        fun capture(firstVisibleIndex: Int, scrollOffset: Int, laidOutKeys: List<Pair<Int, String>>): TimelineAnchor? =
            laidOutKeys.firstOrNull { it.first == firstVisibleIndex }?.second?.takeUnless { it == "timeline:tail" }
                ?.let { TimelineAnchor(it, scrollOffset) }
    }
    fun position(keys: List<String>): Pair<Int, Int>? = keys.indexOf(key).takeIf { it >= 0 }?.let { it to scrollOffset }
}

/** Only a deliberate scroll toward the end can resume following. Layout changes
 * from paging, collapsing work or the keyboard are not user scroll intent. */
data class TimelineScrollIntent(val followingLatest: Boolean = true, val towardLatest: Boolean = false) {
    fun reading() = TimelineScrollIntent(false)
    fun userScroll(deltaY: Float) = if (deltaY == 0f) this else TimelineScrollIntent(false, deltaY < 0f)
    fun settled(atBottom: Boolean) = if (towardLatest && atBottom) TimelineScrollIntent() else copy(towardLatest = false)
}
