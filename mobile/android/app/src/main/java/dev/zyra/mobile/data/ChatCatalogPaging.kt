package dev.zyra.mobile.data

object ChatCatalogPaging {
    /** UI paging observes the actual remaining cursors, even when a local filter
     * hides every fetched row. Length prefixes make arbitrary cursor text safe. */
    fun cursor(pages: Map<String, ChatPage>, machine: String?, query: String): String? = pages.entries
        .filter { (id, page) -> (machine == null || id == machine) && page.query == query && page.nextCursor != null }
        .sortedBy { it.key }
        .joinToString("") { (id, page) -> val next = page.nextCursor!!; "${id.length}:$id${next.length}:$next" }
        .takeIf { it.isNotEmpty() }
}
