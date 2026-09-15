package dev.zyra.mobile.data

object MarkdownLinks {
    private val scheme = Regex("^[a-z][a-z0-9+.-]*:", RegexOption.IGNORE_CASE)
    private val drive = Regex("^[a-z]:[/\\\\]", RegexOption.IGNORE_CASE)
    private val website = Regex("^(?:www\\.)?[a-z0-9](?:[a-z0-9-]*\\.)+(?:com|org|net|io|dev|app|ai|co|edu|gov|me|so|software|tools|xyz|info|online|tech)(?::[0-9]{1,5})?(?:[/#?].*)?$", RegexOption.IGNORE_CASE)
    fun external(destination: String): String? {
        val value = destination.trim()
        if (value.length > 4096 || value.any { it.isWhitespace() || it.code < 32 }) return null
        return when {
            value.startsWith("https://", true) || value.startsWith("http://", true) -> value.takeIf {
                runCatching { java.net.URI(it).host?.isNotBlank() == true }.getOrDefault(false)
            }
            value.startsWith("mailto:", true) -> value.takeIf { it.substringAfter(':').contains('@') }
            website.matches(value) -> "https://$value"
            else -> null
        }
    }
    fun isProjectFile(destination: String): Boolean = destination.isNotBlank() && destination.length <= 4096 &&
        !destination.contains('\u0000') && !destination.startsWith('#') &&
        !destination.startsWith("//") && !destination.startsWith("\\\\") &&
        external(destination) == null &&
        (!scheme.containsMatchIn(destination) || drive.containsMatchIn(destination) || destination.startsWith("file:", ignoreCase = true))
}
