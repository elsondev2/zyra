package dev.zyra.mobile.network

import dev.zyra.mobile.data.ConnectionState
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import org.json.JSONObject

data class MachineLimitsResult(val data: JSONObject? = null, val waiting: Boolean = false, val error: String? = null)

object MachineLimitsLoader {
    suspend fun load(machineId: String?, status: ConnectionState?, request: suspend (String) -> JSONObject): MachineLimitsResult {
        if (machineId == null) return MachineLimitsResult()
        if (status == null || status == ConnectionState.Connecting || status == ConnectionState.Reconnecting) return MachineLimitsResult(waiting = true)
        if (status != ConnectionState.Connected) return MachineLimitsResult(error = "Connect to this computer to view its limits.")
        return try {
            val result = request(machineId)
            currentCoroutineContext().ensureActive()
            MachineLimitsResult(data = result)
        } catch (failure: TimeoutCancellationException) {
            currentCoroutineContext().ensureActive()
            MachineLimitsResult(error = "The computer took too long to return limits. Try refreshing.")
        } catch (failure: CancellationException) { throw failure }
        catch (failure: Exception) { currentCoroutineContext().ensureActive(); MachineLimitsResult(error = failure.message ?: "Limits are unavailable.") }
    }
}
