package dev.zyra.mobile.data

/** Disk restoration may finish after typing (including deleting the whole draft). */
class DraftHydration(private val openingRevision: Long) {
    fun restore(currentRevision: Long, current: String, saved: String) = if (currentRevision == openingRevision) saved else current
    fun attached(requestedId: String?, canonicalId: String, currentRevision: Long, current: String, saved: String) =
        if (requestedId == null || requestedId == canonicalId) current else restore(currentRevision, current, saved)
}
