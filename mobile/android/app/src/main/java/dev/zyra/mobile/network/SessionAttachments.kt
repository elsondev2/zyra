package dev.zyra.mobile.network

import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.isActive
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONObject

/** An abandoned RPC can still attach on the server. Finish and release it before
 * another attachment is allowed to reuse that connection. */
class SessionAttachments(private val request: suspend (String, JSONObject) -> JSONObject) {
    private val lock = Mutex()
    suspend fun attach(params: JSONObject): JSONObject {
        val caller = currentCoroutineContext()
        return withContext(NonCancellable) {
            lock.withLock {
                caller.ensureActive()
                val result = request("session.attach", params)
                if (!caller.isActive) {
                    runCatching { request("session.detach", JSONObject().put("sessionKey", result.getString("sessionKey"))) }
                    caller.ensureActive()
                }
                result
            }
        }
    }
    suspend fun detach(session: String, stillUnwanted: () -> Boolean = { true }) = lock.withLock {
        if (stillUnwanted()) request("session.detach", JSONObject().put("sessionKey", session)) else JSONObject()
    }
}
