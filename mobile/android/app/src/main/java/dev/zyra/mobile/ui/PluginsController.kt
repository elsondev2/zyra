package dev.zyra.mobile.ui

import dev.zyra.mobile.data.PluginCatalog
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import org.json.JSONArray
import org.json.JSONObject

data class PluginsState(val loaded: Boolean = false, val busy: Boolean = false, val saving: Boolean = false, val query: String = "",
    val catalog: PluginCatalog = PluginCatalog(), val editing: Boolean = false, val selection: Set<String> = emptySet(), val editRevision: Long = 0,
    val reviewing: Boolean = false, val reviewRevision: Long = 0, val reviewCatalog: PluginCatalog? = null,
    val needsRefresh: Boolean = false, val error: String? = null, val notice: String? = null)

class PluginsController(private val scope: CoroutineScope) {
    private val mutable = MutableStateFlow(PluginsState())
    val state = mutable.asStateFlow()
    private var request: (suspend (String, JSONObject) -> JSONObject)? = null
    private var owner = ""
    private var generation = 0
    private var job: Job? = null
    fun close() { disconnect(); owner = ""; mutable.value = PluginsState() }
    fun disconnect() { generation++; job?.cancel(); request = null; mutable.update { it.copy(busy = false, saving = false, reviewing = false) } }
    fun open(key: String, call: suspend (String, JSONObject) -> JSONObject) {
        val same = key == owner
        if (!same) close() else disconnect()
        owner = key; request = call
        if (same && mutable.value.loaded) checkForChanges() else refresh()
    }
    fun unavailable(message: String) { close(); mutable.value = PluginsState(error = message) }
    fun refresh() = load(false)
    fun checkForChanges() { if (mutable.value.loaded && !mutable.value.busy && !mutable.value.saving) load(false, conditional = true) }
    fun more() { if (mutable.value.catalog.nextCursor != null) load(true) }
    fun search(query: String) {
        if (mutable.value.saving) return
        mutable.update { it.copy(query = query.take(160)) }; load(false, 250)
    }
    private fun apply(catalog: PluginCatalog, append: Boolean) {
        mutable.update { old -> old.copy(loaded = true, busy = false, saving = false, needsRefresh = false,
            catalog = if (append) catalog.copy(plugins = (old.catalog.plugins + catalog.plugins).distinctBy { it.id }) else catalog,
            error = if (old.editing && old.editRevision != catalog.defaultsRevision) "Defaults changed on the PC. Review its latest selection before saving." else null) }
    }
    private fun load(append: Boolean, delayMs: Long = 0, conditional: Boolean = false) {
        val call = request ?: return
        if (mutable.value.saving || (append && mutable.value.busy)) return
        job?.cancel(); val epoch = ++generation
        val current = mutable.value
        mutable.update { it.copy(busy = true, error = if (conditional) it.error else null) }
        job = scope.launch {
            try {
                if (delayMs > 0) delay(delayMs)
                val params = JSONObject().put("query", current.query).put("limit", 32)
                if (append) params.put("cursor", current.catalog.nextCursor)
                if (conditional && current.catalog.viewVersion.isNotBlank()) params.put("ifVersion", current.catalog.viewVersion)
                val response = call("plugins.list", params)
                if (epoch == generation) {
                    if (response.optBoolean("unchanged")) {
                        check(conditional && response.optString("viewVersion") == current.catalog.viewVersion && response.optLong("revision") == current.catalog.revision) { "Refresh Plugins to recover their latest state." }
                        mutable.update { it.copy(busy = false) }
                    } else {
                        val result = PluginCatalog.parse(response)
                        check(!append || result.revision == current.catalog.revision) { "Plugins changed on the PC. Refresh the list." }
                        apply(result, append)
                    }
                }
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { if (epoch == generation) mutable.update { it.copy(busy = false, error = e.message ?: "Could not load Plugins.") } }
        }
    }
    fun edit() {
        val current = mutable.value
        if (!current.loaded || current.saving || !current.catalog.manageDefaults) return
        mutable.update { it.copy(editing = true, selection = it.catalog.defaultIds, editRevision = it.catalog.defaultsRevision, error = null) }
    }
    fun cancelEdit() { mutable.update { it.copy(editing = false) } }
    fun toggle(id: String) {
        val current = mutable.value
        if (!current.editing || current.saving || request == null) return
        val selected = id in current.selection
        if (!selected && current.catalog.plugins.none { it.id == id && it.selectable }) return
        if (!selected && current.selection.size >= current.catalog.selectionLimit) { mutable.update { it.copy(error = "Choose up to ${it.catalog.selectionLimit} Plugins.") }; return }
        mutable.update { it.copy(selection = if (selected) it.selection - id else it.selection + id) }
    }
    fun save() {
        val current = mutable.value
        if (!current.editing || current.needsRefresh || current.editRevision != current.catalog.defaultsRevision) return
        mutate("plugins.defaults", JSONObject().put("pluginIds", JSONArray(current.selection.sorted())).put("expectedRevision", current.editRevision), "Saved for new chats.")
    }
    fun review() { if (mutable.value.catalog.hasChat && mutable.value.loaded && !mutable.value.busy && !mutable.value.saving && !mutable.value.needsRefresh) mutable.update { it.copy(reviewing = true, reviewRevision = it.catalog.revision, reviewCatalog = it.catalog, error = null) } }
    fun cancelReview() { mutable.update { it.copy(reviewing = false) } }
    fun confirm() {
        val current = mutable.value
        if (!current.catalog.hasChat || !current.reviewing || current.needsRefresh) return
        mutate("plugins.refresh", JSONObject().put("confirmed", true).put("expectedCatalogRevision", current.reviewRevision), "This chat is up to date.")
    }
    private fun mutate(method: String, params: JSONObject, notice: String) {
        val call = request ?: return
        if (!mutable.value.loaded || mutable.value.saving || mutable.value.busy) return
        job?.cancel(); val epoch = ++generation
        mutable.update { it.copy(saving = true, error = null, notice = null) }
        job = scope.launch {
            try {
                val value = PluginCatalog.parse(call(method, params))
                if (epoch == generation) {
                    mutable.update { it.copy(editing = false, reviewing = false, query = "") }
                    apply(value, false); mutable.update { it.copy(notice = notice) }
                }
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { if (epoch == generation) mutable.update { it.copy(saving = false, needsRefresh = true, error = (e.message ?: "Could not confirm the change.") + " Refresh before trying again.") } }
        }
    }
}
