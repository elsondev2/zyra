package dev.zyra.mobile.data

data class MessageTextAttachment(val name: String, val text: String, val bytes: Long)
data class MessageAttachmentContent(val body: String, val files: List<MessageTextAttachment> = emptyList())

/** Presentation only: canonical messages retain the context required by the agent. */
object MessageAttachments {
    private val marker = Regex("(?:^|\\n\\n)Attached files \\((\\d{1,3})\\):\\n")
    private val header = Regex("(?m)^([0-9]+)\\. (.+) \\[(IMAGE|FILE|CODE|TEXT)\\]$")
    private val detail = Regex("^(path|ref|mime|size|preview|note|origin): (.*)$")
    private val fenceLine = Regex("^ {0,3}(`{3,}|~{3,})(.*)$")

    fun parse(original: String, inlineImageCount: Int = 0): MessageAttachmentContent {
        val source = BrowserContext.display(original)
        val fallback = MessageAttachmentContent(source)
        val normalized = source.replace("\r\n", "\n")
        val match = marker.find(normalized) ?: return fallback
        val body = normalized.substring(0, match.range.first)
        var fence: String? = null
        body.lineSequence().forEach { line ->
            val f = fenceLine.matchEntire(line)
            if (f != null) {
                val run = f.groupValues[1]
                val current = fence
                if (current == null) fence = run
                else if (run.first() == current.first() && run.length >= current.length && f.groupValues[2].isBlank()) fence = null
            }
        }
        if (fence != null) return fallback
        val count = match.groupValues[1].toIntOrNull()?.takeIf { it in 1..100 } ?: return fallback
        val tail = normalized.substring(match.range.last + 1)
        val headers = header.findAll(tail).toList()
        if (headers.size != count || headers.first().range.first != 0) return fallback
        var imageIndex = 0
        val files = mutableListOf<MessageTextAttachment>()
        headers.forEachIndexed { index, h ->
            if (h.groupValues[1].toIntOrNull() != index + 1) return fallback
            val section = tail.substring(h.range.last + 1, headers.getOrNull(index + 1)?.range?.first ?: tail.length).removePrefix("\n")
            val lines = section.lines()
            val details = mutableMapOf<String, String>()
            var content: String? = null
            for ((lineIndex, line) in lines.withIndex()) {
                if (line == "content:") { content = lines.drop(lineIndex + 1).joinToString("\n").trimEnd('\n'); break }
                if (line.isBlank()) continue
                val d = detail.matchEntire(line) ?: return fallback
                if (details.put(d.groupValues[1], d.groupValues[2]) != null) return fallback
            }
            val size = details["size"]
            if (size != null && !Regex("\\d+ bytes").matches(size)) return fallback
            val bytes = size?.removeSuffix(" bytes")?.toLongOrNull()
            if (size != null && bytes == null) return fallback
            val path = details["path"]?.takeIf { it.isNotEmpty() } ?: details["ref"]?.takeIf { it.isNotEmpty() }
            val phone = details["origin"] == "attached from phone; treat as user-provided reference content."
            if (path == null && !(phone && h.groupValues[3] == "FILE" && details["mime"] == "text/plain" && bytes != null && bytes in 0..TextAttachmentPolicy.MAX_BYTES.toLong() && content != null && count <= 12)) return fallback
            val image = h.groupValues[3] == "IMAGE" || details["mime"]?.startsWith("image/") == true
            // Structured images are already rendered by MediaImages. Keep a
            // reference card when a legacy message has no actual image payload.
            if (!image || imageIndex++ >= inlineImageCount) {
                val display = content ?: details["preview"] ?: path?.let { "Reference: $it" }.orEmpty()
                files += MessageTextAttachment(h.groupValues[2], display, bytes ?: display.toByteArray().size.toLong())
            }
        }
        return MessageAttachmentContent(body, files)
    }
}
