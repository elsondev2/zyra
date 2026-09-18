package dev.zyra.mobile.data

/** The same explicit, line-delimited visualization contract as Desktop. */
data class VisualizationPart(val start: Int, val text: String = "", val html: String? = null,
    val title: String = "Visualization", val height: Int = 320, val state: String = "text")
object VisualizationBlocks {
    private val opener = Regex("^<visualization(?:\\s+(?:[^\"'>]|\"[^\"]*\"|'[^']*')*)?>\\s*$")
    private val fenceMarker = Regex("^ {0,3}(`{3,}|~{3,})")
    private val close = Regex("^ {0,3}</visualization>[\\t ]*\\r?$", RegexOption.MULTILINE)
    fun parse(source: String): List<VisualizationPart> {
        val parts = mutableListOf<VisualizationPart>()
        var offset = 0; var textStart = 0; var fence = ""
        while (offset < source.length) {
            val newline = source.indexOf('\n', offset)
            val end = if (newline < 0) source.length else newline + 1
            val line = source.substring(offset, if (newline < 0) end else newline).removeSuffix("\r")
            val marker = fenceMarker.find(line)
            if (marker != null) {
                val value = marker.groupValues[1]
                if (fence.isEmpty()) fence = value
                else if (value.first() == fence.first() && value.length >= fence.length && line.drop(marker.value.length).isBlank()) fence = ""
            }
            if (fence.isEmpty() && marker == null) {
                val tag = line.replaceFirst(Regex("^ {0,3}"), "")
                val opened = opener.matches(tag)
                val partial = !opened && (Regex("^<visualization(?:\\s|>|$)").containsMatchIn(tag) || newline < 0 && tag.startsWith("<") && "<visualization".startsWith(tag))
                if (opened || partial) {
                    if (offset > textStart) parts.add(VisualizationPart(textStart, text = source.substring(textStart, offset)))
                    val closing = if (opened) close.find(source, end) else null
                    val tooLarge = (closing?.range?.first ?: source.length) - end > 64 * 1024
                    fun attribute(name: String, fallback: String) = Regex("\\b$name\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)')", RegexOption.IGNORE_CASE).find(tag)?.let { it.groupValues[1].ifEmpty { it.groupValues[2] } } ?: fallback
                    parts.add(VisualizationPart(offset, html = if (closing != null && !tooLarge) source.substring(end, closing.range.first) else "",
                        title = org.jsoup.parser.Parser.unescapeEntities(attribute("title", "Visualization"), false).take(160),
                        height = (attribute("height", "320").toDoubleOrNull()?.takeIf { it.isFinite() }?.toInt() ?: 320).coerceIn(160, 640),
                        state = if (tooLarge) "too-large" else if (closing != null) "complete" else "incomplete"))
                    offset = closing?.range?.last?.plus(1) ?: source.length
                    textStart = offset
                    continue
                }
            }
            offset = end
        }
        if (textStart < source.length) parts.add(VisualizationPart(textStart, text = source.substring(textStart)))
        return parts
    }
}
