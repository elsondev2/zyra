package dev.zyra.mobile.data

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns

object FilePreparation {
    fun add(context: Context, store: AttachmentStore, machine: String, session: String, uri: Uri, optimize: Boolean): LocalAttachment {
        val name = (if (uri.scheme == "file") java.io.File(uri.path ?: "").name else context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use {
            if (it.moveToFirst()) it.getString(0) else null
        } ?: uri.lastPathSegment ?: "Attachment").replace(Regex("[\\p{Cntrl}]"), " ").take(180)
        if (name.substringAfterLast('.', "").lowercase() in setOf("png", "jpg", "jpeg", "gif", "webp") || context.contentResolver.getType(uri)?.startsWith("image/") == true) {
            return PhotoPreparation.add(context, store, machine, session, uri, optimize)
        }
        val bytes = context.contentResolver.openInputStream(uri)?.use { input ->
            val output = java.io.ByteArrayOutputStream(); val buffer = ByteArray(8192)
            while (output.size() <= TextAttachmentPolicy.MAX_BYTES) { val n = input.read(buffer, 0, minOf(buffer.size, TextAttachmentPolicy.MAX_BYTES + 1 - output.size())); if (n < 0) break; if (n > 0) output.write(buffer, 0, n) }
            output.toByteArray() } ?: error("This file cannot be opened. Choose it again.")
        TextAttachmentPolicy.validate(name, bytes)
        return bytes.inputStream().use { store.add(machine, session, name, "text/plain", it) }
    }
}
