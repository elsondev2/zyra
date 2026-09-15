package dev.zyra.mobile.ui

import kotlinx.coroutines.*
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import org.json.JSONObject

data class RemoteTerminal(val id: String, val title: String, val cwd: String, val status: String)
data class TerminalState(val terminals: List<RemoteTerminal> = emptyList(), val selected: String = "", val busy: Boolean = false, val error: String? = null, val connected: Boolean = false, val finished: Boolean = false)
data class TerminalFrame(val data: String, val sequence: Long, val cols: Int = 0, val rows: Int = 0)
/** One screen subscription, bounded recovery buffer and ordered, never-retried keyboard input. */
class TerminalController(private val scope: CoroutineScope) {
    private val mutable = MutableStateFlow(TerminalState())
    val state = mutable.asStateFlow()
    private var request: (suspend (String, JSONObject) -> JSONObject)? = null
    private var sink: ((TerminalFrame) -> Unit)? = null
    private var epoch = 0
    private var sequence = 0L
    private var attaching = false
    private val pending = ArrayList<JSONObject>()
    private var pendingBytes = 0
    private var job: Job? = null
    private data class Input(val epoch: Int, val id: String, val text: String)
    private val input = Channel<Input>(64)
    init { scope.launch {
        for (item in input) {
            if (item.epoch != epoch || item.id != mutable.value.selected || !mutable.value.connected || mutable.value.finished) continue
            try {
                val batch = StringBuilder(item.text)
                if (item.text != "\u0003") delay(100)
                while (batch.length < 2000) {
                    val next = input.tryReceive().getOrNull() ?: break
                    if (next.epoch == epoch && next.id == item.id) batch.append(next.text)
                }
                if (item.epoch != epoch || !mutable.value.connected || mutable.value.finished) continue
                call("terminal.input", JSONObject().put("terminalId", item.id).put("data", batch.toString()))
            }
            catch (error: Exception) {
                if (error is CancellationException) throw error
                epoch++; mutable.update { it.copy(error = "Input delivery is uncertain. Check the shell before typing again.", connected = false) }
            }
        }
    } }
    private suspend fun call(method: String, params: JSONObject = JSONObject()) = (request ?: error("Reconnect to your PC."))(method, params)
    private fun run(action: suspend () -> Unit) {
        job?.cancel(); val version = epoch
        mutable.update { it.copy(busy = true, error = null) }
        job = scope.launch {
            try { action() } catch (error: Exception) { if (error !is CancellationException && version == epoch) mutable.update { it.copy(error = error.message) } }
            finally { if (version == epoch) mutable.update { it.copy(busy = false) } }
        }
    }
    fun open(loadList: Boolean = true, call: suspend (String, JSONObject) -> JSONObject) {
        epoch++; job?.cancel(); request = call; sequence = 0; pending.clear(); pendingBytes = 0
        mutable.value = TerminalState(connected = true); if (loadList) refresh()
    }
    fun refresh() = run {
        val array = call("terminal.list").getJSONArray("terminals")
        val terminals = (0 until array.length()).map { array.getJSONObject(it).let { value -> RemoteTerminal(value.getString("id"), value.optString("title", "Terminal"), value.optString("cwd"), value.optString("status")) } }
        mutable.update { it.copy(terminals = terminals, connected = true) }
        if (mutable.value.selected.isNotBlank() && terminals.none { it.id == mutable.value.selected }) mutable.update { it.copy(selected = "") }
    }
    fun create() = run {
        val id = call("terminal.create").getString("terminalId")
        mutable.update { it.copy(terminals = it.terminals + RemoteTerminal(id, "Terminal", "", "running")) }
        attachNow(id)
    }
    fun select(id: String) { epoch++; run { attachNow(id) } }
    fun bind(receiver: ((TerminalFrame) -> Unit)?) {
        sink = receiver
        if (receiver != null && mutable.value.selected.isNotBlank() && mutable.value.connected) resync()
    }
    private suspend fun attachNow(id: String) {
        mutable.update { it.copy(selected = id, finished = false) }; attaching = true; pending.clear(); pendingBytes = 0
        try {
            val attached = call("terminal.attach", JSONObject().put("terminalId", id))
            val result = attached.getJSONObject("screen")
            mutable.update { it.copy(finished = attached.optJSONObject("session")?.optString("status") == "exited") }
            sequence = result.getLong("sequence")
            sink?.invoke(TerminalFrame(result.getString("data"), sequence, result.getInt("cols"), result.getInt("rows")))
            attaching = false
            for (event in pending.toList()) apply(event)
        } finally { attaching = false; pending.clear(); pendingBytes = 0 }
    }
    private fun resync() { run { attachNow(mutable.value.selected) } }
    fun event(message: JSONObject) {
        if (message.optString("terminalId") != mutable.value.selected) return
        val event = message.optJSONObject("event") ?: return
        if (attaching) {
            val bytes = event.toString().length * 2
            if (pendingBytes + bytes > 512 * 1024) { job?.cancel(); pending.clear(); pendingBytes = 0; mutable.update { it.copy(error = "Terminal is producing too much output. Refresh its screen.") }; return }
            pending.add(event); pendingBytes += bytes
        } else apply(event)
    }
    private fun apply(event: JSONObject) {
        when (event.optString("type")) {
            "output" -> {
                val next = event.optLong("sequence")
                if (next <= sequence) return
                if (next != sequence + 1) { resync(); return }
                sequence = next; sink?.invoke(TerminalFrame(event.optString("data"), sequence))
            }
            "clear", "resize", "resync" -> resync()
            "exit" -> mutable.update { state -> state.copy(finished = true, terminals = state.terminals.map { if (it.id == state.selected) it.copy(status = "exited") else it }) }
        }
    }
    fun send(text: String) {
        val current = mutable.value
        if (!current.connected || current.selected.isBlank() || current.finished) return
        if (text.toByteArray().size > 8192) { mutable.update { it.copy(error = "Paste at most 8 KB at a time.") }; return }
        if (!input.trySend(Input(epoch, current.selected, text)).isSuccess) { epoch++; mutable.update { it.copy(error = "Typing paused: the connection is too slow. Refresh before continuing.", connected = false) } }
    }
    fun connection(connected: Boolean) {
        if (!connected) { epoch++; job?.cancel(); pending.clear(); pendingBytes = 0; attaching = false }
        mutable.update { it.copy(connected = connected) }
        if (connected && sink != null && mutable.value.selected.isNotBlank()) resync()
    }
    fun closeShell() = run {
        call("terminal.close", JSONObject().put("terminalId", mutable.value.selected))
        mutable.update { state -> state.copy(terminals = state.terminals.filterNot { it.id == state.selected }, selected = "") }
    }
    fun leave(detach: Boolean = true) {
        epoch++; job?.cancel(); sink = null; mutable.update { it.copy(selected = "") }
        if (detach) scope.launch { runCatching { call("terminal.detach") } }
    }
}
