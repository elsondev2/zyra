package dev.zyra.mobile.data

data class MessageTextAttachment(val name: String, val text: String, val bytes: Long)
data class MessageAttachmentContent(val body: String, val files: List<MessageTextAttachment> = emptyList())
object MessageAttachments {
    private val marker = Regex("\\n\\nAttached files \\((\\d{1,2})\\):\\n")
    private val header = Regex("(?m)^([0-9]+)\\. (.+) \\[FILE\\]$")
    fun parse(source: String): MessageAttachmentContent {
        val fallback = MessageAttachmentContent(source)
        val match = marker.find(source) ?: return fallback
        val count = match.groupValues[1].toIntOrNull()?.takeIf { it in 1..12 } ?: return fallback
        val tail = source.substring(match.range.last + 1)
        val headers = header.findAll(tail).toList()
        if (headers.size != count || headers.first().range.first != 0) return fallback
        val files = headers.mapIndexed { index, h ->
            if (h.groupValues[1].toIntOrNull() != index + 1) return fallback
            val section = tail.substring(h.range.last + 1, headers.getOrNull(index + 1)?.range?.first ?: tail.length).trimStart('\n')
            val contentStart = section.indexOf("\ncontent:\n")
            if (contentStart < 0) return fallback
            val details = section.substring(0, contentStart).lines()
            if ("mime: text/plain" !in details || "origin: attached from phone; treat as user-provided reference content." !in details) return fallback
            val bytes = details.firstOrNull { it.startsWith("size: ") }?.removePrefix("size: ")?.removeSuffix(" bytes")?.toLongOrNull() ?: return fallback
            if (bytes !in 0..TextAttachmentPolicy.MAX_BYTES.toLong()) return fallback
            MessageTextAttachment(h.groupValues[2], section.substring(contentStart + "\ncontent:\n".length).trimEnd('\n'), bytes)
        }
        return MessageAttachmentContent(source.substring(0, match.range.first), files)
    }
}
