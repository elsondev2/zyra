package dev.zyra.mobile
import dev.zyra.mobile.network.MediaDownloads
import dev.zyra.mobile.ui.MediaController
import dev.zyra.mobile.data.TimelineReducer
import dev.zyra.mobile.data.SessionView
import kotlinx.coroutines.test.runTest
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.nio.file.Files
import java.security.MessageDigest
import java.util.Base64

class MediaTest {
    @Test fun outgoingImageBecomesAvailableBeforeUploadSourceIsRemovedWithoutNetwork() = runTest {
        val directory = Files.createTempDirectory("zyra-outgoing-image").toFile()
        try {
            val source = java.io.File(directory, "original.jpg").apply { writeBytes(ByteArray(700_000) { (it % 87).toByte() }) }
            val bytes = source.readBytes()
            val sha = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
            val ref = JSONObject().put("bytes", bytes.size).put("sha256", sha)
            val downloads = MediaDownloads(java.io.File(directory, "cache"))
            assertNull(downloads.cached("pc", ref))
            val seeded = downloads.seed("pc", ref, source)
            source.delete()
            assertEquals(seeded, downloads.cached("pc", ref))
            assertNull(downloads.cached("other-pc", ref))
            assertEquals(seeded, downloads.load("pc", "chat", ref, { _, _ -> error("Own sent image must not be downloaded again") }) { _, _ -> })
            val corrupt = java.io.File(directory, "bad.jpg").apply { writeBytes(ByteArray(bytes.size)) }
            try { downloads.seed("pc", ref, corrupt); fail("Reject corrupted upload sources") } catch (_: IllegalArgumentException) { }
        } finally { directory.deleteRecursively() }
    }
    @Test fun projectImagesUseAuthorizedWorkspaceChunksAndRejectMismatchedContent() = runTest {
        val directory = Files.createTempDirectory("zyra-project-image").toFile()
        try {
            val bytes = "image bytes".toByteArray()
            val sha = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
            val ref = JSONObject().put("bytes", bytes.size).put("sha256", sha).put("source", JSONObject().put("kind", "workspace").put("rootId", "allowed").put("path", "image.png"))
            val request: suspend (String, JSONObject) -> JSONObject = { method, params ->
                assertEquals("workspace.image.chunk", method)
                assertEquals("allowed", params.getJSONObject("ref").getJSONObject("source").getString("rootId"))
                JSONObject().put("base64", Base64.getEncoder().encodeToString(bytes)).put("next", bytes.size).put("total", bytes.size).put("sha256", sha)
            }
            assertArrayEquals(bytes, MediaDownloads(directory).load("pc", "chat", ref, request) { _, _ -> }.readBytes())
            val bad = JSONObject(ref.toString()).put("sha256", "b".repeat(64))
            try { MediaDownloads(directory).load("pc", "chat", bad, { _, _ ->
                JSONObject().put("base64", Base64.getEncoder().encodeToString(bytes)).put("next", bytes.size).put("total", bytes.size).put("sha256", "b".repeat(64))
            }) { _, _ -> }; fail("Reject content that does not match its reference") } catch (expected: IllegalStateException) { assertTrue(expected.message!!.contains("checksum")) }
        } finally { directory.deleteRecursively() }
    }
    @Test fun interruptedImageDownloadResumesAndRequiresMatchingChecksum() = runTest {
        val directory = Files.createTempDirectory("zyra-media-download").toFile()
        try {
            val bytes = ByteArray(70000) { (it % 87).toByte() }; val sha = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
            val ref = JSONObject().put("bytes", bytes.size).put("sha256", sha)
            var interrupt = true; val offsets = mutableListOf<Long>()
            val request: suspend (String, JSONObject) -> JSONObject = { method, params ->
                assertEquals("media.chunk", method); assertEquals("chat", params.getString("session")); val offset = params.getLong("offset"); offsets.add(offset)
                if (offset > 0 && interrupt) error("Connection lost")
                val next = minOf(offset.toInt() + 49152, bytes.size)
                JSONObject().put("base64", Base64.getEncoder().encodeToString(bytes.copyOfRange(offset.toInt(), next))).put("next", next).put("total", bytes.size).put("sha256", sha)
            }
            try { MediaDownloads(directory).load("pc", "chat", ref, request) { _, _ -> }; fail("Must retain a partial download") } catch (expected: IllegalStateException) { assertEquals("Connection lost", expected.message) }
            assertEquals(49152L, directory.listFiles()!!.single().length()); interrupt = false
            val file = MediaDownloads(directory).load("pc", "chat", ref, request) { _, _ -> }
            assertArrayEquals(bytes, file.readBytes()); assertEquals(listOf(0L, 49152L, 49152L), offsets)
            val cached = MediaDownloads(directory).load("pc", "chat", ref, { _, _ -> error("Cached image should not use network") }) { _, _ -> }; assertEquals(file, cached)
            file.writeText("corrupt")
            val repaired = MediaDownloads(directory).load("pc", "chat", ref, request) { _, _ -> }; assertArrayEquals(bytes, repaired.readBytes())
            MediaDownloads(directory).forget("another-pc"); assertTrue(repaired.exists())
            MediaDownloads(directory).forget("pc"); assertFalse(repaired.exists())
        } finally { directory.deleteRecursively() }
    }
    @Test fun imageOnlyMessagesKeepTheirRoleAndLazyImageReferences() {
        val image = JSONObject().put("type", "image").put("mediaRef", JSONObject().put("sha256", "a".repeat(64)).put("bytes", 10))
        val message = JSONObject().put("role", "user").put("timestamp", 123).put("content", JSONArray().put(image))
        val start = JSONObject().put("type", "message_start").put("message", message)
        var state = TimelineReducer.apply(SessionView(), JSONObject().put("sequence", 1).put("event", start))
        assertEquals("user", state.items.single().role); assertEquals("", state.items.single().text)
        assertEquals(1, MediaController.images(state.items.single().raw).size)
        state = TimelineReducer.apply(state, JSONObject().put("sequence", 2).put("event", JSONObject().put("type", "message_end").put("message", message)))
        assertEquals(1, state.items.size); assertEquals("user", state.items.single().role)
    }
}
