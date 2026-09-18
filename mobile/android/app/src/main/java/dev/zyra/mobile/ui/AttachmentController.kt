package dev.zyra.mobile.ui

import android.app.Application
import android.net.Uri
import dev.zyra.mobile.data.*
import dev.zyra.mobile.network.UploadTransfer
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import org.json.JSONObject
import java.io.File

data class AttachmentProgress(val attachment: LocalAttachment, val offset: Long = 0, val ready: Boolean = false, val error: String? = null)
data class AttachmentState(val items: List<AttachmentProgress> = emptyList(), val preparing: Boolean = false, val uploading: Boolean = false, val error: String? = null, val optimize: Boolean = true) {
    val readyImageIds get() = items.filter { it.ready && it.attachment.mimeType.startsWith("image/") }.map { it.attachment.id }
    val readyFileIds get() = items.filter { it.ready && !it.attachment.mimeType.startsWith("image/") }.map { it.attachment.id }
    val readyIds get() = items.filter { it.ready }.map { it.attachment.id }
    val readyToSend get() = !preparing && !uploading && items.all { it.ready }
}
class AttachmentController(private val app: Application, private val scope: CoroutineScope) {
    val store = AttachmentStore(File(app.filesDir, "attachments"))
    private val mutable = MutableStateFlow(AttachmentState()); val state = mutable.asStateFlow()
    private var machine = ""; private var session = ""; private var epoch = 0
    private var request: (suspend (String, JSONObject) -> JSONObject)? = null
    private var prepare: Job? = null
    private var upload: Job? = null; private var load: Job? = null
    fun optimize(value: Boolean) { mutable.update { it.copy(optimize = value) } }
    fun open(machine: String, session: String, request: (suspend (String, JSONObject) -> JSONObject)?) {
        epoch++; upload?.cancel(); load?.cancel(); this.machine = machine; this.session = session; this.request = request
        val generation = epoch
        mutable.update { it.copy(items = emptyList(), preparing = true, uploading = false, error = null) }
        load = scope.launch {
            try {
                val items = withContext(Dispatchers.IO) { store.cleanOrphans(); store.list(machine, session) }
                if (generation != epoch) return@launch
                mutable.update { it.copy(items = items.map { AttachmentProgress(it) }, preparing = false, uploading = false, error = null) }; resume()
            } catch (error: Exception) { if (error !is CancellationException && generation == epoch) mutable.update { it.copy(preparing = false, error = error.message) } }
        }
    }
    fun add(uris: List<Uri>, cleanup: () -> Unit = {}) {
        if (prepare?.isActive == true) { cleanup(); return }
        if (machine.isBlank() || session.isBlank()) { mutable.update { it.copy(error = "Choose a chat before attaching files.") }; cleanup(); return }
        val owner = machine; val chat = session; val generation = epoch; val optimize = mutable.value.optimize
        mutable.update { it.copy(preparing = true, error = null) }
        prepare = scope.launch {
            try {
                for (uri in uris.take(12)) {
                    val attachment = withContext(Dispatchers.IO) { FilePreparation.add(app, store, owner, chat, uri, optimize) }
                    if (generation == epoch) mutable.update { it.copy(items = it.items + AttachmentProgress(attachment)) }
                }
            } catch (error: Exception) { if (error !is CancellationException && generation == epoch) mutable.update { it.copy(error = error.message) } }
            finally { cleanup(); if (generation == epoch) { mutable.update { it.copy(preparing = false) }; resume() } else if (machine == owner && session == chat) open(machine, session, request) }
        }
    }
    fun resume() {
        if (upload?.isActive == true || request == null) return
        val generation = epoch; val call = request!!
        mutable.update { it.copy(items = it.items.map { item -> item.copy(error = null) }, uploading = true, error = null) }
        upload = scope.launch {
            try {
                while (isActive && generation == epoch) {
                    val next = mutable.value.items.firstOrNull { !it.ready } ?: break
                    try {
                        UploadTransfer.send(store.file(next.attachment.id), next.attachment, call) { offset ->
                            if (generation == epoch) mutable.update { it.copy(items = it.items.map { item -> if (item.attachment.id == next.attachment.id) item.copy(offset = offset) else item }) }
                        }
                        if (generation == epoch) mutable.update { it.copy(items = it.items.map { item -> if (item.attachment.id == next.attachment.id) item.copy(ready = true) else item }) }
                    } catch (error: Exception) {
                        if (error is CancellationException) throw error
                        if (generation == epoch) mutable.update { it.copy(items = it.items.map { item -> if (item.attachment.id == next.attachment.id) item.copy(error = error.message ?: "Upload paused") else item }) }
                        break
                    }
                }
            } finally { if (generation == epoch) mutable.update { it.copy(uploading = false) } }
        }
    }
    fun remove(id: String) = scope.launch {
        upload?.cancelAndJoin()
        try {
            withContext(Dispatchers.IO) { store.remove(listOf(id)) }
            mutable.update { it.copy(items = it.items.filterNot { item -> item.attachment.id == id }) }
            runCatching { withTimeout(5000) { request?.invoke("upload.cancel", JSONObject().put("uploadId", id)) } }
            resume()
        } catch (error: Exception) { if (error !is CancellationException) mutable.update { it.copy(error = error.message) } }
    }
    suspend fun submitted(ids: List<String>, operation: String) {
        withContext(Dispatchers.IO) { store.submitted(ids, operation) }
        mutable.update { it.copy(items = it.items.filterNot { item -> item.attachment.id in ids }) }
    }
    suspend fun completed(operation: String) { withContext(Dispatchers.IO) { store.complete(operation) } }
    suspend fun forget(machine: String) { prepare?.cancelAndJoin(); withContext(Dispatchers.IO) { store.forget(machine) } }
    fun detached() { upload?.cancel(); request = null; mutable.update { it.copy(uploading = false) } }
}
