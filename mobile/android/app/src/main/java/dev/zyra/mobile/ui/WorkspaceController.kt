package dev.zyra.mobile.ui
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import org.json.JSONObject
import dev.zyra.mobile.data.GitChange

data class WorkspaceRoot(val id: String, val label: String, val readOnly: Boolean)
data class WorkspaceEntry(val name: String, val path: String, val directory: Boolean, val accessible: Boolean)
data class WorkspaceFile(val path: String, val text: String, val original: String, val hash: String, val readOnly: Boolean, val binary: Boolean, val large: Boolean, val size: Long, val etag: String, val line: Int = 0)
data class WorkspaceState(val roots: List<WorkspaceRoot> = emptyList(), val root: String = "", val path: String = "", val entries: List<WorkspaceEntry> = emptyList(),
    val nextOffset: Int? = null, val hidden: Boolean = false, val fileQuery: String = "", val fileSearchOpen: Boolean = false, val file: WorkspaceFile? = null, val busy: Boolean = false, val error: String? = null,
    val git: Boolean = false, val changes: List<GitChange> = emptyList(), val diff: String? = null, val staged: Boolean = false, val discard: Boolean = false,
    val repository: Boolean = true, val branch: String = "", val gitQuery: String = "", val gitTotal: Int = 0, val gitNextOffset: Int? = null,
    val gitWorkingCount: Int = 0, val gitStagedCount: Int = 0, val gitMatchCount: Int = 0,
    val diffPath: String = "", val diffTruncated: Boolean = false, val saving: Boolean = false, val editing: Boolean = false,
    val fileLink: String? = null, val fileSource: Boolean = false, val fileWrap: Boolean = true, val turnReviewOpen: Boolean = false, val reviewAvailable: Boolean = false)
