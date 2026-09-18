package dev.zyra.mobile

import dev.zyra.mobile.data.RemoteImageDownloads
import kotlinx.coroutines.*
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.*
import org.junit.Test
import java.nio.file.Files
import java.util.concurrent.TimeUnit

class RemoteImageDownloadsTest {
    @Test fun explicitLoadCachesPerOwnerAndNeverSendsCookies() = runBlocking {
        val directory = Files.createTempDirectory("remote-images").toFile()
        val server = MockWebServer(); server.start()
        try {
            val downloads = RemoteImageDownloads(directory, { check(it.readText() == "image") })
            assertEquals(0, server.requestCount)
            server.enqueue(MockResponse().setHeader("Content-Type", "image/png").setHeader("Set-Cookie", "private=secret").setBody("image"))
            val url = server.url("/one.png").toString()
            assertEquals("image", downloads.load(url, "phone:a").readText())
            assertEquals(1, server.requestCount)
            assertEquals("image", downloads.load(url, "phone:a").readText())
            assertEquals(1, server.requestCount)
            server.enqueue(MockResponse().setHeader("Content-Type", "image/png").setBody("image"))
            downloads.load(url, "phone:b")
            repeat(2) {
                val request = server.takeRequest(1, TimeUnit.SECONDS)!!
                assertNull(request.getHeader("Cookie")); assertNull(request.getHeader("Authorization")); assertNull(request.getHeader("Referer"))
            }
        } finally { server.shutdown(); directory.deleteRecursively() }
    }
    @Test fun rejectsRedirectsTypesOversizeAndEvictsBoundedCache() = runBlocking {
        val directory = Files.createTempDirectory("remote-images").toFile()
        val server = MockWebServer(); server.start()
        try {
            val downloads = RemoteImageDownloads(directory, {}, byteLimit = 5, cacheLimit = 6)
            for (response in listOf(MockResponse().setResponseCode(302).setHeader("Location", "/private"),
                MockResponse().setHeader("Content-Type", "text/html").setBody("hi"),
                MockResponse().setHeader("Content-Type", "image/png").setBody("123456"),
                MockResponse().setHeader("Content-Type", "image/png").setChunkedBody("123456", 2))) {
                server.enqueue(response)
                try { downloads.load(server.url("/bad").toString(), "a"); fail("Should reject response") } catch (_: IllegalStateException) {}
            }
            assertEquals(4, server.requestCount)
            assertTrue(directory.listFiles().orEmpty().isEmpty())
            repeat(3) { server.enqueue(MockResponse().setHeader("Content-Type", "image/png").setBody("1234")); downloads.load(server.url("/$it").toString(), "a") }
            assertTrue(directory.listFiles().orEmpty().sumOf { it.length() } <= 6L)
        } finally { server.shutdown(); directory.deleteRecursively() }
    }
    @Test fun cancellationClosesTransferAndDoesNotPublishPartialImage() = runBlocking {
        val directory = Files.createTempDirectory("remote-images").toFile()
        val server = MockWebServer(); server.start()
        try {
            val downloads = RemoteImageDownloads(directory, {})
            server.enqueue(MockResponse().setHeader("Content-Type", "image/png").setBody("abcdefghijklmnop").throttleBody(1, 300, TimeUnit.MILLISECONDS))
            val cancellationErrors = java.util.concurrent.CopyOnWriteArrayList<Throwable>()
            val pending = launch(CoroutineExceptionHandler { _, error -> cancellationErrors.add(error) }) { downloads.load(server.url("/slow").toString(), "old-owner") }
            withContext(Dispatchers.IO) { assertNotNull(server.takeRequest(2, TimeUnit.SECONDS)) }
            pending.cancelAndJoin()
            withTimeout(2000) { while (directory.listFiles().orEmpty().isNotEmpty()) delay(20) }
            assertEquals(0, directory.listFiles().orEmpty().size)
            assertTrue(cancellationErrors.toString(), cancellationErrors.isEmpty())
        } finally { server.shutdown(); directory.deleteRecursively() }
    }
    @Test fun urlAndDimensionsCannotCarryCredentialsOrDecodeBombs() {
        for (url in listOf("file:///private/a", "javascript:alert(1)", "https://user:pass@example.com/a")) {
            try { RemoteImageDownloads.checkedUrl(url); fail("Should reject URL") } catch (_: IllegalArgumentException) {}
        }
        assertNull(RemoteImageDownloads.checkedUrl("https://example.com/a#fragment").fragment)
        RemoteImageDownloads.checkDimensions(4000, 3000)
        for ((width, height) in listOf(0 to 1, 9000 to 1, 8000 to 8000)) {
            try { RemoteImageDownloads.checkDimensions(width, height); fail("Should reject dimensions") } catch (_: IllegalStateException) {}
        }
    }
}
