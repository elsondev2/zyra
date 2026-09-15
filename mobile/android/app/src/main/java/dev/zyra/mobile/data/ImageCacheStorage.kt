package dev.zyra.mobile.data

import java.io.File
import java.nio.file.Files
import java.nio.file.LinkOption

data class ImageCacheUsage(val downloadableBytes: Long = 0, val inProgressBytes: Long = 0, val files: Int = 0)
/** Only completed generated image files are disposable; drafts, outbox and trust data never enter this allowlist. */
class ImageCacheStorage(private val cacheDirectory: File) {
    private val media = Regex("(?:[a-f0-9]{64}-)?[a-f0-9]{64}\\.image")
    private val remote = Regex("[a-f0-9]{64}\\.image")
    private fun directory(name: String): File? {
        val child = File(cacheDirectory, name)
        return child.takeIf { !Files.isSymbolicLink(it.toPath()) && it.canonicalFile.parentFile == cacheDirectory.canonicalFile && it.isDirectory }
    }
    private fun workspaceFiles(partials: Boolean = false): List<File> {
        val root = directory("workspace-downloads") ?: return emptyList()
        return root.listFiles()?.filter { it.name.matches(Regex("[a-f0-9]{64}")) && !Files.isSymbolicLink(it.toPath()) && it.isDirectory && it.canonicalFile.parentFile == root.canonicalFile }
            ?.flatMap { child -> child.listFiles()?.filter { (it.name == ".incoming") == partials && Files.isRegularFile(it.toPath(), LinkOption.NOFOLLOW_LINKS) }.orEmpty() }.orEmpty()
    }
    private fun completed(): List<File> = workspaceFiles() + listOf("media" to media, "remote-markdown-images" to remote).flatMap { (name, pattern) ->
        directory(name)?.listFiles()?.filter { pattern.matches(it.name) && Files.isRegularFile(it.toPath(), LinkOption.NOFOLLOW_LINKS) }.orEmpty()
    }
    fun usage(): ImageCacheUsage {
        val completed = completed()
        val partial = directory("media")?.listFiles()?.filter { it.name.matches(Regex("[a-f0-9]{64}-[a-f0-9]{64}\\.part")) && Files.isRegularFile(it.toPath(), LinkOption.NOFOLLOW_LINKS) }.orEmpty()
        return ImageCacheUsage(completed.sumOf { it.length() }, (partial + workspaceFiles(partials = true)).sumOf { it.length() }, completed.size)
    }
    fun clearCompleted(): ImageCacheUsage {
        for (file in completed()) check(file.delete() || !file.exists()) { "Some images could not be cleared. Try again." }
        return usage()
    }
}
