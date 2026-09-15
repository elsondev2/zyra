package dev.zyra.mobile.ui

import dev.zyra.mobile.data.PluginDetails
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import org.json.JSONObject

data class PluginChangeReview(val action: String, val detail: PluginDetails, val targetState: String = "")
data class PluginDetailsState(val pluginId: String = "", val detail: PluginDetails? = null, val busy: Boolean = false, val saving: Boolean = false,
    val review: PluginChangeReview? = null, val needsRefresh: Boolean = false, val error: String? = null, val notice: String? = null)
class PluginDetailsController(private val scope: CoroutineScope) {
    private val mutable = MutableStateFlow(PluginDetailsState())
    val state = mutable.asStateFlow()
    private var request: (suspend (String,JSONObject)->JSONObject)? = null
    private var owner = ""
    private var generation = 0
    private var job: Job? = null
    fun close() { disconnect();owner="";mutable.value=PluginDetailsState() }
    fun disconnect() {
        generation++;job?.cancel();request=null
        mutable.update { it.copy(busy=false,saving=false,review=null,needsRefresh=true,error=if(it.saving) "The connection changed. Refresh to check the result before making another change." else it.error) }
    }
    fun open(key: String, pluginId: String, call: suspend (String,JSONObject)->JSONObject) {
        if(owner!=key || mutable.value.pluginId!=pluginId) close() else disconnect()
        owner=key;request=call;mutable.update { it.copy(pluginId=pluginId) };refresh()
    }
    fun refresh() = load(null)
    fun reviewVersion(id: String) {
        val current=mutable.value;val detail=current.detail?:return
        if(current.busy || current.saving || current.needsRefresh || id==detail.plugin.activeReleaseId || detail.releases.none { it.id==id }) return
        load(id)
    }
    private fun load(version: String?) {
        val call=request?:return
        if(mutable.value.saving) return
        job?.cancel();val epoch=++generation;val pluginId=mutable.value.pluginId
        mutable.update { it.copy(busy=true,error=null) }
        job=scope.launch {
            try {
                val params=JSONObject().put("pluginId",pluginId)
                version?.let { params.put("releaseId",it) }
                val detail=PluginDetails.parse(call("plugins.detail",params))
                if(epoch==generation) {
                    if(version!=null) {
                        check(detail.release.id!=detail.plugin.activeReleaseId) { "That version is already current. Refresh this Plugin." }
                        mutable.update { it.copy(busy=false,review=PluginChangeReview("rollback",detail),needsRefresh=false) }
                    } else mutable.update { it.copy(detail=detail,busy=false,review=null,needsRefresh=false) }
                }
            } catch(e: CancellationException) { throw e }
            catch(e: Exception) { if(epoch==generation) mutable.update { it.copy(busy=false,needsRefresh=true,error=e.message?:"Could not load this Plugin.") } }
        }
    }
    fun reviewState(enabled: Boolean) {
        val current=mutable.value;val detail=current.detail?:return
        if(request==null || current.busy || current.saving || current.needsRefresh || !detail.manageMachine) return
        val target=if(enabled) "active" else "disabled"
        if(detail.plugin.state==target) return
        mutable.update { it.copy(review=PluginChangeReview("state",detail,target),error=null) }
    }
    fun cancelReview() {
        val changed=mutable.value.review?.detail?.revision!=mutable.value.detail?.revision
        mutable.update { it.copy(review=null) }
        if(changed && !mutable.value.saving) refresh()
    }
    fun confirm() {
        val call=request?:return;val current=mutable.value;val review=current.review?:return
        if(current.busy || current.saving || current.needsRefresh || !review.detail.manageMachine) return
        job?.cancel();val epoch=++generation
        val params=JSONObject().put("pluginId",review.detail.plugin.id).put("confirmed",true).put("expectedCatalogRevision",review.detail.revision)
        if(review.action=="state") params.put("state",review.targetState)
        else params.put("releaseId",review.detail.release.id).put("digest",review.detail.release.digest)
        mutable.update { it.copy(saving=true,error=null,notice=null) }
        job=scope.launch {
            try {
                val detail=PluginDetails.parse(call("plugins.${review.action}",params))
                if(epoch==generation) mutable.update { it.copy(detail=detail,saving=false,review=null,notice=when { review.action=="rollback" -> "Saved version restored on the PC.";review.targetState=="active" -> "Plugin enabled on the PC.";else -> "Plugin disabled on the PC." }) }
            } catch(e: CancellationException) { throw e }
            catch(e: Exception) { if(epoch==generation) mutable.update { it.copy(saving=false,needsRefresh=true,error=(e.message?:"Could not confirm this change.")+" Refresh before trying again.") } }
        }
    }
}
