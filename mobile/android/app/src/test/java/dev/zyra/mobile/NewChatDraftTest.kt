package dev.zyra.mobile

import dev.zyra.mobile.data.NewChatDraft
import org.junit.Assert.*
import org.junit.Test

class NewChatDraftTest {
    @Test fun machineSelectionUsesOnlyAvailableComputers() {
        assertEquals("pc-b", NewChatDraft.machine(listOf("pc-a", "pc-b"), "pc-b", "pc-a"))
        assertEquals("pc-a", NewChatDraft.machine(listOf("pc-a"), "removed", "pc-a"))
        assertNull(NewChatDraft.machine(emptyList(), "removed", "removed"))
    }
    @Test fun projectScopeNeverCarriesAnUnavailablePathToAnotherMachine() {
        assertEquals("D:/work", NewChatDraft.project(listOf("D:/work"), "C:/old-project"))
        assertNull(NewChatDraft.project(emptyList(), "C:/old-project"))
    }
    @Test fun defaultUsesPersonalContextOnlyWhenAdvertisedBySelectedMachine() {
        assertEquals("C:/data/assistant/global-workspace", NewChatDraft.project(listOf("C:/work", "C:/data/assistant/global-workspace"), null))
        assertEquals("C:/work", NewChatDraft.project(listOf("C:/work"), null))
        assertEquals("C:/work", NewChatDraft.project(listOf("C:/work", "C:/data/assistant/global-workspace"), "C:/work"))
    }
    @Test fun successfulAttachmentCanContinueTheUneditedDraft() {
        assertTrue(NewChatDraft.canContinue(4, 4, "pc", "pc", "chat", "canonical", null, "Hello", "Hello"))
    }
    @Test fun dismissedChangedOrFailedAttachmentCannotSendOrOpenTools() {
        assertFalse(NewChatDraft.canContinue(4, 5, "pc", "pc", "chat", "canonical", null, "Hello", "Hello"))
        assertFalse(NewChatDraft.canContinue(4, 4, "pc", "other", "chat", "canonical", null, "Hello", "Hello"))
        assertFalse(NewChatDraft.canContinue(4, 4, "pc", "pc", "chats", "canonical", null, "Hello", "Hello"))
        assertFalse(NewChatDraft.canContinue(4, 4, "pc", "pc", "chat", "", null, "Hello", "Hello"))
        assertFalse(NewChatDraft.canContinue(4, 4, "pc", "pc", "chat", "canonical", "Offline", "Hello", "Hello"))
        assertFalse(NewChatDraft.canContinue(4, 4, "pc", "pc", "chat", "canonical", null, "Hello", "Changed while loading"))
    }
}
