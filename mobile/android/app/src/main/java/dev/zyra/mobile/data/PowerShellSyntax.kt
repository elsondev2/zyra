package dev.zyra.mobile.data

/** Preview lexer: bounded offsets, literal paths, PowerShell quotes and variables. */
internal object PowerShellSyntax {
    private val keywords = "begin break catch class continue data do dynamicparam else elseif end enum exit filter finally for foreach from function if in param process return switch throw trap try until using while workflow".split(' ').toSet()
    fun tokens(text: String): List<CodeToken> {
        val result = ArrayList<CodeToken>()
        val limit = minOf(text.length, 131072)
        var i = 0
        fun emit(start: Int, kind: CodeTokenKind) { result.add(CodeToken(start, i, kind)) }
        while (i < limit && result.size < 16000) {
            val start = i
            val c = text[i]
            when {
                c == '<' && i + 1 < limit && text[i + 1] == '#' -> {
                    i += 2; var depth = 1
                    while (i < limit && depth > 0) {
                        when {
                            i + 1 < limit && text[i] == '<' && text[i + 1] == '#' -> { depth++; i += 2 }
                            i + 1 < limit && text[i] == '#' && text[i + 1] == '>' -> { depth--; i += 2 }
                            else -> i++
                        }
                    }
                    emit(start, CodeTokenKind.COMMENT)
                }
                c == '#' -> { while (i < limit && text[i] != '\n') i++; emit(start, CodeTokenKind.COMMENT) }
                c == '@' && i + 1 < limit && text[i + 1] in "\"'" -> {
                    val quote = text[i + 1]; i += 2
                    while (i < limit) {
                        if (i > 0 && text[i - 1] == '\n' && text[i] == quote && i + 1 < limit && text[i + 1] == '@') { i += 2; break }
                        i++
                    }
                    emit(start, CodeTokenKind.STRING)
                }
                c == '\'' || c == '"' -> {
                    i++
                    while (i < limit) {
                        if (c == '"' && text[i] == '`') { i = minOf(limit, i + 2); continue }
                        if (text[i] == c) {
                            if (i + 1 < limit && text[i + 1] == c) { i += 2; continue }
                            i++; break
                        }
                        i++
                    }
                    emit(start, CodeTokenKind.STRING)
                }
                c == '$' || (c == '@' && i + 1 < limit && (text[i + 1].isLetter() || text[i + 1] == '_')) -> {
                    i++
                    if (i < limit && text[i] == '{') { while (i < limit && text[i] != '}') i++; if (i < limit) i++ }
                    else { while (i < limit && (text[i].isLetterOrDigit() || text[i] in "_:?^")) i++ }
                    emit(start, CodeTokenKind.PROPERTY)
                }
                c == '-' && i + 1 < limit && text[i + 1].isLetter() -> {
                    i++; while (i < limit && (text[i].isLetterOrDigit() || text[i] == '-')) i++
                    emit(start, CodeTokenKind.PROPERTY)
                }
                c.isDigit() -> { i++; while (i < limit && (text[i].isLetterOrDigit() || text[i] == '.')) i++; emit(start, CodeTokenKind.NUMBER) }
                c.isLetter() || c == '_' -> {
                    i++; while (i < limit && (text[i].isLetterOrDigit() || text[i] in "_-")) i++
                    val word = text.substring(start, i)
                    if (word.lowercase() in keywords || word.contains('-')) emit(start, CodeTokenKind.KEYWORD)
                }
                else -> i++
            }
        }
        return result
    }
}
