package dev.zyra.mobile.ui

import dev.zyra.mobile.data.TimelineReducer
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import org.json.JSONArray
import org.json.JSONObject

data class FleetDefinition(val name: String, val description: String, val runnable: Boolean, val note: String)
data class FleetRun(val id: String, val name: String, val status: String, val goal: String, val model: String,
    val elapsedMs: Long? = null, val totalTokens: Long? = null)
data class FleetState(val kind: String = "agents", val definitions: List<FleetDefinition> = emptyList(), val runs: List<FleetRun> = emptyList(), val nextOffset: Int? = null,
    val selected: FleetRun? = null, val detail: String = "", val output: String = "", val runError: String = "", val transcript: String? = null,
    val definition: FleetDefinition? = null, val definitionReady: Boolean = false, val source: String = "", val busy: Boolean = false, val error: String? = null)
class FleetController(private val scope: CoroutineScope) {
    private val mutable = MutableStateFlow(FleetState()); val state = mutable.asStateFlow()
    private var request: (suspend (String, JSONObject) -> JSONObject)? = null
    private var job: Job? = null; private var updateJob: Job? = null; private var epoch = 0
    private suspend fun call(type: String, payload: JSONObject = JSONObject()): JSONObject {
        val result = (request ?: error("Reconnect to the PC."))(type, payload)
        currentCoroutineContext().ensureActive()
        return result
    }
    private fun run(action: suspend () -> Unit) {
        epoch++; job?.cancel(); val generation = epoch; mutable.update { it.copy(busy = true, error = null) }
        job = scope.launch {
            try { action() } catch (error: Exception) { if (error !is CancellationException && generation == epoch) mutable.update { it.copy(error = error.message) } }
            finally { if (generation == epoch) mutable.update { it.copy(busy = false) } }
        }
    }
    fun open(kind: String, call: suspend (String, JSONObject) -> JSONObject) { updateJob?.cancel(); request = call; mutable.value = FleetState(kind = kind); refresh() }
    private fun jsonArray(array: JSONArray?): List<JSONObject> = (0 until (array?.length() ?: 0)).mapNotNull { array?.optJSONObject(it) }
    private suspend fun list(offset: Int = 0) {
        val result = call(mutable.value.kind + ".list", JSONObject().put("offset", offset))
        val definitions = jsonArray(result.optJSONArray("definitions")).map { value -> FleetDefinition(value.getString("name"), value.optString("description"), value.optBoolean("runnable"),
            listOf(value.optString("permissionMode"), (value.optJSONArray("tools") ?: value.optJSONArray("phases"))?.let { (0 until it.length()).joinToString(", ") { index -> it.optString(index) } }.orEmpty()).filter { it.isNotBlank() }.joinToString(" · ")) }
        val runs = jsonArray(result.optJSONArray("runs")).map { value -> FleetRun(value.optString(if (mutable.value.kind == "agents") "agentRunId" else "workflowRunId"), value.optString("label").ifBlank { value.optString("definitionName", "Agent") }, value.optString("status"), value.optString("goal"), value.optString("selectedModel"),
            nonNegativeLong(value.opt("elapsedMs")), nonNegativeLong(value.optJSONObject("usage")?.opt("totalTokens"))) }
        mutable.update { it.copy(definitions = definitions, runs = if (offset == 0) runs else (it.runs + runs).distinctBy { run -> run.id }, nextOffset = if (result.isNull("nextOffset")) null else result.optInt("nextOffset")) }
    }
    fun refresh() = run { list(); mutable.value.selected?.let { detailNow(it) } }
    fun more() { val offset = mutable.value.nextOffset ?: return; run { list(offset) } }
    fun changed() { if (updateJob?.isActive == true || mutable.value.busy) return; updateJob = scope.launch { delay(500); refresh() } }
    private fun id(run: FleetRun) = JSONObject().put(if (mutable.value.kind == "agents") "agentRunId" else "workflowRunId", run.id)
    private suspend fun detailNow(run: FleetRun) {
        val result = call(mutable.value.kind + ".status", id(run))
        val output = result.opt("result").let { value ->
            if (value is JSONObject && value.has("text")) value.optString("text") else if (value is String) value else readable(value)
        }
        val failure = result.opt("error").let { value -> if (value is JSONObject) value.optString("message").ifBlank { readable(value) } else readable(value) }
        mutable.update { it.copy(selected = run.copy(status = result.optString("status", run.status),
            goal = (result.opt("goal") as? String) ?: run.goal, model = (result.opt("selectedModel") as? String) ?: run.model,
            elapsedMs = nonNegativeLong(result.opt("elapsedMs")) ?: run.elapsedMs,
            totalTokens = nonNegativeLong(result.optJSONObject("usage")?.opt("totalTokens")) ?: run.totalTokens),
            detail = readable(result), output = output, runError = failure) }
    }
    fun select(run: FleetRun) { clearSelection(); mutable.update { it.copy(selected = run) }; run { detailNow(run) } }
    fun definition(value: FleetDefinition) { clearSelection(); mutable.update { it.copy(definition = value) }; run {
        val result = call("definition", JSONObject().put("kind", mutable.value.kind).put("name", value.name))
        val body = result.optJSONObject("definition") ?: result
        mutable.update { it.copy(definition = value, definitionReady = true, source = body.optString("source").ifBlank { body.optString("prompt") }, detail = readable(body.optJSONObject("budgets") ?: JSONObject())) }
    } }
    private fun clearSelection() { mutable.update { it.copy(selected = null, definition = null, definitionReady = false, source = "", detail = "", output = "", runError = "", transcript = null) } }
    fun dismiss() { epoch++; job?.cancel(); updateJob?.cancel(); clearSelection(); mutable.update { it.copy(busy = false, error = null) } }
    fun back(): Boolean {
        val wasDetail = mutable.value.selected != null || mutable.value.definition != null
        dismiss()
        return wasDetail
    }
    fun launch(goal: String, arguments: JSONObject = JSONObject()) = run {
        val current = mutable.value; val definition = current.definition ?: return@run
        check(current.definitionReady && definition.runnable) { "Load the definition before starting this run." }
        if (current.kind == "agents") call("agents.spawn", JSONObject().put("agent", definition.name).put("goal", goal).put("background", true).put("returnHandle", true))
        else call("workflows.run", JSONObject().put("name", definition.name).put("args", arguments).put("approved", true).put("background", true))
        clearSelection(); list()
    }
    fun action(action: String, message: String = "", onAccepted: () -> Unit = {}) = run {
        val selected = mutable.value.selected ?: return@run
        call(mutable.value.kind + "." + action, id(selected).put("message", message)); onAccepted(); list(); detailNow(selected)
    }
    fun transcript() = run {
        val selected = mutable.value.selected ?: return@run
        val result = call("agents.transcript", id(selected).put("limit", 40))
        val text = jsonArray(result.optJSONArray("entries")).mapNotNull { it.optJSONObject("message") }.joinToString("\n\n") { it.optString("role") + "\n" + TimelineReducer.text(it.opt("content")) }
        mutable.update { it.copy(transcript = text.ifBlank { "No transcript entries yet." }) }
    }
    companion object {
        private fun nonNegativeLong(value: Any?) = (value as? Number)?.toLong()?.takeIf { it >= 0 }
        fun readable(value: Any?, depth: Int = 0): String = when {
            value == null || value == JSONObject.NULL -> ""
            depth > 5 -> "More detail is available in the run transcript."
            value is JSONObject -> value.keys().asSequence().filterNot { it in setOf("sessionFile", "source", "prompt", "scriptHash", "version", "rootSessionId", "fleetId") }.map { key ->
                key.replace(Regex("([a-z])([A-Z])"), "$1 $2").replaceFirstChar { it.uppercase() } + ": " + readable(value.opt(key), depth + 1)
            }.joinToString("\n\n")
            value is JSONArray -> (0 until value.length()).joinToString("\n") { readable(value.opt(it), depth + 1) }
            else -> value.toString()
        }
    }
}
