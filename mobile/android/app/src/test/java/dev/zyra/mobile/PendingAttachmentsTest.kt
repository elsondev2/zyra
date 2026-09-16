package dev.zyra.mobile

import dev.zyra.mobile.data.*
import org.junit.Assert.*
import org.junit.Test
import java.nio.file.Files

class PendingAttachmentsTest {
    @Test fun pendingContentUsesOnlySelectedOperationAndMachineAndSession() {
        val directory = Files.createTempDirectory("zyra-pending-content").toFile()
        try {
            val store = AttachmentStore(directory)
            fun add(machine: String, session: String, name: String, mime: String, body: String) = store.add(machine, session, name, mime, body.byteInputStream())
            val image = add("pc", "chat", "photo.jpg", "image/jpeg", "synthetic image bytes")
            val text = add("pc", "chat", "notes.md", "text/plain", "# Attached notes\n\nOne paragraph.")
            val foreign = add("other-pc", "chat", "private.md", "text/plain", "must not appear")
            val otherChat = add("pc", "other-chat", "private.md", "text/plain", "must not appear")
            val omitted = add("pc", "chat", "omitted.md", "text/plain", "must not appear")
            val next = add("pc", "chat", "next.md", "text/plain", "new draft")
            store.submitted(listOf(image.id, text.id, foreign.id, otherChat.id, omitted.id), "operation")
            val send = PendingSend("operation", "Check this", "sending", listOf(image.id, text.id, foreign.id, otherChat.id, next.id))
            val content = PendingAttachments.load(store, send, "pc", "chat")
            assertEquals(listOf(image.id), content.images.map { it.first.id })
            assertEquals(store.file(image.id), content.images.single().second)
            assertEquals(listOf("notes.md"), content.files.map { it.name })
            assertEquals("# Attached notes\n\nOne paragraph.", content.files.single().text)
            assertTrue(PendingAttachments.load(store, send.copy(id = "different-operation"), "pc", "chat").images.isEmpty())
        } finally { directory.deleteRecursively() }
    }

    @Test fun completedAndUnsupportedFilesAreNotPresentedAsImages() {
        val directory = Files.createTempDirectory("zyra-pending-files").toFile()
        try {
            val store = AttachmentStore(directory)
            val file = store.add("pc", "chat", "document.pdf", "application/pdf", "binary placeholder".byteInputStream())
            store.submitted(listOf(file.id), "op")
            val send = PendingSend("op", "", "uncertain", listOf(file.id))
            val content = PendingAttachments.load(store, send, "pc", "chat")
            assertTrue(content.images.isEmpty())
            assertTrue(content.files.isEmpty())
            store.complete("op")
            assertEquals(PendingAttachmentContent(), PendingAttachments.load(store, send, "pc", "chat"))
        } finally { directory.deleteRecursively() }
    }
}
