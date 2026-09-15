package dev.zyra.mobile.network

import dev.zyra.mobile.data.LocalAttachment
import java.io.File
import java.io.RandomAccessFile
import java.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

object UploadTransfer {
    suspend fun send(file: File, attachment: LocalAttachment, call: suspend (String, JSONObject) -> JSONObject, progress: (Long) -> Unit) = withContext(Dispatchers.IO) {
        require(file.length() == attachment.size) { "This local attachment changed. Attach it again." }
        val started = call("upload.begin", JSONObject().put("uploadId", attachment.id).put("name", attachment.name).put("size", attachment.size).put("sha256", attachment.sha256))
        var offset = started.getLong("offset")
        require(offset in 0..attachment.size) { "Invalid upload checkpoint from the PC." }; progress(offset)
        if (started.optBoolean("ready")) require(!started.isNull("mimeType")) { "This file is not a supported photo or text attachment." }
        if (!started.optBoolean("ready")) {
            RandomAccessFile(file, "r").use { input ->
                while (offset < attachment.size) {
                    val bytes = withContext(Dispatchers.IO) {
                        ByteArray(minOf(48L * 1024, attachment.size - offset).toInt()).also { input.seek(offset); input.readFully(it) }
                    }
                    val result = call("upload.chunk", JSONObject().put("uploadId", attachment.id).put("offset", offset).put("base64", Base64.getEncoder().encodeToString(bytes)))
                    val next = result.getLong("offset")
                    require(next == offset + bytes.size && next <= attachment.size) { "The upload checkpoint changed. Resume this attachment." }
                    offset = next; progress(offset)
                }
            }
            val finished = call("upload.finish", JSONObject().put("uploadId", attachment.id))
            require(finished.optBoolean("ready")) { "The PC could not finalize this attachment." }
            require(!finished.isNull("mimeType")) { "This file is not a supported photo or text attachment." }
        }
    }
}
