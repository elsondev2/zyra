package dev.zyra.mobile.ui

import dev.zyra.mobile.data.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import org.json.JSONObject
import java.time.Instant

data class PluginStoreState(val loaded: Boolean = false, val loading: Boolean = false, val working: Boolean = false,
    val query: String = "", val category: String = "", val catalog: PluginStoreCatalog = PluginStoreCatalog(), val selected: StorePlugin? = null,
    val download: PluginDownload? = null, val installed: Boolean = false, val uncertain: Boolean = false, val error: String? = null)

class PluginStoreController(private val scope: CoroutineScope, private val now: () -> Long = System::currentTimeMillis) {
    private val mutable = MutableStateFlow(PluginStoreState())
    val state = mutable.asStateFlow()
    private var request: (suspend (String, JSONObject) -> JSONObject)? = null
    private var owner = ""
    private var generation = 0
    private var listGeneration = 0
    private var listJob: Job? = null
    private var workJob: Job? = null
    private var pollJob: Job? = null
    private var ownsPreparation = false
    private var visible = true
    fun open(key: String, call: suspend (String, JSONObject) -> JSONObject) {
        if (owner != key) close() else disconnect()
        owner = key; request = call; refresh()
    }
    fun disconnect() {
        generation++; listGeneration++; listJob?.cancel(); workJob?.cancel(); pollJob?.cancel(); request = null
        val interrupted = ownsPreparation; ownsPreparation = false
        mutable.update { it.copy(loading = false, working = false, download = null, uncertain = interrupted || it.uncertain,
            error = if (interrupted) "The connection changed. Check installed Plugins before preparing it again." else it.error) }
    }
    fun leave() {
        val call = request
        if (ownsPreparation && call != null) scope.launch(start = CoroutineStart.UNDISPATCHED) { runCatching { call("plugins.download.cancel", JSONObject()) } }
        disconnect(); mutable.update { it.copy(selected = null, download = null, installed = false, uncertain = false, error = null) }
    }
    fun close() { leave(); owner = ""; mutable.value = PluginStoreState() }
    fun pause() { visible = false; pollJob?.cancel() }
    fun resume() { visible = true; poll() }
    fun refresh() = load(false)
    fun more() { if (mutable.value.catalog.nextCursor != null) load(true) }
    fun search(query: String) { mutable.update { it.copy(query = query.take(160)) }; load(false, 250) }
    fun category(value: String) { mutable.update { it.copy(category = value) }; load(false) }
    private fun load(append: Boolean, delayMs: Long = 0) {
        val call = request ?: return
        if (append && mutable.value.loading) return
        listJob?.cancel(); val epoch = generation; val listEpoch = ++listGeneration; val current = mutable.value
        mutable.update { it.copy(loading = true, error = null) }
        listJob = scope.launch {
            try {
                if (delayMs > 0) delay(delayMs)
                val params = JSONObject().put("query", current.query).put("category", current.category).put("limit", 24)
                if (append) params.put("cursor", current.catalog.nextCursor)
                val result = PluginStoreCatalog.parse(call("plugins.store", params))
                if (epoch == generation && listEpoch == listGeneration) {
                    check(!append || result.revision == current.catalog.revision) { "The Store changed. Refresh to continue." }
                    mutable.update { it.copy(loaded = true, loading = false, selected = result.entries.find { entry -> entry.name == it.selected?.name } ?: it.selected,
                        catalog = if (append) result.copy(entries = (current.catalog.entries + result.entries).distinctBy { entry -> entry.name }) else result) }
                }
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { if (epoch == generation && listEpoch == listGeneration) mutable.update { it.copy(loading = false, error = e.message ?: "Could not load the Plugin Store.") } }
        }
    }
    fun select(entry: StorePlugin) { if (!ownsPreparation && !mutable.value.working) mutable.update { it.copy(selected = entry, installed = false, uncertain = false, error = null) } }
    fun back(): Boolean {
        if (mutable.value.selected == null) return false
        if (ownsPreparation || mutable.value.working) return false // Parent leaves and closes the owned acquisition.
        mutable.update { it.copy(selected = null, download = null, error = null, uncertain = false, installed = false) }; return true
    }
    fun prepare() {
        val call = request ?: return; val entry = mutable.value.selected ?: return
        if (mutable.value.working || ownsPreparation || mutable.value.uncertain || !entry.installable || !mutable.value.catalog.manageMachine) return
        ownsPreparation = true; val epoch = generation
        mutable.update { it.copy(working = true, error = null, installed = false) }
        workJob = scope.launch {
            try {
                val value = PluginDownload.parse(call("plugins.download.start", JSONObject().put("name", entry.name)))
                if (epoch == generation) { mutable.update { it.copy(working = false, download = value) }; poll() }
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { if (epoch == generation) mutable.update { it.copy(working = false, uncertain = true, error = e.message ?: "Could not confirm Plugin preparation.") } }
        }
    }
    private fun poll() {
        val call = request ?: return; val download = mutable.value.download ?: return
        if (!visible || download.status != "downloading" || pollJob?.isActive == true) return
        val epoch = generation
        pollJob = scope.launch {
            try {
                while (visible && epoch == generation) {
                    val value = PluginDownload.parse(call("plugins.download.status", JSONObject().put("id", download.id)))
                    if (epoch != generation) return@launch
                    mutable.update { it.copy(download = value, error = value.error) }
                    if (value.status != "downloading") return@launch
                    delay(1500)
                }
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { if (epoch == generation) mutable.update { it.copy(uncertain = true, error = e.message ?: "Could not read Plugin progress. Cancel preparation to try again.") } }
        }
    }
    fun cancel() {
        val call = request ?: return
        if (mutable.value.working) return
        pollJob?.cancel(); val epoch = generation
        mutable.update { it.copy(working = true) }
        workJob = scope.launch {
            try {
                call("plugins.download.cancel", JSONObject())
                if (epoch == generation) { ownsPreparation = false; mutable.update { it.copy(working = false, download = null, uncertain = false, error = null) } }
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { if (epoch == generation) mutable.update { it.copy(working = false, uncertain = true, error = e.message ?: "Reconnect to finish cancellation.") } }
        }
    }
    fun install() {
        val call = request ?: return; val download = mutable.value.download ?: return; val review = download.review ?: return
        if (mutable.value.working || mutable.value.uncertain) return
        if (runCatching { Instant.parse(review.expiresAt).toEpochMilli() }.getOrDefault(0) <= now()) {
            mutable.update { it.copy(error = "This review expired. Cancel preparation and prepare a fresh copy.") }; return
        }
        val epoch = generation; mutable.update { it.copy(working = true, error = null) }
        workJob = scope.launch {
            try {
                call("plugins.install", JSONObject().put("id", download.id).put("confirmed", true).put("reviewId", review.id).put("digest", review.digest))
                if (epoch == generation) { ownsPreparation = false; mutable.update { it.copy(working = false, download = null, installed = true) }; refresh() }
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { if (epoch == generation) mutable.update { it.copy(working = false, uncertain = true, error = (e.message ?: "Could not confirm installation.") + " Check installed Plugins before trying again.") } }
        }
    }
}
