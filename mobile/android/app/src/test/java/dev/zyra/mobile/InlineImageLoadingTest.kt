package dev.zyra.mobile

import dev.zyra.mobile.network.MediaDownloads
import dev.zyra.mobile.ui.imageNearViewport
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.nio.file.Files
import java.security.MessageDigest
import java.util.Base64

class InlineImageLoadingTest {
    @Test fun onlyTilesNearViewportLoadIncludingInsideOneLargeWorkRow() {
        fun visible(y: Float, height: Float = 90f) = imageNearViewport(20f, y, 120f, height, 0f, 30f, 400f, 800f, 180f)
        assertTrue(visible(40f))
        assertTrue(visible(900f))
        assertFalse(visible(1200f))
        assertFalse(visible(-400f))
        assertFalse(visible(0f, 0f))
        assertTrue(visible(600f)) // A previously offscreen tile returns after scrolling.
    }
    @Test fun cancelledOffscreenDownloadResumesAndConcurrentTilesReuseLargeImage() = runTest {
        val directory = Files.createTempDirectory("zyra-inline-images").toFile()
        try {
            val bytes = ByteArray(700_000) { (it % 87).toByte() }
            val sha = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
            val ref = JSONObject().put("bytes", bytes.size).put("sha256", sha)
            val downloads = MediaDownloads(directory)
            val secondChunk = CompletableDeferred<Unit>()
            val cancelled = launch {
                downloads.load("pc", "chat", ref, { method, params ->
                    assertEquals("media.chunk", method)
                    if (params.getLong("offset") > 0) { secondChunk.complete(Unit); awaitCancellation() }
                    JSONObject().put("base64", Base64.getEncoder().encodeToString(bytes.copyOfRange(0, 49152))).put("next", 49152).put("total", bytes.size).put("sha256", sha)
                }) { _, _ -> }
            }
            secondChunk.await()
            cancelled.cancelAndJoin()
            assertNull(downloads.cached("pc", ref))
            assertEquals(49152L, directory.listFiles()!!.single().length())
            val offsets = mutableListOf<Long>()
            val request: suspend (String, JSONObject) -> JSONObject = { _, params ->
                assertEquals("chat", params.getString("session"))
                val offset = params.getLong("offset"); offsets.add(offset)
                val next = minOf(offset.toInt() + 49152, bytes.size)
                JSONObject().put("base64", Base64.getEncoder().encodeToString(bytes.copyOfRange(offset.toInt(), next))).put("next", next).put("total", bytes.size).put("sha256", sha)
            }
            val first = async { downloads.load("pc", "chat", ref, request) { _, _ -> } }
            val second = async { downloads.load("pc", "chat", ref, request) { _, _ -> } }
            assertEquals(first.await(), second.await())
            assertEquals(49152L, offsets.first())
            assertEquals((bytes.size + 49151) / 49152 - 1, offsets.size)
            assertArrayEquals(bytes, first.await().readBytes())
            assertEquals(first.await(), downloads.cached("pc", ref))
            assertNull(downloads.cached("other-pc", ref))
        } finally { directory.deleteRecursively() }
    }
}
