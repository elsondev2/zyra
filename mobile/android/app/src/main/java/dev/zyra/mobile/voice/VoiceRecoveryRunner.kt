package dev.zyra.mobile.voice

import kotlinx.coroutines.*
import kotlinx.coroutines.selects.select
import org.json.JSONObject
import java.security.MessageDigest
import java.util.Base64
import java.util.UUID

/** Serial recovery is separate from transcript forwarding, leaving normal
 * transcript/control traffic and Stop responsive during an audio upload. */
class VoiceRecoveryRunner(private val input: VoiceInputRecovery, private val adapter: String,
    private val request: suspend (String, JSONObject) -> JSONObject,
    private val status: (String, String) -> Unit, private val recovered: (JSONObject) -> Unit) {
    suspend fun run(): Unit = coroutineScope {
        while (isActive) {
            delay(100)
            val candidate = input.takeReady() ?: continue
            if (candidate.chunks == null) { input.failed(candidate.providerId); status(candidate.providerId, "unavailable"); continue }
            status(candidate.providerId, "recovering")
            val result = try {
                coroutineScope {
                    val operation = async { transfer(candidate) }
                    select<JSONObject?> {
                        candidate.cancelled.onAwait { operation.cancel(); null }
                        operation.onAwait { it }
                    }
                }
            } catch (error: CancellationException) {
                currentCoroutineContext().ensureActive()
                if (!candidate.cancelled.isCompleted) { input.failed(candidate.providerId); status(candidate.providerId, "unavailable") }
                null
            }
            catch (_: Exception) {
                if (!candidate.cancelled.isCompleted) { input.failed(candidate.providerId); status(candidate.providerId, "unavailable") }
                null
            } finally { candidate.erase() }
            if (result != null) input.recovered(candidate.providerId, result.getString("text"))?.let(recovered)
        }
    }
    private suspend fun transfer(candidate: VoiceRecoveryCandidate): JSONObject {
        fun needed() { if (candidate.cancelled.isCompleted) throw CancellationException("Transcript already resolved") }
        needed()
        var audio = ByteArray(0)
        val id = "recovery-${UUID.randomUUID()}"
        fun params() = JSONObject().put("adapterSessionId", adapter).put("recoveryId", id)
        var began = false
        var finished = false
        try {
            withContext(Dispatchers.Default) { audio = VoicePcm.wav(candidate.chunks!!) }
            val hash = withContext(Dispatchers.Default) { MessageDigest.getInstance("SHA-256").digest(audio).joinToString("") { "%02x".format(it) } }
            needed(); began = true
            request("voice.recovery.begin", params().put("providerItemId", candidate.providerId).put("bytes", audio.size)
                .put("durationMs", (audio.size - 44) / 48).put("sha256", hash))
            var offset = 0
            while (offset < audio.size) {
                needed()
                val end = minOf(offset + 48 * 1024, audio.size)
                val data = Base64.getEncoder().encodeToString(audio.copyOfRange(offset, end))
                val result = request("voice.recovery.chunk", params().put("offset", offset).put("data", data))
                check(result.getInt("offset") == end) { "The PC did not accept the Voice recording chunk." }
                offset = end
            }
            needed()
            val result = request("voice.recovery.finish", params())
            check(result.optString("providerItemId") == candidate.providerId && result.optString("text").isNotBlank())
            needed(); finished = true
            return result
        } finally {
            audio.fill(0)
            if (began && !finished) withContext(NonCancellable) { runCatching { withTimeout(3000) { request("voice.recovery.cancel", params()) } } }
        }
    }
}
