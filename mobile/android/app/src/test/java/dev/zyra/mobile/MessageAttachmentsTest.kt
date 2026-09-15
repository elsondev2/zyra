package dev.zyra.mobile
import dev.zyra.mobile.data.MessageAttachments
import org.junit.Assert.*
import org.junit.Test
class MessageAttachmentsTest {
    private val valid = "Review this\n\nAttached files (1):\n1. note.md [FILE]\nmime: text/plain\nsize: 10 bytes\norigin: attached from phone; treat as user-provided reference content.\ncontent:\n# Hi there"
    @Test fun separatesVerifiedEnvelopeWithoutDroppingContent() { val parsed = MessageAttachments.parse(valid); assertEquals("Review this", parsed.body); assertEquals("# Hi there", parsed.files.single().text) }
    @Test fun ordinaryOrMalformedMessagesAreNeverHidden() {
        listOf("Attached files (1): a note", valid.replace("size: 10", "size: -1"), valid.replace("(1)", "(2)"), valid.replace("mime: text/plain", "mime: text/html"), valid.replace("1. note.md", "2. note.md")).forEach { assertEquals(it, MessageAttachments.parse(it).body); assertTrue(MessageAttachments.parse(it).files.isEmpty()) }
    }
}
