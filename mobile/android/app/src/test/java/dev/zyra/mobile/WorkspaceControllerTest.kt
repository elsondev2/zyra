package dev.zyra.mobile
import dev.zyra.mobile.ui.*
import dev.zyra.mobile.data.GitChange
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class WorkspaceControllerTest {
    @Test fun folderSearchDebouncesCancelsAndBackRestoresFolder()=runTest {
        val queries=mutableListOf<String>();val controller=WorkspaceController(this)
        controller.open {method,params->when(method){"workspace.roots"->roots();else->{queries+=params.optString("query");empty()}}};runCurrent()
        controller.fileSearch(true);controller.searchFiles("old");controller.searchFiles("latest");runCurrent()
        assertEquals(listOf(""),queries)
        advanceTimeBy(250);runCurrent();assertEquals(listOf("","latest"),queries)
        controller.back { fail("Search back must not leave the workspace") };advanceUntilIdle()
        assertFalse(controller.state.value.fileSearchOpen);assertEquals("",controller.state.value.fileQuery)
        assertEquals(listOf("","latest",""),queries)
    }
    @Test fun selectedRenderedLinkClearsForSourceAndRejectsInactiveTargets()=runTest {
        val controller=WorkspaceController(this)
        controller.open {method,_->when(method){"workspace.roots"->roots();"workspace.file.read"->JSONObject("""{"text":"[guide](guide.md)","hash":"hash","size":17}""");else->empty()}};runCurrent()
        controller.file(WorkspaceEntry("readme.md","readme.md",false,true));runCurrent()
        controller.selectFileLink("guide.md");assertEquals("guide.md",controller.state.value.fileLink)
        controller.fileSource(true);assertNull(controller.state.value.fileLink)
        controller.selectFileLink("guide.md");assertNull(controller.state.value.fileLink)
        controller.fileSource(false)
        listOf("#heading","javascript:alert(1)","data:text/html,test").forEach {controller.selectFileLink(it);assertNull(controller.state.value.fileLink)}
        controller.selectFileLink("https://example.com");assertEquals("https://example.com",controller.state.value.fileLink)
        controller.directory("");runCurrent();assertNull(controller.state.value.fileLink)
    }
    @Test fun followingSelectedLinkRetainsDirtyGuardAndRelativeFileContext()=runTest {
        val requests=mutableListOf<Pair<String,JSONObject>>();val controller=WorkspaceController(this)
        controller.open {method,params->requests+=method to params;when(method){
            "workspace.roots"->roots()
            "workspace.file.read"->JSONObject("""{"text":"[guide](guide.md)","hash":"hash","size":17}""")
            "workspace.link"->JSONObject("""{"rootId":"root","path":"docs/guide.md","directory":false}""")
            else->empty()
        }};runCurrent()
        controller.file(WorkspaceEntry("readme.md","docs/readme.md",false,true));runCurrent()
        controller.selectFileLink("guide.md");controller.edit("Changed [guide](guide.md)");controller.followLink(controller.state.value.fileLink!!)
        assertTrue(controller.state.value.discard);assertFalse(requests.any {it.first=="workspace.link"})
        controller.discard(false);assertEquals("docs/readme.md",controller.state.value.file?.path)
        controller.followLink("guide.md");controller.discard(true);runCurrent()
        assertEquals("docs/guide.md",controller.state.value.file?.path);assertNull(controller.state.value.fileLink)
        assertEquals("docs",requests.first {it.first=="workspace.link"}.second.optString("basePath"))
    }
    @Test fun fileLinkUsesResolvedRootAndLineAndReturnsToContainingFolder()=runTest {
        val controller=WorkspaceController(this);val requests=mutableListOf<Pair<String,JSONObject>>()
        controller.openLink("src/code.kt:3") {method,params-> requests+=method to params;when(method){
            "workspace.roots"->JSONObject("""{"roots":[{"id":"home","label":"Home"},{"id":"work","label":"Work"}]}""")
            "workspace.link"->JSONObject("""{"rootId":"work","path":"src/code.kt","line":3,"directory":false}""")
            "workspace.file.read"->JSONObject("""{"text":"one\ntwo\nthree","hash":"hash","size":13}""")
            else->empty()
        }};runCurrent()
        assertEquals("work",controller.state.value.root);assertEquals("src",controller.state.value.path)
        assertEquals(3,controller.state.value.file?.line)
        assertEquals("work",requests.last().second.getString("rootId"))
        controller.back {};runCurrent();assertNull(controller.state.value.file);assertEquals("src",controller.state.value.path)
    }
    @Test fun fileLinkCannotReplaceWorkspaceAfterSwitchingPc()=runTest {
        val held=CompletableDeferred<Unit>();val controller=WorkspaceController(this)
        controller.openLink("old.kt") {method,_->when(method){
            "workspace.roots"->roots("old")
            "workspace.link"->{withContext(NonCancellable){held.await()};JSONObject("""{"rootId":"old","path":"old.kt"}""")}
            else->empty()
        }};runCurrent();controller.open {method,_->if(method=="workspace.roots") roots("new") else empty()};runCurrent()
        held.complete(Unit);runCurrent();assertEquals("new",controller.state.value.root);assertNull(controller.state.value.file)
    }
    @Test fun directoryLinksOpenDirectlyWithoutReadingAFile()=runTest {
        val controller=WorkspaceController(this);var reads=0
        controller.openLink("src") {method,_->when(method){
            "workspace.roots"->roots()
            "workspace.link"->JSONObject("""{"rootId":"root","path":"src","directory":true}""")
            "workspace.file.read"->{reads++;JSONObject()}
            else->empty()
        }};runCurrent();assertEquals("src",controller.state.value.path);assertEquals(0,reads)
    }
    private fun roots(id: String="root")=JSONObject("""{"roots":[{"id":"$id","label":"Project","readOnly":false}]}""")
    private fun empty()=JSONObject("""{"entries":[],"nextOffset":null}""")
    @Test fun lateRootsFromPreviousPcCannotReplaceCurrentWorkspace()=runTest {
        val held=CompletableDeferred<Unit>();val controller=WorkspaceController(this)
        controller.open {method,_->if(method=="workspace.roots") {withContext(NonCancellable){held.await()};roots("old")} else empty()};runCurrent()
        controller.open {method,_->if(method=="workspace.roots") roots("new") else empty()};runCurrent()
        held.complete(Unit);runCurrent();assertEquals("new",controller.state.value.root)
    }
    @Test fun reviewUsesSelectedPathAndPreservesExplicitTruncation()=runTest {
        val requests=mutableListOf<Pair<String,JSONObject>>();val controller=WorkspaceController(this)
        controller.open {method,params->requests+=method to params;when(method) {
            "workspace.roots"->roots();"workspace.git.status"->JSONObject("""{"repository":true,"branch":"dev","files":[{"path":"new.kt","oldPath":"old.kt","index":"R","worktree":" "}],"total":1,"workingCount":0,"stagedCount":1,"matchCount":1,"nextOffset":null}""")
            "workspace.git.diff"->JSONObject("""{"diff":"changed","truncated":true}""");else->empty()
        }};runCurrent();controller.git();runCurrent();controller.gitMode(true);runCurrent()
        controller.review(controller.state.value.changes.single());runCurrent()
        val input=requests.last().second;assertEquals("new.kt",input.getString("path"));assertEquals("old.kt",input.getString("oldPath"));assertTrue(input.getBoolean("staged"))
        assertEquals("dev",controller.state.value.branch);assertTrue(controller.state.value.diffTruncated)
    }
    @Test fun searchIsDebouncedAndQueriesThePc()=runTest {
        val queries=mutableListOf<String>();val controller=WorkspaceController(this)
        controller.open {method,params->when(method){"workspace.roots"->roots();"workspace.git.status"->{queries+=params.optString("query");JSONObject("""{"files":[],"repository":true,"nextOffset":null}""")};else->empty()}};runCurrent()
        controller.git();runCurrent();controller.gitSearch("old");controller.gitSearch("latest");runCurrent();assertEquals(listOf(""),queries)
        advanceTimeBy(250);runCurrent();assertEquals(listOf("","latest"),queries)
    }
    @Test fun backPreventsLateDiffFromReopeningTheReview()=runTest {
        val held=CompletableDeferred<Unit>();val controller=WorkspaceController(this)
        controller.open {method,_->when(method){"workspace.roots"->roots();"workspace.git.status"->JSONObject("""{"files":[],"nextOffset":null}""");"workspace.git.diff"->{withContext(NonCancellable){held.await()};JSONObject("""{"diff":"late"}""")};else->empty()}};runCurrent()
        controller.git();runCurrent();controller.diff(false,"gone.txt");runCurrent();controller.back {};runCurrent();held.complete(Unit);runCurrent()
        assertNull(controller.state.value.diff);assertFalse(controller.state.value.git)
    }
    @Test fun backDuringSaveKeepsTheDraftAndDoesNotOfferDiscard()=runTest {
        val held=CompletableDeferred<Unit>();val controller=WorkspaceController(this)
        controller.open {method,_->when(method){
            "workspace.roots"->roots();"workspace.file.read"->JSONObject("""{"text":"old","hash":"original","size":3}""")
            "workspace.file.write"->{held.await();JSONObject("""{"hash":"saved"}""")};else->empty()
        }};runCurrent();controller.file(WorkspaceEntry("file.txt","file.txt",false,true));runCurrent();controller.edit("new");controller.save();runCurrent()
        try {controller.back {};assertFalse(controller.state.value.discard);assertEquals("new",controller.state.value.file?.text)}
        finally {held.complete(Unit);runCurrent()}
        assertNull(controller.state.value.error);assertEquals("new",controller.state.value.file?.original)
    }
    @Test fun previewAndNavigationKeepUnsavedEditsUntilConfirmed()=runTest {
        val controller=WorkspaceController(this)
        controller.open {method,_->when(method){"workspace.roots"->roots();"workspace.file.read"->JSONObject("""{"text":"old","hash":"original","size":3}""");else->empty()}};runCurrent()
        controller.file(WorkspaceEntry("file.txt","file.txt",false,true));runCurrent();assertFalse(controller.state.value.editing)
        controller.startEditing();assertTrue(controller.state.value.editing);controller.edit("new");controller.preview()
        assertFalse(controller.state.value.editing);assertEquals("new",controller.state.value.file?.text)
        controller.files();assertTrue(controller.state.value.discard);controller.discard(false);assertEquals("new",controller.state.value.file?.text)
        controller.directory("src");assertTrue(controller.state.value.discard);controller.discard(true);runCurrent()
        assertEquals("src",controller.state.value.path);assertNull(controller.state.value.file)
    }
    @Test fun oversizedUnicodeEditIsNotSilentlyTruncatedOrSent()=runTest {
        var writes=0;val controller=WorkspaceController(this)
        controller.open {method,_->when(method){"workspace.roots"->roots();"workspace.file.read"->JSONObject("""{"text":"old","hash":"original","size":3}""");"workspace.file.write"->{writes++;JSONObject()};else->empty()}};runCurrent()
        controller.file(WorkspaceEntry("file.txt","file.txt",false,true));runCurrent()
        val draft="漢".repeat(50000);controller.edit(draft);controller.save();runCurrent()
        assertEquals(draft,controller.state.value.file?.text);assertEquals(0,writes);assertTrue(controller.state.value.error!!.contains("128 KB"))
    }
    @Test fun filesToggleCancelsPendingDiffWithoutAnotherDirectoryRequest()=runTest {
        val held=CompletableDeferred<Unit>();var listings=0;val controller=WorkspaceController(this)
        controller.open {method,_->when(method){"workspace.roots"->roots();"workspace.files.list"->{listings++;empty()};"workspace.git.status"->JSONObject("""{"files":[],"nextOffset":null}""");"workspace.git.diff"->{withContext(NonCancellable){held.await()};JSONObject("""{"diff":"late"}""")};else->empty()}};runCurrent()
        controller.git();runCurrent();controller.diff(false,"gone.txt");runCurrent();controller.files();held.complete(Unit);runCurrent()
        assertFalse(controller.state.value.git);assertNull(controller.state.value.diff);assertEquals(1,listings)
    }}



