package dev.zyra.mobile

import dev.zyra.mobile.data.*
import org.junit.Assert.*
import org.junit.Test

class PageDestinationTest {
    @Test fun pairedStartupGoesToChatsWithoutWaitingForCatalogOrNetwork() {
        assertEquals("chats", startupPage(true))
        assertEquals("machines", startupPage(false))
    }
    @Test fun equalDepthPagesStillFollowExplicitForwardAndBackIntent() {
        for (route in listOf("chat", "machines", "plugins", "plugin-store", "plugin-detail", "workspace", "chat:detail")) {
            assertTrue(PageDestination(route).enterOffset(360) > 0)
            assertTrue(PageDestination(route, back = true).enterOffset(360) < 0)
            assertTrue(PageDestination(route).exitOffset(360) < 0)
            assertTrue(PageDestination(route, back = true).exitOffset(360) > 0)
        }
    }
}
