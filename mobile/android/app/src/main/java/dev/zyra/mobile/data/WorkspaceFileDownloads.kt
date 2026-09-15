package dev.zyra.mobile.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import kotlinx.coroutines.CancellationException
import java.security.MessageDigest
import java.util.Base64

/** Sizes requests using the observed transfer, never a separate network speed test. */
class FileTransferPacing {
    var bytesPerSecond: Long = 0; private set
    var chunkBytes: Int = 16 * 1024; private set
    fun received(bytes: Int, elapsedNanos: Long) {
        val rate = (bytes * 1_000_000_000.0 / elapsedNanos.coerceAtLeast(1)).toLong().coerceAtLeast(1)
        bytesPerSecond = if (bytesPerSecond == 0L) rate else ((bytesPerSecond * 3.0 + rate) / 4).toLong()
        chunkBytes = (bytesPerSecond * .2).toInt().coerceIn(8 * 1024, 48 * 1024)
    }
}
class WorkspaceFileDownloads(private val directory: File) {
    suspend fun load(owner: String, path: String, metadata: JSONObject, request: suspend (String, JSONObject) -> JSONObject,
        progress: (Long, Long, Long) -> Unit): File = withContext(Dispatchers.IO) { gate.withLock {
        val total = metadata.getLong("size"); val etag = metadata.getString("etag")
        require(total in 0..MAX_BYTES) { "Files can be downloaded up to 64 MB." }
        val filename = path.substringAfterLast('/').replace(Regex("""[\p{Cntrl}/\\:*?"<>|]"""), "_").take(160).let { if (it.isBlank() || it in setOf(".", "..", ".incoming")) "file" else it }
        val key = digest((owner + "\u0000" + path + "\u0000" + etag).toByteArray())
        directory.mkdirs()
        val folder = File(directory, key).apply { mkdirs() }; val target = File(folder, filename)
        if (target.isFile && target.length() == total && (metadata.optString("hash").isBlank() || fileHash(target) == metadata.optString("hash"))) { target.setLastModified(System.currentTimeMillis()); return@withLock target }
        if (target.exists()) check(target.delete()) { "Could not replace an incomplete download." }
        val partial = File(folder, ".incoming")
        val expected = metadata.optString("hash")
        // A resumable prefix must still be verified against the PC's content hash.
        // Binary metadata without a hash deliberately starts again from byte zero.
        val resumable = expected.matches(Regex("[a-f0-9]{64}"))
        if (partial.exists() && (!resumable || partial.length() > total)) check(partial.delete()) { "Could not restart this download." }
        check(directory.usableSpace >= total - partial.length() + 16L * 1024 * 1024) { "Your phone needs more free storage for this file." }
        prune(folder, total - partial.length())
        var keepPartial = false
        try {
            val checksum = MessageDigest.getInstance("SHA-256")
            var offset = partial.length(); val pacing = FileTransferPacing(); progress(offset, total, 0)
            if (offset > 0) partial.inputStream().use { input ->
                val buffer = ByteArray(48 * 1024)
                while (true) { currentCoroutineContext().ensureActive(); val count = input.read(buffer); if (count < 0) break; checksum.update(buffer, 0, count) }
            }
            FileOutputStream(partial, true).use { output ->
                while (offset < total) {
                    currentCoroutineContext().ensureActive()
                    val began = System.nanoTime()
                    val chunk = request("workspace.file.chunk", JSONObject().put("path", path).put("etag", etag).put("offset", offset).put("length", pacing.chunkBytes))
                    val bytes = Base64.getDecoder().decode(chunk.getString("base64")); val next = chunk.getLong("next")
                    check(chunk.getLong("total") == total && chunk.getString("etag") == etag && bytes.size in 1..(48 * 1024) && next == offset + bytes.size && next <= total) { "File transfer changed. Refresh the file and try again." }
                    output.write(bytes); checksum.update(bytes); offset = next; pacing.received(bytes.size, System.nanoTime() - began); progress(offset, total, pacing.bytesPerSecond)
                }
            }
            currentCoroutineContext().ensureActive()
            if (resumable) check(checksum.digest().joinToString("") { "%02x".format(it) } == expected) { "File verification failed. Please retry." }
            check(partial.renameTo(target)) { "Could not save this download." }
            prune(folder)
            target
        } catch (failure: Exception) {
            keepPartial = resumable && partial.length() in 1..total && (failure is IOException || failure is CancellationException)
            throw failure
        } finally { if (!keepPartial) partial.delete(); if (folder.listFiles().isNullOrEmpty()) folder.delete(); prune(folder) }
    } }
    private fun prune(keep: File, reserve: Long = 0) {
        val folders = directory.listFiles()?.filter { it.name.matches(Regex("[a-f0-9]{64}")) && !java.nio.file.Files.isSymbolicLink(it.toPath()) && it.isDirectory }.orEmpty()
        var bytes = reserve + folders.sumOf { folder -> folder.listFiles().orEmpty().sumOf { it.length() } }
        for (folder in folders.sortedBy { it.listFiles().orEmpty().maxOfOrNull { item -> item.lastModified() } ?: 0 }) {
            if (bytes <= 96L * 1024 * 1024 || folder == keep) continue
            for (file in folder.listFiles().orEmpty()) if (file.isFile && !java.nio.file.Files.isSymbolicLink(file.toPath())) { val size = file.length(); if (file.delete()) bytes -= size }
            if (folder.listFiles().isNullOrEmpty()) folder.delete()
        }
    }
    companion object {
        const val MAX_BYTES = 64L * 1024 * 1024
        private val gate = Mutex()
        private fun fileHash(file: File): String {
            val hash = MessageDigest.getInstance("SHA-256")
            file.inputStream().use { input -> val buffer = ByteArray(48 * 1024); while (true) { val count = input.read(buffer); if (count < 0) break; hash.update(buffer, 0, count) } }
            return hash.digest().joinToString("") { "%02x".format(it) }
        }
        private fun digest(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
    }
}
