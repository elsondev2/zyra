package dev.zyra.mobile.data

data class GitChange(val path: String, val index: String, val worktree: String, val oldPath: String = "") {
    val staged get()=index.isNotBlank() && index!="?"
    val working get()=worktree.isNotBlank() || index=="?"
    fun status(staged: Boolean)=gitStatusLabel(if(staged) index else worktree)
}
fun gitStatusLabel(value: String)=when(value) {
    "M"->"Modified";"A"->"Added";"D"->"Deleted";"R"->"Renamed";"C"->"Copied";"T"->"Type changed";"U"->"Conflict";"?"->"New file";else->"Unchanged"
}
enum class GitDiffKind { FILE, HUNK, ADD, REMOVE, CONTEXT, NOTE }
data class GitDiffRow(val text: String, val kind: GitDiffKind, val before: Int? = null, val after: Int? = null)
fun gitDiffRows(diff: String): List<GitDiffRow> {
    // Combined merge diffs have multiple parent columns. Preserve their exact
    // content instead of assigning incorrect two-way line numbers or hiding it.
    if(diff.lineSequence().any {it.startsWith("diff --cc ") || it.startsWith("diff --combined ") || it.startsWith("@@@")})
        return diff.lineSequence().filter {it.isNotEmpty()}.map {GitDiffRow(it,if(it.startsWith("diff ")) GitDiffKind.FILE else GitDiffKind.NOTE)}.toList()
    val rows=mutableListOf<GitDiffRow>();var before=0;var after=0;var hunk=false
    val header=Regex("^@@ -(\\d+)(?:,\\d+)? \\+(\\d+)(?:,\\d+)? @@")
    for(line in diff.lineSequence()) {
        when {
            line.startsWith("diff --git ") -> {hunk=false;rows+=GitDiffRow(line.removePrefix("diff --git "),GitDiffKind.FILE)}
            header.containsMatchIn(line) -> {val match=header.find(line)!!;before=match.groupValues[1].toInt();after=match.groupValues[2].toInt();hunk=true;rows+=GitDiffRow(line,GitDiffKind.HUNK)}
            hunk && line.startsWith("+") -> rows+=GitDiffRow(line.drop(1),GitDiffKind.ADD,after=after++)
            hunk && line.startsWith("-") -> rows+=GitDiffRow(line.drop(1),GitDiffKind.REMOVE,before=before++)
            hunk && line.startsWith(" ") -> rows+=GitDiffRow(line.drop(1),GitDiffKind.CONTEXT,before++,after++)
            line.startsWith("Binary files ") || line.startsWith("\\ No newline") || line.startsWith("rename ") || line.startsWith("old mode ") || line.startsWith("new mode ") -> rows+=GitDiffRow(line,GitDiffKind.NOTE)
        }
    }
    return rows
}
