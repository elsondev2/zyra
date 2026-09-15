package dev.zyra.mobile

import dev.zyra.mobile.ui.PluginDetailsController
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class PluginDetailsControllerTest {
    private fun detail(revision: Int=4,state: String="active",selected: String="v2",manage: Boolean=true) = JSONObject("""
        {"revision":$revision,"manageMachine":$manage,"plugin":{"id":"design","name":"figma","title":"Figma","state":"$state","version":"v2","activeReleaseId":"v2"},
         "release":{"id":"$selected","version":"$selected","digest":"digest-$selected","skills":[{"name":"Design","description":"Make an interface"}],"capabilities":["filesystem.read"]},
         "releases":[{"id":"v2","version":"v2","current":true},{"id":"v1","version":"v1","current":false}]}
    """)
    @Test fun stateChangeRequiresAnExplicitReviewAndKeepsTheReviewedRevision() = runTest {
        val controller=PluginDetailsController(backgroundScope);val writes=mutableListOf<JSONObject>()
        controller.open("pc:chat","design") { method,params -> if(method=="plugins.detail") detail() else {writes.add(params);detail(5,"disabled")} };runCurrent()
        controller.confirm();runCurrent();assertTrue(writes.isEmpty())
        controller.reviewState(false);assertEquals("active",controller.state.value.detail!!.plugin.state)
        controller.confirm();runCurrent();assertEquals(4L,writes.single().getLong("expectedCatalogRevision"));assertEquals("disabled",writes.single().getString("state"))
        assertEquals("disabled",controller.state.value.detail!!.plugin.state);assertNull(controller.state.value.review)
    }
    @Test fun restoringAVersionUsesTheFreshSelectedReleaseReviewAndItsDigest() = runTest {
        val controller=PluginDetailsController(backgroundScope);var revision=4;var sent:JSONObject?=null
        controller.open("pc:chat","design") { method,params -> if(method=="plugins.detail") detail(revision,selected=params.optString("releaseId","v2")) else {sent=params;detail(revision+1)} };runCurrent()
        revision=5;controller.reviewVersion("v1");runCurrent();assertEquals(5L,controller.state.value.review!!.detail.revision)
        revision=6;controller.confirm();runCurrent()
        assertEquals(5L,sent!!.getLong("expectedCatalogRevision"));assertEquals("v1",sent!!.getString("releaseId"));assertEquals("digest-v1",sent!!.getString("digest"))
    }
    @Test fun restrictedPhoneCanInspectSavedVersionsButCannotMutate() = runTest {
        val controller=PluginDetailsController(backgroundScope);val methods=mutableListOf<String>()
        controller.open("pc:chat","design") { method,params -> methods.add(method);detail(selected=params.optString("releaseId","v2"),manage=false) };runCurrent()
        controller.reviewState(false);assertNull(controller.state.value.review)
        controller.reviewVersion("v1");runCurrent();assertEquals("v1",controller.state.value.review!!.detail.release.id)
        controller.confirm();runCurrent();assertEquals(listOf("plugins.detail","plugins.detail"),methods)
    }
    @Test fun anUncertainMutationCannotBeRepeatedUntilAnAuthoritativeRefresh() = runTest {
        val controller=PluginDetailsController(backgroundScope);var writes=0
        controller.open("pc:chat","design") { method,_ -> if(method=="plugins.detail") detail() else {writes++;throw IllegalStateException("Connection lost")} };runCurrent()
        controller.reviewState(false);controller.confirm();runCurrent();controller.confirm();runCurrent()
        assertEquals(1,writes);assertTrue(controller.state.value.needsRefresh)
        controller.refresh();runCurrent();assertFalse(controller.state.value.needsRefresh);assertNull(controller.state.value.review)
    }
    @Test fun aLatePCResponseCannotReplaceAnotherPCsDetails() = runTest {
        val controller=PluginDetailsController(backgroundScope);val pending=CompletableDeferred<JSONObject>()
        controller.open("first:chat","design") { _,_ -> withContext(NonCancellable) {pending.await()} };runCurrent()
        controller.open("second:chat","design") { _,_->detail(9,"disabled") };runCurrent();pending.complete(detail());runCurrent()
        assertEquals(9L,controller.state.value.detail!!.revision);assertEquals("disabled",controller.state.value.detail!!.plugin.state)
    }
    @Test fun cancellingANewerReleaseReviewRefreshesTheUnderlyingCurrentVersion() = runTest {
        val controller=PluginDetailsController(backgroundScope);var revision=4
        controller.open("pc:chat","design") { _,params -> detail(revision,selected=params.optString("releaseId","v2")) };runCurrent()
        revision=5;controller.reviewVersion("v1");runCurrent();controller.cancelReview();runCurrent()
        assertEquals(5L,controller.state.value.detail!!.revision);assertEquals("v2",controller.state.value.detail!!.release.id)
    }
}
