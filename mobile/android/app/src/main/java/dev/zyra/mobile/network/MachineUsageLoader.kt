package dev.zyra.mobile.network

import dev.zyra.mobile.data.ConnectionState
import kotlinx.coroutines.*
import org.json.JSONObject

data class MachineUsageResult(val waiting: Boolean = false, val error: String? = null)

object MachineUsageLoader {
    suspend fun load(machineId: String?, status: ConnectionState?, harness: String,
        request: suspend (String, String) -> JSONObject, publish: (JSONObject) -> Unit): MachineUsageResult {
        if (machineId == null) return MachineUsageResult()
        if (status == null || status == ConnectionState.Connecting || status == ConnectionState.Reconnecting) return MachineUsageResult(waiting = true)
        if (status != ConnectionState.Connected) return MachineUsageResult(error = "Connect to this computer to view usage.")
        return try {
            var previousBytes = -1L
            repeat(8) { attempt ->
                val fresh = request(machineId, harness)
                currentCoroutineContext().ensureActive()
                publish(fresh)
                val bytes = fresh.optLong("bytesRead")
                if (!fresh.optBoolean("indexing") || fresh.optBoolean("limited") || bytes <= 0 || (attempt > 0 && bytes == previousBytes && bytes < 128)) return MachineUsageResult()
                previousBytes = bytes
                if (attempt < 7) delay(250)
            }
            MachineUsageResult()
        } catch (_: TimeoutCancellationException) {
            currentCoroutineContext().ensureActive()
            MachineUsageResult(error = "The computer took too long to return usage. Try refreshing.")
        } catch (failure: CancellationException) { throw failure }
        catch (failure: Exception) { currentCoroutineContext().ensureActive(); MachineUsageResult(error = failure.message ?: "Usage is unavailable.") }
    }
}
