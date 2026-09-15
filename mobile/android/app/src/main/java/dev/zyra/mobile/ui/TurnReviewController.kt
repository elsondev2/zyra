package dev.zyra.mobile.ui

import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import org.json.JSONObject

data class TurnReviewChange(val activityId: String, val rootId: String, val path: String, val kind: String, val additions: Int, val deletions: Int)
data class TurnReviewEntry(val id: String, val number: Int, val prompt: String, val response: String, val state: String, val changes: List<TurnReviewChange>)
data class TurnReviewMessage(val role: String, val text: String, val truncated: Boolean = false)
data class TurnReviewState(val turns: List<TurnReviewEntry> = emptyList(), val next: String? = null, val busy: Boolean = false, val error: String? = null,
    val file: TurnReviewChange? = null, val patch: String? = null, val truncated: Boolean = false, val unavailable: String? = null,
    val selected: TurnReviewEntry? = null, val messages: List<TurnReviewMessage> = emptyList(), val detailLoaded: Boolean = false)

class TurnReviewController(private val scope: CoroutineScope) {
    private val mutable = MutableStateFlow(TurnReviewState())
    val state = mutable.asStateFlow()
    private var request: (suspend (String, JSONObject) -> JSONObject)? = null
    private var job: Job? = null
    private var generation = 0
    fun bind(call: suspend (String, JSONObject) -> JSONObject) { cancel(); request = call; mutable.value = TurnReviewState() }
    private fun cancel() { generation++; job?.cancel() }
    private fun run(action: suspend () -> Unit) {
        cancel(); val epoch = generation
        mutable.update { it.copy(busy = true, error = null) }
        job = scope.launch {
            try { action() } catch (error: Exception) { if (error !is CancellationException && generation == epoch) mutable.update { it.copy(error = error.message ?: "Could not load this review.") } }
            finally { if (generation == epoch) mutable.update { it.copy(busy = false) } }
        }
    }
    private suspend fun call(method: String, params: JSONObject): JSONObject {
        val epoch = generation
        val result = (request ?: error("Reconnect to your PC."))(method, params)
        currentCoroutineContext().ensureActive()
        if (epoch != generation) throw CancellationException("Review changed")
        return result
    }
    fun refresh() {
        val turn = mutable.value.selected; val file = mutable.value.file
        if (turn != null && file != null) diff(turn, file) else if (turn != null) select(turn, refresh = true) else load(null)
    }
    fun more() { if (!mutable.value.busy && mutable.value.selected == null) mutable.value.next?.let(::load) }
    fun select(turn: TurnReviewEntry, refresh: Boolean = false) {
        if (!refresh && mutable.value.selected?.id == turn.id && mutable.value.detailLoaded) return
        mutable.update { it.copy(selected = turn, file = null, patch = null, unavailable = null, truncated = false,
            messages = if (it.selected?.id == turn.id) it.messages else emptyList(), detailLoaded = it.selected?.id == turn.id && it.detailLoaded) }
        run {
            val result = call("review.turn", JSONObject().put("turnId", turn.id))
            val selected = parseTurn(result.getJSONObject("turn"))
            require(selected.id == turn.id) { "This turn is no longer available." }
            val source = result.optJSONArray("messages")
            val messages = (0 until (source?.length() ?: 0)).mapNotNull { index ->
                val item = source!!.getJSONObject(index); val role = item.optString("role")
                if (role !in listOf("user", "assistant")) null else TurnReviewMessage(role, item.optString("text"), item.optBoolean("truncated"))
            }
            mutable.update { it.copy(selected = selected, messages = messages, detailLoaded = true,
                turns = it.turns.map { entry -> if (entry.id == selected.id) selected else entry }) }
        }
    }
    private fun load(cursor: String?) = run {
        val result = call("review.list", JSONObject().put("limit", 40).apply { cursor?.let { put("before", it) } })
        val array = result.getJSONArray("turns")
        val turns = (0 until array.length()).map { index -> parseTurn(array.getJSONObject(index)) }
        mutable.update { it.copy(turns = if (cursor == null) turns else (it.turns + turns).distinctBy { entry -> entry.id }, next = result.optString("nextCursor").takeIf { it.isNotBlank() && it != "null" }) }
    }
    fun diff(turn: TurnReviewEntry, change: TurnReviewChange) {
        mutable.update { it.copy(selected = turn, file = change, patch = null, unavailable = null, truncated = false) }
        run {
            val result = call("review.diff", JSONObject().put("turnId", turn.id).put("activityId", change.activityId).put("rootId", change.rootId).put("path", change.path))
            mutable.update { it.copy(patch = result.optString("patch"), truncated = result.optBoolean("truncated"), unavailable = result.optString("unavailableReason").takeIf { value -> value.isNotBlank() && value != "null" }) }
        }
    }
    fun back(): Boolean {
        if (mutable.value.file == null && mutable.value.selected == null) return false
        cancel()
        mutable.update { if (it.file != null) it.copy(file = null, patch = null, busy = false, error = null, unavailable = null, truncated = false)
            else it.copy(selected = null, messages = emptyList(), detailLoaded = false, busy = false, error = null) }
        return true
    }
    fun dismiss() { cancel(); mutable.update { it.copy(busy = false, file = null, patch = null, error = null, truncated = false, unavailable = null, selected = null, messages = emptyList(), detailLoaded = false) } }
    fun dismissError() { mutable.update { it.copy(error = null) } }
    companion object {
        fun unavailableLabel(reason: String): String = when (reason) {
            "binary" -> "Binary file · no text preview"
            "too-large" -> "This diff is too large to preview in full"
            "preview-only" -> "The completed diff is not available yet"
            else -> "Preview unavailable"
        }
        fun parseTurn(value: JSONObject): TurnReviewEntry {
            val changes = value.optJSONArray("changes")
            return TurnReviewEntry(value.getString("id"), value.optInt("number"), value.optString("prompt"), value.optString("response"), value.optString("state"),
                (0 until (changes?.length() ?: 0)).map { i -> changes!!.getJSONObject(i).let {
                    TurnReviewChange(it.getString("activityId"), it.getString("rootId"), it.getString("path"), it.optString("kind"), it.optInt("additions"), it.optInt("deletions"))
                } })
        }
    }
}
