package dev.zyra.mobile

import dev.zyra.mobile.ui.PluginStoreController
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class PluginStoreControllerTest {
    private fun store(name: String = "design") = JSONObject("""{"revision":"pinned","manageMachine":true,"categories":["Design"],"entries":[{"name":"$name","title":"Design","hasSkills":true,"installable":true}],"total":1}""")
    private fun progress() = JSONObject("""{"id":"download","status":"downloading","progress":{"phase":"downloading","completedBytes":10,"totalBytes":100}}""")
    private fun ready() = JSONObject("""{"id":"download","status":"ready","review":{"id":"review","expiresAt":"2099-01-01T00:00:00Z","digest":"exact-digest","title":"Design","version":"1","fileCount":2,"bytes":100,"skills":[{"name":"Design","description":"Help with interfaces"}],"capabilities":["filesystem.read"]}}""")
    @Test fun preparationDoesNotInstallUntilTheReviewedDigestIsConfirmed() = runTest {
        val controller = PluginStoreController(backgroundScope); val writes = mutableListOf<JSONObject>()
        controller.open("pc:chat") { method, params -> when(method) {
            "plugins.store" -> store().also { value -> if (writes.isNotEmpty()) value.getJSONArray("entries").getJSONObject(0).put("installedVersion", "1").put("installedState", "disabled") }
            "plugins.download.start" -> progress()
            "plugins.download.status" -> ready()
            else -> { writes.add(params); JSONObject().put("installed",true) }
        } }; runCurrent(); controller.select(controller.state.value.catalog.entries.single()); controller.prepare(); runCurrent()
        assertTrue(writes.isEmpty()); assertEquals("review",controller.state.value.download!!.review!!.id)
        controller.install(); runCurrent()
        assertEquals("exact-digest",writes.single().getString("digest"));assertTrue(writes.single().getBoolean("confirmed"));assertTrue(controller.state.value.installed)
        assertEquals("disabled",controller.state.value.selected!!.installedState)
    }
    @Test fun leavingDuringStartCancelsPreparationAndIgnoresItsLateResult() = runTest {
        val controller = PluginStoreController(backgroundScope); val start = CompletableDeferred<JSONObject>();var cancels=0
        controller.open("pc:chat") { method, _ -> when(method) {
            "plugins.store" -> store()
            "plugins.download.start" -> withContext(NonCancellable) { start.await() }
            else -> { cancels++; JSONObject() }
        } }; runCurrent();controller.select(controller.state.value.catalog.entries.single());controller.prepare();runCurrent()
        controller.close();runCurrent();start.complete(progress());runCurrent()
        assertEquals(1,cancels);assertNull(controller.state.value.download);assertNull(controller.state.value.selected)
    }
    @Test fun hiddenStoreStopsPollingAndResumesItsExistingDownload() = runTest {
        val controller=PluginStoreController(backgroundScope);var reads=0;var starts=0
        controller.open("pc:chat") { method, _ -> when(method) {
            "plugins.store" -> store()
            "plugins.download.start" -> { starts++;progress() }
            else -> { reads++;progress() }
        } };runCurrent();controller.select(controller.state.value.catalog.entries.single());controller.prepare();runCurrent()
        assertEquals(1,reads);controller.pause();advanceTimeBy(10000);runCurrent();assertEquals(1,reads)
        controller.resume();runCurrent();assertEquals(2,reads);assertEquals(1,starts)
    }
    @Test fun reconnectNeverResumesOrReinstallsAnOldOwnersReview() = runTest {
        val controller=PluginStoreController(backgroundScope)
        controller.open("first:chat") { method, _ -> when(method) { "plugins.store" -> store();"plugins.download.start" -> progress();else -> ready() } }
        runCurrent();controller.select(controller.state.value.catalog.entries.single());controller.prepare();runCurrent();controller.disconnect()
        var calls=0
        controller.open("first:chat") { method, _ -> assertEquals("plugins.store",method);calls++;store() };runCurrent()
        controller.install();controller.prepare();runCurrent();assertEquals(1,calls);assertNull(controller.state.value.download);assertTrue(controller.state.value.uncertain)
    }
    @Test fun expiredReviewCannotBeInstalledAndUncertainInstallCannotBeRetried() = runTest {
        var now=0L;val controller=PluginStoreController(backgroundScope) { now };var installs=0
        controller.open("pc:chat") { method, _ -> when(method) {
            "plugins.store" -> store();"plugins.download.start" -> progress();"plugins.download.status" -> ready()
            else -> { installs++;throw IllegalStateException("Connection lost") }
        } };runCurrent();controller.select(controller.state.value.catalog.entries.single());controller.prepare();runCurrent()
        now=Long.MAX_VALUE;controller.install();runCurrent();assertEquals(0,installs)
        now=0;controller.install();runCurrent();controller.install();runCurrent();assertEquals(1,installs);assertTrue(controller.state.value.uncertain)
    }
    @Test fun aLateSearchCannotReplaceANewerCategoryOrMachine() = runTest {
        val controller=PluginStoreController(backgroundScope);val delayed=CompletableDeferred<JSONObject>()
        controller.open("first:chat") { _,params -> if(params.optString("query").isBlank()) store() else withContext(NonCancellable) { delayed.await() } };runCurrent()
        controller.search("old");advanceTimeBy(251);runCurrent();controller.open("second:chat") { _,_->store("second") };runCurrent()
        delayed.complete(store("old"));runCurrent();assertEquals("second",controller.state.value.catalog.entries.single().name)
    }
}
