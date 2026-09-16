package dev.zyra.mobile.ui

import dev.zyra.mobile.data.AvailableModel
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*

data class ModelPickerState(
    val visible: Boolean = false, val loading: Boolean = false, val applying: String? = null,
    val models: List<AvailableModel> = emptyList(), val error: String? = null
)

/** Catalog requests belong to a connection; configuration always belongs to the opening chat. */
class ModelPickerController(private val scope: CoroutineScope, private val now: () -> Long = { System.nanoTime() / 1_000_000 }) {
    private val mutable = MutableStateFlow(ModelPickerState())
    val state = mutable.asStateFlow()
    private var epoch = 0
    private var job: Job? = null
    private val catalogScope = CoroutineScope(scope.coroutineContext + SupervisorJob(scope.coroutineContext[Job]))
    private var catalogSource: Any? = null
    private var catalog: Deferred<List<AvailableModel>>? = null
    private var cachedModels: List<AvailableModel>? = null
    private var cachedAt = 0L
    private var configure: (suspend (String, String) -> Unit)? = null

    private fun request(source: Any, load: suspend () -> List<AvailableModel>): Deferred<List<AvailableModel>> {
        if (catalogSource !== source) {
            catalog?.cancel(); catalog = null; cachedModels = null
            catalogSource = source
        }
        cachedModels?.takeIf { now() - cachedAt in 0L until 120_000L }?.let { return CompletableDeferred(it) }
        catalog?.takeIf { it.isActive }?.let { return it }
        // A failed prefetch is silent until the user opens the picker; async retains the error.
        val pending = catalogScope.async(start = CoroutineStart.LAZY) {
            val models = load().distinctBy { it.id }
            if (catalogSource === source && currentCoroutineContext().isActive) {
                cachedModels = models; cachedAt = now()
            }
            models
        }
        catalog = pending
        pending.start()
        return pending
    }
    fun prefetch(source: Any, load: suspend () -> List<AvailableModel>) {
        // Supervisor isolates catalog errors from the session scope.
        scope.launch { try { request(source, load).await() } catch (_: Exception) { } }
    }
    fun open(source: Any, load: suspend () -> List<AvailableModel>, configure: suspend (String, String) -> Unit) {
        close()
        this.configure = configure
        val ticket = epoch
        val cached = cachedModels.takeIf { catalogSource === source }
        mutable.value = ModelPickerState(visible = true, loading = cached == null, models = cached.orEmpty())
        val pending = request(source, load)
        job = scope.launch {
            try {
                val models = pending.await()
                if (ticket == epoch) mutable.update { it.copy(loading = false, models = models, error = null) }
            } catch (error: Exception) {
                if (error !is CancellationException && ticket == epoch) mutable.update { it.copy(loading = false, error = error.message ?: "Could not load models") }
            }
        }
    }
    fun select(modelId: String) {
        if (mutable.value.models.none { it.id == modelId }) return
        apply("model", modelId, closeAfter = true)
    }
    fun selectInline(modelId: String) {
        if (mutable.value.models.none { it.id == modelId }) return
        apply("model", modelId, closeAfter = false)
    }
    fun thinking(modelId: String, effort: String) {
        if (mutable.value.models.find { it.id == modelId || it.id.substringAfter('/') == modelId }?.efforts?.contains(effort) != true) return
        apply("thinking", effort, closeAfter = false)
    }
    private fun apply(field: String, value: String, closeAfter: Boolean) {
        val request = configure ?: return
        if (!mutable.value.visible || mutable.value.loading || mutable.value.applying != null) return
        val ticket = epoch
        mutable.update { it.copy(applying = value, error = null) }
        job = scope.launch {
            try {
                request(field, value)
                if (ticket == epoch) { if (closeAfter) close() else mutable.update { it.copy(applying = null) } }
            } catch (error: Exception) {
                if (error !is CancellationException && ticket == epoch) mutable.update { it.copy(applying = null, error = error.message ?: "Could not update this chat") }
            }
        }
    }
    fun close(clearCache: Boolean = false) {
        epoch++; job?.cancel(); job = null; configure = null
        mutable.value = ModelPickerState()
        if (clearCache) { catalog?.cancel(); catalog = null; catalogSource = null; cachedModels = null }
    }
}

