package dev.zyra.mobile.ui

import kotlinx.coroutines.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first

enum class PluginRefreshTarget { NONE, WAITING, LIST, DETAILS, STORE }
fun pluginRefreshTarget(page: String, visible: Boolean, listIdle: Boolean, detailsIdle: Boolean, storeIdle: Boolean): PluginRefreshTarget {
    if(page !in setOf("plugins","plugin-detail","plugin-store")) return PluginRefreshTarget.NONE
    if(!visible) return PluginRefreshTarget.WAITING
    return when(page) {
        "plugins" -> if(listIdle) PluginRefreshTarget.LIST else PluginRefreshTarget.WAITING
        "plugin-detail" -> if(detailsIdle) PluginRefreshTarget.DETAILS else PluginRefreshTarget.WAITING
        else -> if(storeIdle) PluginRefreshTarget.STORE else PluginRefreshTarget.WAITING
    }
}

/** One pending invalidation. Flow suspension avoids polling while backgrounded,
 * loading or reviewing. A notification never replaces an open review. */
class PluginInvalidations(private val scope: CoroutineScope, private val targets: Flow<PluginRefreshTarget>, private val refresh: (PluginRefreshTarget) -> Unit) {
    private var pending: Job? = null
    fun changed(isCurrent: () -> Boolean = {true}) {
        pending?.cancel()
        pending=scope.launch {
            val target=targets.first {it!=PluginRefreshTarget.WAITING}
            if(isCurrent() && target!=PluginRefreshTarget.NONE) refresh(target)
        }
    }
    fun clear() {pending?.cancel();pending=null}
}
