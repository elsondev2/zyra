package dev.zyra.mobile

import dev.zyra.mobile.data.*
import dev.zyra.mobile.network.CatalogMetadataHydration
import kotlinx.coroutines.test.runTest
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class CatalogMetadataHydrationTest {
    @Test fun metadataCompletesWithoutReplacingTheExistingCatalogPage() = runTest {
        val chat = Chat("a", "New title", "project", "running", null, false, machineId = "pc", modifiedAt = "2026-09-15T00:00:00Z")
        val page = ChatPage(listOf(chat, chat.copy(id = "older")), "next-page")
        var requests = 0
        var merged = page
        CatalogMetadataHydration.refresh(JSONObject().put("metadataPending", true), { true }, {
            requests++
            JSONObject().put("metadataPending", false)
        }, {
            merged = ChatCatalogMetadata.merge(page, listOf(chat.copy(title = "Old title", state = "detached", hasChanges = true, hasWork = true), chat.copy(id = "removed")))
        })
        assertEquals(1, requests)
        assertEquals("next-page", merged.nextCursor)
        assertEquals(listOf("a", "older"), merged.chats.map { it.id })
        assertEquals("New title", merged.chats.first().title)
        assertEquals("running", merged.chats.first().state)
        assertEquals(true, merged.chats.first().hasChanges)
        assertEquals(true, merged.chats.first().hasWork)
    }
    @Test fun unresolvedMetadataRetriesAtMostThreeTimes() = runTest {
        var requests = 0
        val pending = JSONObject().put("metadataPending", true).put("metadataRetryMs", 1)
        CatalogMetadataHydration.refresh(pending, { true }, { requests++; pending }, {})
        assertEquals(3, requests)
        assertEquals(750L, testScheduler.currentTime)
    }
    @Test fun staleMachineOrQueryDropsTheRetryAndItsLateResult() = runTest {
        var current = true
        var updates = 0
        CatalogMetadataHydration.refresh(JSONObject().put("metadataPending", true), { current }, {
            current = false; JSONObject().put("metadataPending", false)
        }, { updates++ })
        assertEquals(0, updates)
        CatalogMetadataHydration.refresh(JSONObject().put("metadataPending", true), { false }, { fail("Stale owner cannot request"); JSONObject() }, {})
    }
    @Test fun knownMetadataOrSourceFailureNeverStartsRetries() = runTest {
        CatalogMetadataHydration.refresh(JSONObject().put("metadataPending", false), { true }, { fail("No retry needed"); JSONObject() }, {})
    }
    @Test fun pendingPartialMetadataRetainsKnownFlagsOnlyWithinTheSameCanonicalRevision() {
        val chat = Chat("a", "Title", "project", "detached", null, false, machineId = "pc", modifiedAt = "revision2", hasChanges = true, hasWork = false)
        val page = ChatPage(listOf(chat))
        val unknown = chat.copy(hasChanges = null, hasWork = null)
        assertEquals(chat, ChatCatalogMetadata.merge(page, listOf(unknown), pending = true).chats.single())
        assertEquals(unknown, ChatCatalogMetadata.merge(page, listOf(unknown), pending = false).chats.single())
        assertEquals(chat, ChatCatalogMetadata.merge(page, listOf(unknown.copy(modifiedAt = "revision1", hasChanges = false)), pending = true).chats.single())
        val unversioned = chat.copy(modifiedAt = "")
        assertEquals(unversioned, ChatCatalogMetadata.merge(ChatPage(listOf(unversioned)), listOf(unversioned.copy(hasChanges = false))).chats.single())
    }
}
