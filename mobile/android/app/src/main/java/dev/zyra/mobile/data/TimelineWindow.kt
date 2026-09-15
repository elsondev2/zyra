package dev.zyra.mobile.data

/** Eviction is allowed only when the PC supplied a durable history locator.
 * Live-only rows and pending work stay in memory until canonical history proves
 * they can be recovered. Explicitly loaded history stays put while being read.
 */
object TimelineWindow {
    private const val MAX_ITEMS = 240
    private const val MAX_CHARACTERS = 400_000L

    private fun size(item: TimelineItem) = item.text.length.toLong() + item.raw.length + item.reasoning.length

    fun canPrefill(view: SessionView) = view.items.size < MAX_ITEMS && view.items.sumOf(::size) < MAX_CHARACTERS

    fun canCache(view: SessionView) = view.items.size <= MAX_ITEMS * 2 && view.items.sumOf(::size) <= MAX_CHARACTERS * 2

    fun needsContext(view: SessionView?) = view == null || view.items.isEmpty() ||
        view.olderCursor != null && view.items.count { it.role == "user" && !it.pending } < 3

    private fun contextStart(view: SessionView): Int {
        var characters = 0L
        var prompts = 0
        var start = -1
        for (index in view.items.indices.reversed()) {
            characters += size(view.items[index])
            if (view.items.size - index > MAX_ITEMS * 2 || characters > MAX_CHARACTERS * 2) break
            if (view.items[index].role == "user" && !view.items[index].pending) {
                start = index
                if (++prompts == 3) break
            }
        }
        return start
    }

    fun trim(view: SessionView, followingLatest: Boolean = true, maxItems: Int = MAX_ITEMS,
             maxCharacters: Long = MAX_CHARACTERS): SessionView {
        if (!followingLatest || view.items.size < 2) return view
        var characters = view.items.sumOf(::size)
        var removed = 0
        var before = view.olderCursor?.toLongOrNull() ?: 0L
        // JSON history includes each body once; the rendered cache also stores
        // its extracted text. Do not immediately evict the prompt that made a
        // bounded history preview coherent. This is a soft target only: unusually
        // large turns still obey a separate hard ceiling and stay pageable.
        val retainedContext = if (maxItems == MAX_ITEMS && maxCharacters == MAX_CHARACTERS) contextStart(view) else -1
        while (removed < view.items.lastIndex &&
            (view.items.size - removed > maxItems || characters > maxCharacters)) {
            if (retainedContext >= 0 && removed >= retainedContext) break
            val item = view.items[removed]
            val index = item.historyIndex ?: break
            if (item.pending || item.kind == "stream" || index < before) break
            // before is exclusive: the last removed row must be reloadable.
            before = index + 1
            characters -= size(item)
            removed++
        }
        return if (removed == 0) view else view.copy(items = view.items.drop(removed), olderCursor = before.toString())
    }
}
