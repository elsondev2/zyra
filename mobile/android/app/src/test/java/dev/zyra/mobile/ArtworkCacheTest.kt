package dev.zyra.mobile

import dev.zyra.mobile.data.ArtworkCache
import dev.zyra.mobile.data.ProjectArtworkKey
import dev.zyra.mobile.data.ProjectMark
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test
import java.util.concurrent.atomic.AtomicInteger

class ArtworkCacheTest {
    @Test fun repeatedRowsShareOneDecodeAndWarmPeek() = runBlocking {
        val cache = ArtworkCache<String, String>()
        val decoded = AtomicInteger()
        val callerThread = Thread.currentThread()
        val decoders = mutableSetOf<Thread>()
        val rows = List(60) { async { cache.load("react") {
            decoded.incrementAndGet()
            decoders.add(Thread.currentThread())
            "pixels"
        } } }.awaitAll()
        assertEquals(List(60) { "pixels" }, rows)
        assertEquals(1, decoded.get())
        assertFalse(decoders.contains(callerThread))
        assertEquals("pixels", cache.peek("react"))
        repeat(60) { assertEquals("pixels", cache.load("react") { error("Warm scrolling must not decode") }) }
    }

    @Test fun missingArtworkIsCachedAndEvictionHonorsRecentUse() = runBlocking {
        val cache = ArtworkCache<String, String>(2)
        val attempts = AtomicInteger()
        repeat(30) { assertNull(cache.load("missing") { attempts.incrementAndGet(); null }) }
        assertEquals(1, attempts.get())
        cache.load("one") { "1" }
        cache.peek("missing") // Missing art consumes a bounded entry as well.
        cache.load("two") { "2" }
        assertNull(cache.peek("one"))
        assertEquals("2", cache.peek("two"))
        assertNull(cache.load("missing") { error("Recent negative result must stay cached") })
    }

    @Test fun cancelledDecoderDoesNotPoisonTheNextLoad() = runBlocking {
        val cache = ArtworkCache<String, String>()
        try {
            cache.load("icon") { throw CancellationException("Row removed") }
            fail("Cancellation must propagate")
        } catch (_: CancellationException) { }
        assertEquals("retry", cache.load("icon") { "retry" })
    }

    @Test fun sameArtworkAcrossProjectsSharesPixelsButChangedBytesDoNot() {
        val first = ProjectMark(encoded = "image", slug = "react", color = "#ffffff", name = "First", projectId = "one")
        val second = first.copy(color = "#000000", name = "Second", projectId = "two", preferred = true)
        assertEquals(ProjectArtworkKey.from(first), ProjectArtworkKey.from(second))
        assertNotEquals(ProjectArtworkKey.from(first), ProjectArtworkKey.from(second.copy(encoded = "changed")))
        assertNotEquals(ProjectArtworkKey.from(first), ProjectArtworkKey.from(second.copy(slug = "folder")))
    }
}
