package dev.zyra.mobile.data

/** Linear, bounded lexical highlighting for previews; offsets always refer to the original text. */
enum class CodeTokenKind { COMMENT, STRING, KEYWORD, NUMBER, PROPERTY }
data class CodeToken(val start: Int, val end: Int, val kind: CodeTokenKind)
object CodeSyntax {
    private val keywords = "abstract as async await break case catch class const constructor continue data def default do else enum export extends false final finally for from fun function if implements import in interface internal is let module namespace new null object open override package private protected public raise readonly return sealed static struct super switch this throw throws trait true try type typeof undefined union using val var virtual void when while with yield None True False self".split(' ').toSet()
    fun language(path: String): String = path.substringAfterLast('/').lowercase().let { name ->
        when {
            name == "dockerfile" -> "shell"
            else -> when (name.substringAfterLast('.', name)) {
                "ts", "tsx", "js", "jsx", "mjs", "cjs", "javascript", "typescript" -> "js"
                "kt", "kts", "java", "kotlin", "c", "h", "cpp", "hpp", "cs", "rs", "go", "swift" -> "code"
                "ps1", "psm1", "psd1", "powershell", "pwsh" -> "powershell"
                "py", "python", "rb", "ruby", "sh", "bash", "zsh", "shell", "yaml", "yml", "toml" -> "hash"
                "json", "jsonc" -> "json"
                "xml", "html", "svg", "css", "scss" -> "markup"
                else -> "text"
            }
        }
    }
    fun tokens(text: String, path: String): List<CodeToken> {
        val language = language(path)
        if (language == "text") return emptyList()
        if (language == "powershell") return PowerShellSyntax.tokens(text)
        val result = ArrayList<CodeToken>()
        val limit = minOf(text.length, 131072)
        var i = 0
        fun emit(start: Int, kind: CodeTokenKind) { result.add(CodeToken(start, i, kind)) }
        while (i < limit && result.size < 16000) {
            val start = i
            val c = text[i]
            when {
                (c == '#' && language == "hash") || (c == '/' && i + 1 < limit && text[i + 1] == '/' && language != "hash") -> {
                    while (i < limit && text[i] != '\n') i++
                    emit(start, CodeTokenKind.COMMENT)
                }
                c == '/' && i + 1 < limit && text[i + 1] == '*' -> {
                    i += 2
                    while (i < limit && !(text[i - 1] == '*' && text[i] == '/')) i++
                    if (i < limit) i++
                    emit(start, CodeTokenKind.COMMENT)
                }
                c == '<' && language == "markup" && text.startsWith("<!--", i) -> {
                    i = text.indexOf("-->", i + 4).let { if (it < 0) limit else minOf(limit, it + 3) }
                    emit(start, CodeTokenKind.COMMENT)
                }
                c == '"' || c == '\'' || (c == '`' && language == "js") -> {
                    val triple = i + 2 < limit && text[i + 1] == c && text[i + 2] == c && language == "hash"
                    i += if (triple) 3 else 1
                    while (i < limit) {
                        if (text[i] == '\\') { i = minOf(limit, i + 2); continue }
                        if (text[i] == c && (!triple || (i + 2 < limit && text[i + 1] == c && text[i + 2] == c))) { i += if (triple) 3 else 1; break }
                        i++
                    }
                    val next = (i until limit).firstOrNull { !text[it].isWhitespace() }
                    emit(start, if (language == "json" && next != null && text[next] == ':') CodeTokenKind.PROPERTY else CodeTokenKind.STRING)
                }
                c.isDigit() && (i == 0 || !text[i - 1].isLetterOrDigit()) -> {
                    i++
                    while (i < limit && (text[i].isLetterOrDigit() || text[i] in "._")) i++
                    emit(start, CodeTokenKind.NUMBER)
                }
                c.isLetter() || c == '_' -> {
                    i++
                    while (i < limit && (text[i].isLetterOrDigit() || text[i] == '_')) i++
                    if (text.substring(start, i) in keywords) emit(start, CodeTokenKind.KEYWORD)
                }
                else -> i++
            }
        }
        return result
    }
}