class WorkspaceController(private val scope: CoroutineScope) {
    val turnReview = TurnReviewController(scope)
    private var reviewAvailable = false
    private var fileMoveAvailable = false
    fun enableFileMove(available: Boolean) { fileMoveAvailable = available }
    fun canMoveFiles(): Boolean = fileMoveAvailable
    fun enableReview(available: Boolean) { reviewAvailable = available }
    private val mutable = MutableStateFlow(WorkspaceState())
    val state = mutable.asStateFlow()
    private var request: (suspend (String, JSONObject) -> JSONObject)? = null
    private var job: Job? = null
    private var generation = 0
    private var transferOwner = java.util.UUID.randomUUID().toString()
    private var navigation: (() -> Unit)? = null
    fun open(call: suspend (String, JSONObject) -> JSONObject) = openAt(null, call)
    fun open(cacheOwner: String, call: suspend (String, JSONObject) -> JSONObject) = openAt(null, call, cacheOwner)
    fun openLink(destination: String, call: suspend (String, JSONObject) -> JSONObject) = openAt(destination, call)
    fun openLink(destination: String, cacheOwner: String, call: suspend (String, JSONObject) -> JSONObject) = openAt(destination, call, cacheOwner)
    private fun openAt(destination: String?, call: suspend (String, JSONObject) -> JSONObject, cacheOwner: String? = null) {
        generation++; job?.cancel(); transferOwner = cacheOwner ?: java.util.UUID.randomUUID().toString(); request = call; mutable.value = WorkspaceState(reviewAvailable = reviewAvailable)
        turnReview.bind(call)
        run {
            val result = this.call("workspace.roots", JSONObject()).getJSONArray("roots")
            val roots = (0 until result.length()).map { i -> result.getJSONObject(i).let { WorkspaceRoot(it.getString("id"), it.getString("label"), it.optBoolean("readOnly")) } }
            mutable.update { it.copy(roots = roots, root = roots.firstOrNull()?.id.orEmpty()) }
            if (destination != null) {
                val link = this.call("workspace.link", JSONObject().put("destination", destination))
                val rootId = link.getString("rootId")
                check(roots.any { it.id == rootId }) { "This folder is no longer shared with your phone." }
                val path = link.getString("path")
                mutable.update { it.copy(root = rootId) }
                if (link.optBoolean("directory")) directoryNow(path)
                else { directoryNow(path.substringBeforeLast('/', "")); fileNow(path, link.optInt("line").coerceIn(0, 1000000)) }
            } else if (roots.isNotEmpty()) directoryNow("")
        }
    }
    private fun run(saving: Boolean = false, action: suspend () -> Unit) {
        generation++; job?.cancel(); val epoch = generation
        mutable.update { it.copy(busy = true, saving = saving, error = null) }
        job = scope.launch {
            try { action() }
            catch (error: Exception) { if (error !is CancellationException && epoch == generation) mutable.update { it.copy(error = error.message ?: "Could not load the workspace.") } }
            finally { if (epoch == generation) mutable.update { it.copy(busy = false, saving = false) } }
        }
    }
    private suspend fun call(method: String, params: JSONObject = JSONObject()): JSONObject {
        val epoch=generation;val current=request ?: error("Reconnect to your PC.")
        val result=current(method,params.put("rootId",mutable.value.root))
        if(epoch!=generation) throw CancellationException("Workspace changed")
        currentCoroutineContext().ensureActive()
        return result
    }
    private fun guard(action: () -> Unit) {
        if(mutable.value.saving) {mutable.update {it.copy(error="Wait for this save to finish.")};return}
        val file = mutable.value.file
        if (file != null && file.text != file.original) { navigation = action; mutable.update { it.copy(discard = true) } }
        else action()
    }
    fun discard(confirm: Boolean) { val action = navigation; navigation = null; mutable.update { it.copy(discard = false, file = if (confirm) it.file?.let { file -> file.copy(text = file.original) } else it.file) }; if (confirm) action?.invoke() }
    fun root(id: String) = guard { if (mutable.value.roots.none { it.id == id }) return@guard; turnReview.dismiss(); mutable.update { WorkspaceState(roots=it.roots,root=id,hidden=it.hidden,reviewAvailable=reviewAvailable) }; run { directoryNow("") } }
    fun gitRoot(id: String) = guard {
        if (mutable.value.roots.none { it.id == id }) return@guard
        turnReview.dismiss()
        mutable.update { WorkspaceState(roots = it.roots, root = id, hidden = it.hidden, git = true, staged = it.staged, fileWrap = it.fileWrap, reviewAvailable = reviewAvailable) }
        run { gitNow() }
    }
    fun directory(path: String) = guard { mutable.update { it.copy(fileQuery = "", fileSearchOpen = false) }; run { directoryNow(path) } }
    fun fileSearch(open: Boolean) {
        mutable.update { it.copy(fileSearchOpen = open) }
        if (!open && mutable.value.fileQuery.isNotBlank()) searchFiles("")
    }
    fun searchFiles(value: String) {
        mutable.update { it.copy(fileQuery = value.take(160), entries = emptyList(), nextOffset = null) }
        run { delay(250); directoryNow(mutable.value.path) }
    }
    fun followLink(destination: String) = guard { run {
        val current = mutable.value
        val result = call("workspace.link", JSONObject().put("destination", destination)
            .put("basePath", current.file?.path?.substringBeforeLast('/', "") ?: current.path))
        val rootId = result.getString("rootId")
        check(current.roots.any { it.id == rootId }) { "This folder is no longer shared with your phone." }
        val path = result.getString("path")
        mutable.update { it.copy(root = rootId, turnReviewOpen = false) }
        if (result.optBoolean("directory")) directoryNow(path)
        else { directoryNow(path.substringBeforeLast('/', "")); fileNow(path, result.optInt("line").coerceIn(0, 1000000)) }
    } }
    private suspend fun directoryNow(path: String, offset: Int = 0) {
        val result = call("workspace.files.list", JSONObject().put("path", path).put("offset", offset).put("hidden", mutable.value.hidden).put("query", mutable.value.fileQuery))
        val array = result.getJSONArray("entries")
        val entries = (0 until array.length()).map { i -> array.getJSONObject(i).let { WorkspaceEntry(it.getString("name"), it.getString("path"), it.optBoolean("directory"), it.optBoolean("accessible", true)) } }
        mutable.update { it.copy(path = path, file = null, fileLink = null, editing = false, git = false, diff = null, entries = if (offset > 0) (it.entries + entries).distinctBy { entry -> entry.path } else entries,
            nextOffset = if (result.isNull("nextOffset")) null else result.optInt("nextOffset")) }
    }
    fun more() { val current = mutable.value; if (current.nextOffset != null && !current.busy) run { directoryNow(current.path, current.nextOffset) } }
    fun toggleHidden() { mutable.update { it.copy(hidden = !it.hidden) }; run { directoryNow(mutable.value.path) } }
    fun file(entry: WorkspaceEntry) = guard {
        if (!entry.accessible) return@guard
        if (entry.directory) directory(entry.path)
        else run { fileNow(entry.path) }
    }
    private suspend fun fileNow(path: String, line: Int = 0) {
        val result = call("workspace.file.read", JSONObject().put("path", path))
        val text = result.optString("text")
        mutable.update { it.copy(editing = false, fileSource = line > 0, fileLink = null, file = WorkspaceFile(path, text, text, result.optString("hash"), result.optBoolean("readOnly"), result.optBoolean("binary"), result.optBoolean("large"), result.optLong("size"), result.optString("etag"), line)) }
    }
    suspend fun downloadFile(rootId: String, file: WorkspaceFile, directory: java.io.File, progress: (Long, Long, Long) -> Unit): java.io.File {
        val epoch = generation
        val source = request ?: error("Reconnect to your computer.")
        fun checkOwner() { check(epoch == generation && mutable.value.root == rootId && mutable.value.file?.path == file.path && mutable.value.file?.text == file.text) { "The open file changed. Try again." } }
        checkOwner()
        check(file.text == file.original) { "Save your changes before downloading this file." }
        val read: suspend (String, JSONObject) -> JSONObject = { method, params ->
            checkOwner()
            val result = source(method, params.put("rootId", rootId))
            currentCoroutineContext().ensureActive(); checkOwner(); result
        }
        val metadata = read("workspace.file.read", JSONObject().put("path", file.path))
        check(if (file.hash.isNotBlank()) metadata.optString("hash") == file.hash else metadata.optString("etag") == file.etag) { "The file changed on the computer. Refresh it before downloading." }
        return dev.zyra.mobile.data.WorkspaceFileDownloads(directory).load(transferOwner + ":" + rootId, file.path, metadata, read, progress)
    }
    fun moveFile(destination: String) = guard {
        val file = mutable.value.file ?: return@guard
        if (!fileMoveAvailable || file.readOnly) return@guard
        run(saving = true) {
            val fresh = call("workspace.file.read", JSONObject().put("path", file.path))
            check(if (file.hash.isNotBlank()) fresh.optString("hash") == file.hash else fresh.optString("etag") == file.etag) { "The file changed on the computer. Refresh it before moving." }
            val result = call("workspace.move", JSONObject().put("path", file.path).put("destination", destination).put("etag", fresh.getString("etag")))
            val moved = result.getString("path")
            directoryNow(moved.substringBeforeLast('/', "")); fileNow(moved)
        }
    }
    fun edit(text: String) { mutable.update { it.copy(file = it.file?.copy(text = text)) } }
    fun startEditing() { if (mutable.value.file?.let { !it.readOnly && !it.binary && !it.large } == true) mutable.update { it.copy(editing = true) } }
    fun preview() { mutable.update { it.copy(editing = false) } }
    fun selectFileLink(link: String?) {
        mutable.update { it.copy(fileLink = link?.takeIf { target -> it.file != null && !it.fileSource &&
            (dev.zyra.mobile.data.MarkdownLinks.external(target) != null || dev.zyra.mobile.data.MarkdownLinks.isProjectFile(target)) }) }
    }
    fun fileSource(source: Boolean) { mutable.update { it.copy(fileSource = source, fileLink = null) } }
    fun fileWrap(wrap: Boolean) { mutable.update { it.copy(fileWrap = wrap) } }
    fun dismissError() { mutable.update { it.copy(error = null) } }
    fun files() = guard { cancelPending(); turnReview.dismiss(); mutable.update { it.copy(file = null, fileLink = null, editing = false, git = false, turnReviewOpen = false, diff = null, error = null) } }
    fun changes() = guard {
        if (!reviewAvailable) { git(); return@guard }
        cancelPending(); mutable.update { it.copy(file = null, fileLink = null, git = true, turnReviewOpen = true, diff = null, error = null) }
        turnReview.refresh()
    }
    fun save() {
        val file = mutable.value.file ?: return
        if (file.readOnly || file.hash.isBlank() || mutable.value.busy || file.text==file.original) return
        if (file.text.toByteArray(Charsets.UTF_8).size > 131072) { mutable.update { it.copy(error = "This edit exceeds the 128 KB text limit. Shorten it before saving.") }; return }
        run(saving = true) {
            val result = call("workspace.file.write", JSONObject().put("path", file.path).put("text", file.text).put("hash", file.hash))
            mutable.update { it.copy(file = it.file?.copy(hash = result.getString("hash"), original = file.text), error = null) }
        }
    }
    fun git() = guard {
        turnReview.dismiss(); mutable.update { it.copy(git=true,turnReviewOpen=false,file=null,fileLink=null,diff=null) };run { gitNow() }
    }
    private suspend fun gitNow(offset: Int = 0) {
        val result=call("workspace.git.status",JSONObject().put("offset",offset).put("query",mutable.value.gitQuery).put("mode",if(mutable.value.staged) "staged" else "working"));val array=result.getJSONArray("files")
        val changes=(0 until array.length()).map { i -> array.getJSONObject(i).let { GitChange(it.getString("path"),it.optString("index"),it.optString("worktree"),it.optString("oldPath")) } }
        mutable.update { it.copy(repository=result.optBoolean("repository",true),branch=result.optString("branch"),
            changes=if(offset>0) (it.changes+changes).distinctBy { file->file.path } else changes,gitTotal=result.optInt("total",changes.size),
            gitWorkingCount=result.optInt("workingCount",changes.count {file->file.working}),gitStagedCount=result.optInt("stagedCount",changes.count {file->file.staged}),gitMatchCount=result.optInt("matchCount",changes.size),
            gitNextOffset=if(result.isNull("nextOffset")) null else result.optInt("nextOffset")) }
    }
    fun moreChanges() {val next=mutable.value.gitNextOffset?:return;if(!mutable.value.busy)run {gitNow(next)}}
    fun gitSearch(value: String) {mutable.update {it.copy(gitQuery=value.take(160))};run {delay(250);gitNow()}}
    fun gitMode(staged: Boolean) {if(mutable.value.diff!=null)diff(staged,mutable.value.diffPath) else {mutable.update {it.copy(staged=staged)};run {gitNow()}}}
    fun review(change: GitChange) {diff(mutable.value.staged,change.path)}
    fun refreshGit() {if(mutable.value.diff!=null)diff(mutable.value.staged,mutable.value.diffPath) else run {gitNow()}}
    fun diff(staged: Boolean, path: String = "") {run {
        val params=JSONObject().put("staged",staged).put("path",path).put("preview",true)
        mutable.value.changes.find {it.path==path}?.oldPath?.takeIf {it.isNotBlank()}?.let {params.put("oldPath",it)}
        val result=call("workspace.git.diff",params)
        mutable.update {it.copy(diff=result.optString("diff"),staged=staged,diffPath=path,diffTruncated=result.optBoolean("truncated"))}
    }}
    private fun cancelPending() {generation++;job?.cancel();mutable.update {it.copy(busy=false)}}
    fun back(exit: () -> Unit) = guard {
        if(mutable.value.saving) {mutable.update {it.copy(error="Wait for this save to finish.")};return@guard}
        cancelPending()
        when {
            mutable.value.file == null && !mutable.value.git && mutable.value.fileSearchOpen -> fileSearch(false)
            mutable.value.turnReviewOpen -> if (!turnReview.back()) files()
            mutable.value.diff != null -> mutable.update { it.copy(diff = null) }
            mutable.value.file != null -> mutable.update { it.copy(file = null, fileLink = null) }
            mutable.value.git -> directory(mutable.value.path)
            mutable.value.path.isNotBlank() -> directory(mutable.value.path.substringBeforeLast('/', ""))
            else -> exit()
        }
    }
}


