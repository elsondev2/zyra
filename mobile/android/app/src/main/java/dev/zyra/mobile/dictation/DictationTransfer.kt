package dev.zyra.mobile.dictation

import kotlinx.coroutines.*
import org.json.JSONObject
import java.security.MessageDigest
import java.util.Base64
import java.util.UUID

typealias DictationRequest = suspend (String, JSONObject) -> JSONObject

/** Sequential bounded chunks share the PC's paced bulk lane. Never an outbox operation. */
suspend fun uploadDictation(audio: ByteArray, request: DictationRequest, progress: (Float) -> Unit): String {
    val id = "dictation-${UUID.randomUUID()}"
    fun params() = JSONObject().put("recoveryId", id)
    val hash = withContext(Dispatchers.Default) { MessageDigest.getInstance("SHA-256").digest(audio).joinToString("") { "%02x".format(it) } }
    var finished = false
    try {
        request("dictation.begin", params().put("bytes", audio.size).put("durationMs", (audio.size - 44) / 48).put("sha256", hash))
        var offset = 0
        while (offset < audio.size) {
            currentCoroutineContext().ensureActive()
            val end = minOf(offset + 48 * 1024, audio.size)
            val encoded = withContext(Dispatchers.Default) { val bytes = audio.copyOfRange(offset, end); try { Base64.getEncoder().encodeToString(bytes) } finally { bytes.fill(0) } }
            val result = request("dictation.chunk", params().put("offset", offset).put("data", encoded))
            check(result.optInt("offset", -1) == end) { "The computer did not accept the recording. Try again." }
            offset = end; progress(offset.toFloat() / audio.size)
        }
        val result = request("dictation.finish", params())
        currentCoroutineContext().ensureActive()
        val text = (result.opt("text") as? String).orEmpty().trim()
        check(text.isNotEmpty() && text.length <= 60000) { "No usable speech was returned. Try again." }
        finished = true
        return text
    } finally {
        if (!finished) withContext(NonCancellable) { runCatching { withTimeout(3000) { request("dictation.cancel", params()) } } }
    }
}
