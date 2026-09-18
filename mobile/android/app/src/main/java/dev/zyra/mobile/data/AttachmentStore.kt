package dev.zyra.mobile.data

import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.security.MessageDigest
import java.util.UUID

data class LocalAttachment(val id: String, val machine: String, val session: String, val name: String, val size: Long, val sha256: String,
    val mimeType: String, val submitted: String? = null) {
    fun json() = JSONObject().put("id", id).put("machine", machine).put("session", session).put("name", name).put("size", size).put("sha256", sha256).put("mimeType", mimeType).put("submitted", submitted)
    companion object { fun parse(value: JSONObject) = LocalAttachment(value.getString("id"), value.getString("machine"), value.getString("session"), value.getString("name"), value.getLong("size"), value.getString("sha256"), value.getString("mimeType"), value.optString("submitted").takeUnless { it.isBlank() || it == "null" }) }
}
/** Unsent files live in private files storage, never the OS-evictable preview cache. */
class AttachmentStore(private val directory: File) {
    companion object { const val MAX_FILE = 20L * 1024 * 1024; const val MAX_TOTAL = 128L * 1024 * 1024 }
    private val manifest = File(directory, "attachments.json")
    private val identifier = Regex("[a-f0-9-]{36}")
    init { check(directory.mkdirs() || directory.isDirectory) }
    @Synchronized private fun records(): List<LocalAttachment> {
        if (!manifest.exists()) return emptyList()
        val array = JSONArray(manifest.readText()); return (0 until array.length()).map { LocalAttachment.parse(array.getJSONObject(it)) }
    }
    private fun persist(records: List<LocalAttachment>) {
        val next = File(directory, "attachments.next")
        FileOutputStream(next).use { stream -> stream.write(JSONArray(records.map { it.json() }).toString().toByteArray()); stream.fd.sync() }
        Files.move(next.toPath(), manifest.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
    }
    fun file(id: String): File { require(identifier.matches(id)); return File(directory, id + ".attachment") }
    @Synchronized fun list(machine: String, session: String) = records().filter { it.machine == machine && it.session == session && it.submitted == null }
    @Synchronized fun allForSend(id: String) = records().filter { it.submitted == id }
    @Synchronized fun add(machine: String, session: String, name: String, mimeType: String, input: InputStream): LocalAttachment {
        val before = records()
        require(before.size < 128) { "Remove unused attachments before adding more." }
        require(before.count { it.machine == machine && it.session == session && it.submitted == null } < 12) { "Attach at most 12 files." }
        val remaining = minOf(MAX_TOTAL - before.sumOf { it.size }, 40L * 1024 * 1024 - before.filter { it.machine == machine && it.session == session && it.submitted == null }.sumOf { it.size })
        require(remaining > 0) { "Attachment storage is full. Review pending messages or remove unused attachments." }
        val id = UUID.randomUUID().toString(); val target = file(id); var count = 0L
        val hash = MessageDigest.getInstance("SHA-256")
        try {
            FileOutputStream(target).use { output ->
                val buffer = ByteArray(48 * 1024)
                while (true) { val read = input.read(buffer); if (read < 0) break; if (read == 0) continue
                    count += read; require(count <= MAX_FILE && count <= remaining) { "Attachment exceeds the available storage or 20 MB file limit." }
                    output.write(buffer, 0, read); hash.update(buffer, 0, read)
                }
                output.fd.sync()
            }
            val attachment = LocalAttachment(id, machine, session, name.take(180), count, hash.digest().joinToString("") { "%02x".format(it) }, mimeType)
            persist(before + attachment); return attachment
        } catch (error: Exception) { target.delete(); throw error }
    }
    @Synchronized fun submitted(ids: List<String>, operation: String) {
        persist(records().map { if (it.id in ids) it.copy(submitted = operation) else it })
    }
    @Synchronized fun remove(ids: List<String>) {
        val current = records(); persist(current.filterNot { it.id in ids }); current.filter { it.id in ids }.forEach { file(it.id).delete() }
    }
    @Synchronized fun complete(operation: String) { remove(records().filter { it.submitted == operation }.map { it.id }) }
    @Synchronized fun forget(machine: String) { remove(records().filter { it.machine == machine }.map { it.id }) }
    @Synchronized fun cleanOrphans() {
        val known = records().map { file(it.id).name }.toSet()
        directory.listFiles()?.filter { it.name.endsWith(".attachment") && identifier.matches(it.name.removeSuffix(".attachment")) && it.name !in known }?.forEach { it.delete() }
    }
}
