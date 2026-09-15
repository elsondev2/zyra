package dev.zyra.mobile

import dev.zyra.mobile.ui.*
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class PluginInvalidationsTest {
    @Test fun backgroundAndOpenReviewsWaitWithoutFetching() {
        assertEquals(PluginRefreshTarget.WAITING,pluginRefreshTarget("plugins",false,true,true,true))
        assertEquals(PluginRefreshTarget.WAITING,pluginRefreshTarget("plugin-detail",true,true,false,true))
        assertEquals(PluginRefreshTarget.WAITING,pluginRefreshTarget("plugin-store",true,true,true,false))
        assertEquals(PluginRefreshTarget.NONE,pluginRefreshTarget("chat",true,true,true,true))
        assertEquals(PluginRefreshTarget.LIST,pluginRefreshTarget("plugins",true,true,true,true))
    }
    @Test fun queuedChangesCoalesceUntilTheVisibleViewCanRefresh()=runTest {
        val target=MutableStateFlow(PluginRefreshTarget.WAITING);val seen=mutableListOf<PluginRefreshTarget>()
        val controller=PluginInvalidations(this,target,seen::add)
        repeat(5) { controller.changed();runCurrent() };assertTrue(seen.isEmpty())
        target.value=PluginRefreshTarget.DETAILS;runCurrent();assertEquals(listOf(PluginRefreshTarget.DETAILS),seen)
        target.value=PluginRefreshTarget.LIST;runCurrent();assertEquals(1,seen.size)
    }
    @Test fun leavingTheFeatureDoesNotFetchAnInvisibleCatalog()=runTest {
        val target=MutableStateFlow(PluginRefreshTarget.WAITING);val seen=mutableListOf<PluginRefreshTarget>()
        val controller=PluginInvalidations(this,target,seen::add);controller.changed();runCurrent()
        target.value=PluginRefreshTarget.NONE;runCurrent();target.value=PluginRefreshTarget.LIST;runCurrent();assertTrue(seen.isEmpty())
    }
    @Test fun oldConnectionCannotRefreshTheReplacementPc()=runTest {
        val target=MutableStateFlow(PluginRefreshTarget.WAITING);val seen=mutableListOf<PluginRefreshTarget>();var current=true
        val controller=PluginInvalidations(this,target,seen::add);controller.changed {current};runCurrent()
        current=false;target.value=PluginRefreshTarget.STORE;runCurrent();assertTrue(seen.isEmpty())
    }
    @Test fun clearCancelsPendingReviewRefresh()=runTest {
        val target=MutableStateFlow(PluginRefreshTarget.WAITING);val seen=mutableListOf<PluginRefreshTarget>()
        val controller=PluginInvalidations(this,target,seen::add);controller.changed();runCurrent();controller.clear()
        target.value=PluginRefreshTarget.LIST;runCurrent();assertTrue(seen.isEmpty())
    }
}
