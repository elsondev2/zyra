package dev.zyra.mobile.ui

import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import org.json.JSONObject

data class SpeakingStyle(val name: String, val description: String)
data class ChatPreferencesState(val loaded: Boolean = false, val busy: Boolean = false, val saving: Boolean = false,
    val profiles: List<SpeakingStyle> = emptyList(), val profile: String = "", val memoryMode: String = "", val error: String? = null)

class ChatPreferencesController(private val scope: CoroutineScope) {
    private fun failure(error: Exception): String {
        val message = error.message ?: "Could not load chat preferences."
        return if (message.contains("This action is unavailable on mobile") ||
            message.contains("Bridge request type is not allowed") || message.contains("Unknown bridge message"))
            "Update Zyra on this PC to use speaking styles and memory settings." else message
    }
    private val mutable = MutableStateFlow(ChatPreferencesState())
    val state = mutable.asStateFlow()
    private var request: (suspend (String, JSONObject) -> JSONObject)? = null
    private var job: Job? = null
    private var generation = 0
    private var memoryRevision = 0
    private var profileRevision = 0

    fun close() { generation++; job?.cancel(); request = null; mutable.value = ChatPreferencesState() }
    fun open(call: suspend (String, JSONObject) -> JSONObject) {
        close(); request = call
        val epoch = generation
        val revision = memoryRevision
        val profileVersion = profileRevision
        mutable.value = ChatPreferencesState(busy = true)
        job = scope.launch {
            try {
                val result = call("preferences.get", JSONObject())
                val profiles = result.optJSONArray("profiles")
                val rows = (0 until (profiles?.length() ?: 0)).map { index -> profiles!!.getJSONObject(index).let {
                    SpeakingStyle(it.getString("name"), it.optString("description"))
                } }
                if (epoch == generation) mutable.update { it.copy(loaded = true, busy = false, profiles = rows,
                    profile = if (profileVersion == profileRevision) result.optString("profile") else it.profile, memoryMode = if (revision == memoryRevision) result.optString("memoryMode") else it.memoryMode) }
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { if (epoch == generation) mutable.update { it.copy(busy = false, error = failure(e)) } }
        }
    }

    fun event(event: JSONObject) {
        if (request == null) return
        if (event.optString("type") == "session_memory") {
            memoryRevision++
            mutable.update { it.copy(memoryMode = event.optString("memoryMode", it.memoryMode)) }
        }
        if (event.optString("type") == "session_config" && event.has("profile")) {
            profileRevision++
            mutable.update { it.copy(profile = event.optString("profile", it.profile)) }
        }
    }

    fun setMemory(enabled: Boolean) = change("memory.configure", JSONObject().put("enabled", enabled))
    fun setProfile(name: String) {
        if (mutable.value.profiles.none { it.name == name }) return
        change("configure", JSONObject().put("profile", name))
    }
    private fun change(type: String, payload: JSONObject) {
        val call = request ?: return
        if (!mutable.value.loaded || mutable.value.busy || mutable.value.saving) return
        val epoch = generation
        val revision = memoryRevision
        val profileVersion = profileRevision
        mutable.update { it.copy(saving = true, error = null) }
        job = scope.launch {
            try {
                val result = call(type, payload)
                if (epoch == generation) mutable.update { it.copy(saving = false,
                    profile = if (profileVersion == profileRevision) result.optJSONObject("config")?.optString("profile")?.takeIf(String::isNotBlank) ?: it.profile else it.profile,
                    memoryMode = if (revision == memoryRevision) result.optString("memoryMode", it.memoryMode) else it.memoryMode) }
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { if (epoch == generation) mutable.update { it.copy(saving = false, error = failure(e)) } }
        }
    }
}
