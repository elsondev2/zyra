package dev.zyra.mobile.data

import java.io.File

data class PendingAttachmentContent(val images: List<Pair<LocalAttachment, File>> = emptyList(), val files: List<MessageTextAttachment> = emptyList())

/** Read only this operation's owned attachments; callers run this on the IO dispatcher. */
object PendingAttachments {
    fun load(store: AttachmentStore, send: PendingSend, machine: String, session: String): PendingAttachmentContent {
        val owned = store.allForSend(send.id).filter { it.id in send.images && it.machine == machine && it.session == session }.take(12)
        val images = mutableListOf<Pair<LocalAttachment, File>>()
        val files = mutableListOf<MessageTextAttachment>()
        var remainingText = 1024 * 1024
        for (attachment in owned) {
            val file = store.file(attachment.id)
            if (!file.isFile || file.length() != attachment.size) continue
            if (attachment.mimeType.startsWith("image/")) images += attachment to file
            else if (attachment.size in 0..minOf(TextAttachmentPolicy.MAX_BYTES, remainingText).toLong()) {
                runCatching {
                    // The source is private and immutable after submission; still bound every read.
                    val bytes = file.inputStream().use { input ->
                        val output = java.io.ByteArrayOutputStream()
                        val buffer = ByteArray(8192)
                        while (output.size() <= TextAttachmentPolicy.MAX_BYTES) {
                            val count = input.read(buffer, 0, minOf(buffer.size, TextAttachmentPolicy.MAX_BYTES + 1 - output.size()))
                            if (count < 0) break
                            output.write(buffer, 0, count)
                        }
                        output.toByteArray()
                    }
                    val text = TextAttachmentPolicy.validate(attachment.name, bytes)
                    files += MessageTextAttachment(attachment.name, text, bytes.size.toLong())
                    remainingText -= bytes.size
                }
            }
        }
        return PendingAttachmentContent(images, files)
    }
}
