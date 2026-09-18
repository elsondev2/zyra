package dev.zyra.mobile.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/** Small immutable artwork cache. Cold work suspends instead of occupying one IO thread per row. */
internal class ArtworkCache<K : Any, V : Any>(private val capacity: Int = 96) {
    init { require(capacity > 0) }
    private data class Entry<V>(val value: V?)
    private val entries = LinkedHashMap<K, Entry<V>>(capacity, .75f, true)
    private val loading = Mutex()

    @Synchronized fun peek(key: K): V? = entries[key]?.value
    @Synchronized private fun entry(key: K): Entry<V>? = entries[key]
    @Synchronized private fun put(key: K, value: V?) {
        entries[key] = Entry(value)
        while (entries.size > capacity) entries.remove(entries.keys.first())
    }

    suspend fun load(key: K, decode: () -> V?): V? {
        entry(key)?.let { return it.value }
        return loading.withLock {
            entry(key)?.let { return@withLock it.value }
            withContext(Dispatchers.Default) { decode() }.also { put(key, it) }
        }
    }

    /** Layoutlib previews run synchronously; production never decodes on the UI thread. */
    fun preview(key: K, decode: () -> V?): V? {
        entry(key)?.let { return it.value }
        return decode().also { put(key, it) }
    }
}

/** Labels and tint do not affect pixels. Sharing an icon across projects needs only one decode. */
internal data class ProjectArtworkKey(val encoded: String, val mime: String, val slug: String) {
    companion object {
        fun from(mark: ProjectMark) = ProjectArtworkKey(mark.encoded, mark.mime, mark.slug)
    }
}
