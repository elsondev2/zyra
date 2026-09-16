package dev.zyra.mobile

import dev.zyra.mobile.ui.*
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class WorkspaceReviewIntegrationTest {
    private fun roots() = JSONObject("""{"roots":[{"id":"work","label":"Project"}]}""")
    private fun empty() = JSONObject("""{"entries":[],"nextOffset":null}""")
    @Test fun changesDefaultsToTurnReviewAndGitRemainsExplicit() = runTest {
        val calls = mutableListOf<String>(); val controller = WorkspaceController(this)
        controller.enableReview(true)
        controller.open { method, _ -> calls += method; when (method) {
            "workspace.roots" -> roots(); "review.list" -> JSONObject("""{"turns":[],"nextCursor":null}""")
            "workspace.git.status" -> JSONObject("""{"files":[],"repository":false}"""); else -> empty()
        } }; runCurrent(); controller.changes(); runCurrent()
        assertTrue(controller.state.value.turnReviewOpen); assertTrue("review.list" in calls); assertFalse("workspace.git.status" in calls)
        controller.git(); runCurrent(); assertFalse(controller.state.value.turnReviewOpen); assertTrue("workspace.git.status" in calls)
        controller.files(); assertFalse(controller.state.value.git)
    }
    @Test fun fileLinkUsesCurrentFolderAndWaitsForDiscardDecision() = runTest {
        var link: JSONObject? = null; val controller = WorkspaceController(this)
        controller.open { method, params -> when (method) {
            "workspace.roots" -> roots()
            "workspace.file.read" -> JSONObject("""{"text":"original","hash":"hash","size":8}""")
            "workspace.link" -> { link = JSONObject(params.toString()); JSONObject("""{"rootId":"work","path":"docs/next.md","line":0}""") }
            else -> empty()
        } }; runCurrent(); controller.file(WorkspaceEntry("README.md", "docs/README.md", false, true)); runCurrent()
        controller.edit("draft"); controller.followLink("next.md"); runCurrent()
        assertNull(link); assertTrue(controller.state.value.discard)
        controller.discard(false); assertEquals("draft", controller.state.value.file?.text)
        controller.followLink("next.md"); controller.discard(true); runCurrent()
        assertEquals("docs", link!!.getString("basePath")); assertEquals("work", link!!.getString("rootId"))
        assertEquals("docs/next.md", controller.state.value.file?.path)
    }
    @Test fun normalMarkdownOpensRenderedAndChangingPresentationPreservesDraft() = runTest {
        val controller = WorkspaceController(this)
        controller.open { method, _ -> when (method) { "workspace.roots" -> roots(); "workspace.file.read" -> JSONObject("""{"text":"# Title","hash":"hash","size":7}"""); else -> empty() } }; runCurrent()
        controller.file(WorkspaceEntry("README.md", "README.md", false, true)); runCurrent()
        assertFalse(controller.state.value.fileSource)
        controller.edit("# Updated"); controller.fileSource(true); controller.fileWrap(false); controller.fileSource(false)
        assertEquals("# Updated", controller.state.value.file?.text); assertFalse(controller.state.value.fileWrap)
    }
    @Test fun returningToFilesCancelsLateTurnReview() = runTest {
        val held = CompletableDeferred<Unit>(); val controller = WorkspaceController(this)
        controller.enableReview(true)
        controller.open { method, _ -> when (method) { "workspace.roots" -> roots(); "review.list" -> { withContext(NonCancellable) { held.await() }; JSONObject("""{"turns":[{"id":"late","number":1,"changes":[]}]}""") }; else -> empty() } }; runCurrent()
        controller.changes(); runCurrent(); controller.files(); held.complete(Unit); runCurrent()
        assertTrue(controller.turnReview.state.value.turns.isEmpty()); assertFalse(controller.state.value.turnReviewOpen)
    }
    @Test fun repositorySwitchStaysInGitAndRejectsUnknownRoot() = runTest {
        val requests = mutableListOf<String>(); val controller = WorkspaceController(this)
        controller.open { method, params -> when (method) {
            "workspace.roots" -> JSONObject("""{"roots":[{"id":"one","label":"First"},{"id":"two","label":"Second"}]}""")
            "workspace.git.status" -> { requests += params.getString("rootId"); JSONObject("""{"files":[],"repository":true}""") }
            else -> empty()
        } }; runCurrent()
        controller.git(); runCurrent(); controller.gitRoot("two"); runCurrent()
        assertTrue(controller.state.value.git); assertEquals("two", controller.state.value.root)
        assertEquals(listOf("one", "two"), requests)
        controller.gitRoot("unknown"); runCurrent(); assertEquals("two", controller.state.value.root)
    }
}
