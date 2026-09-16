package dev.zyra.mobile

import dev.zyra.mobile.data.DraftHydration
import kotlinx.coroutines.*
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test

class DraftHydrationTest {
    @Test fun delayedReadCannotReplaceTypingOrRestoreDeletedText() = runTest {
        val read = CompletableDeferred<String>()
        var revision = 4L; var text = ""
        val ticket = DraftHydration(revision)
        val restore = async { val saved = read.await(); ticket.restore(revision, text, saved) }
        revision++; text = "typing now"
        revision++; text = ""
        read.complete("yesterday's draft")
        assertEquals("", restore.await())
    }
    @Test fun assigningCanonicalIdentityKeepsNewChatTyping() {
        val ticket = DraftHydration(0)
        assertEquals("new idea", ticket.attached(null, "canonical", 1, "new idea", ""))
        assertEquals("restored", ticket.restore(0, "", "restored"))
    }
    @Test fun aliasRestorationUsesCanonicalDraftOnlyUntilUserEdits() {
        val ticket = DraftHydration(2)
        assertEquals("canonical draft", ticket.attached("alias", "canonical", 2, "", "canonical draft"))
        assertEquals("edited", ticket.attached("alias", "canonical", 3, "edited", "canonical draft"))
    }
}
