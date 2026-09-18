package dev.zyra.mobile.data

import org.json.JSONObject
import java.time.Instant

enum class RuntimePhase { Unknown, Idle, Checking, Waiting, Restarting, Ready, Failed }
enum class RuntimeConnection { Unknown, Connecting, Connected, Disconnected }

data class RuntimeInstance(
    val instanceId: String?, val namespaceId: String?, val channel: String?, val protocolVersion: Int?, val runtimeRevision: String?, val startedAt: String?
)
data class RuntimeInstallation(val kind: String, val label: String, val appVersion: String?)
data class RuntimeStatus(
    val phase: RuntimePhase = RuntimePhase.Unknown,
    val connection: RuntimeConnection = RuntimeConnection.Unknown,
    val lastConfirmedAt: String? = null,
    val errorCode: String? = null,
    val updatePending: Boolean = false,
    val instance: RuntimeInstance? = null,
    val installation: RuntimeInstallation? = null,
    val confirmedAtMillis: Long? = null
) {
    val known get() = phase != RuntimePhase.Unknown && connection != RuntimeConnection.Unknown
    /** Compact text for connection controls; absent host status remains explicitly unknown. */
    fun isLive(now: Long = System.currentTimeMillis()): Boolean {
        val confirmed = confirmedAtMillis ?: runCatching { Instant.parse(lastConfirmedAt).toEpochMilli() }.getOrNull() ?: return false
        return connection == RuntimeConnection.Connected && (phase == RuntimePhase.Ready || phase == RuntimePhase.Waiting) && now - confirmed in -5000L until 45000L
    }
    fun syncLabel(now: Long = System.currentTimeMillis()): String = when {
        connection == RuntimeConnection.Disconnected -> "Disconnected"
        connection == RuntimeConnection.Connecting -> "Connecting"
        connection == RuntimeConnection.Connected && !isLive(now) -> "Status stale"
        isLive(now) && updatePending -> "Live · update pending"
        isLive(now) -> "Live"
        else -> "Live status unavailable"
    }
    companion object {
        val Unknown = RuntimeStatus()
        private fun text(value: JSONObject, key: String, maximum: Int = 160) = if (value.isNull(key)) null else value.optString(key).takeIf { it.isNotBlank() && it.length <= maximum }
        private fun phase(value: String) = when (value) { "idle" -> RuntimePhase.Idle; "checking" -> RuntimePhase.Checking; "waiting" -> RuntimePhase.Waiting; "restarting" -> RuntimePhase.Restarting; "ready" -> RuntimePhase.Ready; "failed" -> RuntimePhase.Failed; else -> RuntimePhase.Unknown }
        private fun connection(value: String) = when (value) { "connecting" -> RuntimeConnection.Connecting; "connected" -> RuntimeConnection.Connected; "disconnected" -> RuntimeConnection.Disconnected; else -> RuntimeConnection.Unknown }
        fun from(value: JSONObject?, serverTime: Long? = null, receivedAt: Long = System.currentTimeMillis()): RuntimeStatus {
            value ?: return Unknown
            val statusPhase = phase(value.optString("phase"))
            val statusConnection = connection(value.optString("connection"))
            val rawInstance = value.optJSONObject("instance")
            val instance = rawInstance?.let { RuntimeInstance(text(it, "instanceId"), text(it, "namespaceId"), text(it, "channel"), it.optInt("protocolVersion").takeIf { version -> version > 0 }, text(it, "runtimeRevision"), text(it, "startedAt")) }
            val rawInstallation = value.optJSONObject("installation")
            val installation = rawInstallation?.let { raw ->
                val kind = text(raw, "kind")
                val label = text(raw, "label")
                if (kind != null && kind in setOf("development", "installed", "standalone") && label != null) RuntimeInstallation(kind, label, text(raw, "appVersion")) else null
            }
            val confirmed = text(value, "lastConfirmedAt")
            val remoteConfirmed = runCatching { Instant.parse(confirmed).toEpochMilli() }.getOrNull()
            val localConfirmed = if (serverTime != null && remoteConfirmed != null) receivedAt - (serverTime - remoteConfirmed) else null
            return RuntimeStatus(statusPhase, statusConnection, confirmed, text(value, "errorCode", 64), value.optBoolean("updatePending"), instance, installation, localConfirmed)
        }
        fun fromHello(value: JSONObject) = from(value.optJSONObject("runtimeStatus"), value.optLong("serverTime").takeIf { it > 0 })
        fun fromEvent(value: JSONObject) = from(value.optJSONObject("runtimeStatus") ?: value, value.optLong("serverTime").takeIf { it > 0 })
    }
}
