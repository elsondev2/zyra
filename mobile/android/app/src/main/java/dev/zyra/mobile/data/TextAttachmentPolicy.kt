package dev.zyra.mobile.data

import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction

/** Files are inline context, never an executable path or a provider-supplied MIME claim. */
object TextAttachmentPolicy {
    const val MAX_BYTES = 180_000
    val extensions = setOf("txt", "md", "markdown", "json", "jsonl", "csv", "tsv", "yaml", "yml", "xml", "html", "css", "scss", "js", "jsx", "ts", "tsx", "py", "kt", "java", "c", "h", "cpp", "hpp", "cs", "go", "rs", "rb", "sh", "ps1", "sql", "toml", "ini", "log", "properties", "vue", "svelte", "swift", "dart", "r")
    fun validate(name: String, bytes: ByteArray): String {
        require(name.substringAfterLast('.', "").lowercase() in extensions) { "Choose a text, Markdown, source code or data file. PDFs and other binary files are not supported yet." }
        require(bytes.size <= MAX_BYTES) { "Text attachments can be up to 180 KB." }
        val text = try { Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString() }
            catch (_: Exception) { throw IllegalArgumentException("Choose a UTF-8 text file.") }
        require(text.none { it.code < 32 && it !in "\n\r\t" }) { "This file contains binary data. Choose a UTF-8 text file." }
        return text
    }
}
