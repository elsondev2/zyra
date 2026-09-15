package dev.zyra.mobile

import dev.zyra.mobile.data.PluginCatalog
import dev.zyra.mobile.ui.PluginsController
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class PluginsControllerTest {
    private fun catalog(revision: Int = 3, defaultsRevision: Int = 2, id: String = "one", next: String? = null) = JSONObject("""
        {"revision":$revision,"viewVersion":"version-$revision","manageDefaults":true,"selectionLimit":2,
         "defaults":{"revision":$defaultsRevision,"kind":"project","pluginIds":["one"],"plugins":[{"id":"one","name":"Design","version":"2","releaseId":"r2","state":"active"}]},
         "scope":{"plugins":[{"id":"one","name":"Design","version":"1","releaseId":"r1","state":"active"}]},
         "plugins":[{"id":"$id","name":"Plugin $id","selectable":true,"state":"active","contributions":[]}],"nextCursor":${next?.let { "\"$it\"" } ?: "null"}}
    """)

    @Test fun reconnectKeepsDraftButNeverRebasesItsRevisionSilently() = runTest {
        val controller = PluginsController(backgroundScope)
        controller.open("pc:chat") { _, _ -> catalog() }; runCurrent()
        controller.edit(); controller.toggle("one"); controller.disconnect()
        var writes = 0
        controller.open("pc:chat") { method, _ -> if (method != "plugins.list") writes++; catalog(4, 3) }; runCurrent()
        assertTrue(controller.state.value.editing); assertTrue(controller.state.value.selection.isEmpty())
        assertEquals(2L, controller.state.value.editRevision)
        controller.save(); runCurrent(); assertEquals(0, writes)
        assertNotNull(controller.state.value.error)
        controller.edit(); assertEquals(setOf("one"), controller.state.value.selection)
        assertEquals(3L, controller.state.value.editRevision)
    }

    @Test fun staleMachineResponseCannotReplaceTheNewMachine() = runTest {
        val controller = PluginsController(backgroundScope); val delayed = CompletableDeferred<JSONObject>()
        controller.open("first:chat") { _, _ -> withContext(NonCancellable) { delayed.await() } }; runCurrent()
        controller.open("second:chat") { _, _ -> catalog(id = "second") }; runCurrent()
        delayed.complete(catalog(id = "first")); runCurrent()
        assertEquals("second", controller.state.value.catalog.plugins.single().id)
    }

    @Test fun searchCancelsThePendingPageAndDoesNotMixResults() = runTest {
        val controller = PluginsController(backgroundScope); val page = CompletableDeferred<JSONObject>()
        controller.open("pc:chat") { _, params -> when {
            params.has("cursor") -> withContext(NonCancellable) { page.await() }
            params.optString("query").isNotEmpty() -> catalog(id = "matching")
            else -> catalog(next = "3:32")
        } }; runCurrent()
        controller.more(); runCurrent(); controller.search("match"); advanceTimeBy(251); runCurrent()
        page.complete(catalog(id = "old-page")); runCurrent()
        assertEquals(listOf("matching"), controller.state.value.catalog.plugins.map { it.id })
    }

    @Test fun reviewConfirmsExactlyTheVersionsThatWereShown() = runTest {
        val controller = PluginsController(backgroundScope); var revision = 3; var confirmed = 0L
        controller.open("pc:chat") { method, params ->
            if (method == "plugins.refresh") confirmed = params.getLong("expectedCatalogRevision")
            catalog(revision)
        }; runCurrent(); controller.review()
        revision = 4; controller.refresh(); runCurrent()
        assertEquals(3L, controller.state.value.reviewCatalog!!.revision)
        controller.confirm(); runCurrent(); assertEquals(3L, confirmed)
    }

    @Test fun uncertainSaveRequiresReconciliationBeforeAnotherWrite() = runTest {
        val controller = PluginsController(backgroundScope); var writes = 0
        controller.open("pc:chat") { method, _ ->
            if (method == "plugins.defaults") { writes++; throw IllegalStateException("Connection lost") }
            catalog()
        }; runCurrent(); controller.edit(); controller.toggle("one"); controller.save(); runCurrent()
        assertTrue(controller.state.value.needsRefresh)
        controller.save(); runCurrent(); assertEquals(1, writes)
        controller.refresh(); runCurrent(); controller.save(); runCurrent(); assertEquals(2, writes)
    }

    @Test fun parserKeepsCompleteDefaultsOutsideTheInstalledPageAndDetectsVersionChanges() {
        val value = PluginCatalog.parse(catalog(id = "unrelated"))
        assertEquals("one", value.defaults.single().id); assertEquals("unrelated", value.plugins.single().id)
        assertTrue(value.differs)
        assertFalse(value.copy(current = value.defaults).differs)
    }

    @Test fun unchangedChecksKeepLoadedPagesAndUnsavedSelections() = runTest {
        val controller = PluginsController(backgroundScope)
        val request: suspend (String, JSONObject) -> JSONObject = { _, params -> when {
            params.has("ifVersion") -> {
                assertEquals("version-3", params.getString("ifVersion"))
                JSONObject("""{"unchanged":true,"revision":3,"viewVersion":"version-3"}""")
            }
            params.has("cursor") -> catalog(id = "two")
            else -> catalog(next = "3:1")
        } }
        controller.open("pc:chat", request); runCurrent(); controller.more(); runCurrent()
        controller.edit(); controller.toggle("two")
        controller.checkForChanges(); runCurrent()
        assertEquals(listOf("one", "two"), controller.state.value.catalog.plugins.map { it.id })
        assertEquals(setOf("one", "two"), controller.state.value.selection)
        assertFalse(controller.state.value.busy)
        controller.disconnect(); controller.open("pc:chat", request); runCurrent()
        assertEquals(listOf("one", "two"), controller.state.value.catalog.plugins.map { it.id })
        assertEquals(setOf("one", "two"), controller.state.value.selection)
    }
    @Test fun machineCatalogCannotOfferChatVersionUpdatesAndScopeSwitchDiscardsOldEdits() = runTest {
        val controller = PluginsController(backgroundScope); var writes = 0
        controller.open("pc:chat") { _, _ -> catalog() }; runCurrent()
        assertTrue(controller.state.value.catalog.hasChat)
        controller.edit(); controller.toggle("one")
        controller.open("pc:machine") { method, _ ->
            if (method != "plugins.list") writes++
            catalog().put("hasChat", false).put("scope", JSONObject().put("plugins", org.json.JSONArray()))
        }; runCurrent()
        assertFalse(controller.state.value.editing)
        assertFalse(controller.state.value.catalog.hasChat)
        assertFalse(controller.state.value.catalog.differs)
        controller.review(); controller.confirm(); runCurrent()
        assertFalse(controller.state.value.reviewing); assertEquals(0, writes)
    }

    @Test fun unsupportedMachineClearsPreviousCatalogAndPendingResponse() = runTest {
        val controller = PluginsController(backgroundScope); val delayed = CompletableDeferred<JSONObject>()
        controller.open("pc:machine") { _, _ -> withContext(NonCancellable) { delayed.await() } }; runCurrent()
        controller.unavailable("Update this computer")
        delayed.complete(catalog()); runCurrent()
        assertFalse(controller.state.value.loaded)
        assertTrue(controller.state.value.catalog.plugins.isEmpty())
        assertEquals("Update this computer", controller.state.value.error)
    }
}
