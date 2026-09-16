package dev.zyra.mobile
import dev.zyra.mobile.data.*
import dev.zyra.mobile.network.UploadTransfer
import kotlinx.coroutines.test.runTest
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.nio.file.Files
import java.io.File
import java.util.Base64

class AttachmentTest {
    @Test fun unsentAndUncertainImagesSurviveStoreRestart() {
        val directory = Files.createTempDirectory("zyra-attachments").toFile()
        try {
            var store = AttachmentStore(directory)
            val image = store.add("pc", "chat", "image.png", "image/png", byteArrayOf(1,2,3).inputStream())
            store = AttachmentStore(directory); assertEquals(image.id, store.list("pc", "chat").single().id)
            store.submitted(listOf(image.id), "send")
            store = AttachmentStore(directory); assertTrue(store.list("pc", "chat").isEmpty()); assertEquals(1, store.allForSend("send").size)
            assertTrue(store.file(image.id).exists()); store.complete("send"); assertFalse(store.file(image.id).exists())
        } finally { directory.deleteRecursively() }
    }
    @Test fun uploaderStartsFromTheDurableHostOffsetAndVerifiesAcknowledgements() = runTest {
        val directory = Files.createTempDirectory("zyra-upload-client").toFile()
        try {
            val store = AttachmentStore(directory); val bytes = ByteArray(60000) { (it % 100).toByte() }
            val attachment = store.add("pc", "chat", "image.png", "image/png", bytes.inputStream())
            val offsets = mutableListOf<Long>(); val progress = mutableListOf<Long>()
            UploadTransfer.send(store.file(attachment.id), attachment, { method, params ->
                when (method) {
                    "upload.begin" -> JSONObject().put("offset", 10000)
                    "upload.chunk" -> { val offset = params.getLong("offset"); offsets.add(offset); val chunk = Base64.getDecoder().decode(params.getString("base64")); assertArrayEquals(bytes.copyOfRange(offset.toInt(), offset.toInt() + chunk.size), chunk); JSONObject().put("offset", offset + chunk.size) }
                    else -> JSONObject().put("ready", true).put("mimeType", "image/png")
                }
            }, { progress.add(it) })
            assertEquals(listOf(10000L, 59152L), offsets); assertEquals(60000L, progress.last())
        } finally { directory.deleteRecursively() }
    }
}
