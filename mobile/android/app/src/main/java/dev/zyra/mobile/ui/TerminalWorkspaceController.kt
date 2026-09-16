package dev.zyra.mobile.ui

import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import org.json.JSONObject

data class TerminalWorkspaceState(val terminals: List<RemoteTerminal> = emptyList(), val panes: List<String> = emptyList(),
    val busy: Boolean = false, val connected: Boolean = false, val error: String? = null, val supportsSplit: Boolean = false)

/** Owns navigation and at most two independent terminal subscriptions for the open chat. */
class TerminalWorkspaceController(private val scope: CoroutineScope) {
    private val mutable = MutableStateFlow(TerminalWorkspaceState())
    val state = mutable.asStateFlow()
    private data class Pane(val controller: TerminalController, val lifetime: Job, val lease: String)
    private val panes = linkedMapOf<String, Pane>()
    private var request: (suspend (String, JSONObject) -> JSONObject)? = null
    private var operation: Job? = null
    private var generation = 0
    private val paneLimit get() = if (mutable.value.supportsSplit) 2 else 1
    fun pane(id: String) = panes[id]?.controller
    private fun run(action: suspend (suspend (String, JSONObject) -> JSONObject) -> Unit) {
        val call = request ?: return
        if (mutable.value.busy) return
        val version = generation
        mutable.update { it.copy(busy = true, error = null) }
        operation = scope.launch {
            try { action(call) }
            catch (e: Exception) { if (e !is CancellationException && version == generation) mutable.update { it.copy(error = e.message ?: "Terminal unavailable.") } }
            finally { if (version == generation) mutable.update { it.copy(busy = false) } }
        }
    }
    fun open(supportsSplit: Boolean = false, call: suspend (String, JSONObject) -> JSONObject) {
        leave(); request = call
        mutable.value = TerminalWorkspaceState(connected = true, supportsSplit = supportsSplit)
        refresh()
    }
    fun refresh() = run { call ->
        val values = call("terminal.list", JSONObject()).getJSONArray("terminals")
        val terminals = (0 until values.length()).map { values.getJSONObject(it).let { v -> RemoteTerminal(v.getString("id"), v.optString("title", "Terminal"), v.optString("cwd"), v.optString("status")) } }
        panes.keys.filter { id -> terminals.none { it.id == id } }.toList().forEach { remove(it) }
        mutable.update { it.copy(terminals = terminals) }
    }
    fun create() {
        if (panes.size >= paneLimit || !mutable.value.connected) return
        run { call ->
            val id = call("terminal.create", JSONObject()).getString("terminalId")
            mutable.update { it.copy(terminals = it.terminals + RemoteTerminal(id, "Terminal ${it.terminals.size + 1}", "", "running")) }
            select(id)
        }
    }
    fun select(id: String) {
        val call = request ?: return
        if (!mutable.value.connected || panes.size >= paneLimit || panes.containsKey(id)) return
        val lifetime = SupervisorJob(scope.coroutineContext[Job])
        val controller = TerminalController(CoroutineScope(scope.coroutineContext + lifetime))
        val lease = java.util.UUID.randomUUID().toString()
        panes[id] = Pane(controller, lifetime, lease)
        controller.open(loadList = false) { method, params ->
            if (method == "terminal.attach") params.put("keepExisting", true).put("subscriptionId", lease)
            call(method, params)
        }
        controller.select(id)
        mutable.update { it.copy(panes = panes.keys.toList()) }
    }
    fun remove(id: String) {
        val pane = panes.remove(id) ?: return
        pane.controller.leave(detach = false); pane.lifetime.cancel()
        mutable.update { it.copy(panes = panes.keys.toList()) }
        val call = request ?: return
        scope.launch { runCatching { call("terminal.detach", JSONObject().put("terminalId", id).put("subscriptionId", pane.lease)) } }
    }
    fun end(id: String) = run { call ->
        call("terminal.close", JSONObject().put("terminalId", id))
        remove(id)
        mutable.update { it.copy(terminals = it.terminals.filterNot { terminal -> terminal.id == id }) }
    }
    /** Back from one or two panes returns to the list and leaves PC processes running. */
    fun back(): Boolean {
        if (panes.isEmpty()) return false
        panes.keys.toList().forEach(::remove)
        return true
    }
    fun event(event: JSONObject) {
        val id = event.optString("terminalId")
        panes[id]?.controller?.event(event)
        if (event.optJSONObject("event")?.optString("type") == "exit") mutable.update { it.copy(terminals = it.terminals.map { terminal -> if (terminal.id == id) terminal.copy(status = "exited") else terminal }) }
    }
    fun connection(connected: Boolean) {
        if (!connected) { generation++; operation?.cancel() }
        mutable.update { it.copy(connected = connected, busy = if (connected) it.busy else false) }
        panes.values.forEach { it.controller.connection(connected) }
    }
    fun leave() {
        generation++; operation?.cancel()
        val oldCall = request
        panes.toMap().forEach { (id, pane) ->
            pane.controller.leave(detach = false); pane.lifetime.cancel()
            if (oldCall != null) scope.launch { runCatching { oldCall("terminal.detach", JSONObject().put("terminalId", id).put("subscriptionId", pane.lease)) } }
        }
        panes.clear(); request = null
        mutable.update { it.copy(panes = emptyList(), busy = false) }
    }
}
