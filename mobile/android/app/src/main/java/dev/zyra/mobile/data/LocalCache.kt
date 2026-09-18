package dev.zyra.mobile.data

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONObject

data class PendingSend(val id: String, val text: String, val state: String, val images: List<String> = emptyList())
class LocalCache(context: Context) : SQLiteOpenHelper(context, "mobile-cache.db", null, 1) {
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE cache (key TEXT PRIMARY KEY, body TEXT NOT NULL, touched INTEGER NOT NULL)")
        db.execSQL("CREATE TABLE outbox (id TEXT PRIMARY KEY, host TEXT NOT NULL, session TEXT NOT NULL, body TEXT NOT NULL, state TEXT NOT NULL, touched INTEGER NOT NULL)")
        db.execSQL("CREATE INDEX outbox_session ON outbox(host, session)")
    }
    override fun onUpgrade(db: SQLiteDatabase, old: Int, new: Int) { error("Unsupported cache version") }
    @Synchronized fun get(key: String): String? = readableDatabase.rawQuery("SELECT body FROM cache WHERE key = ?", arrayOf(key)).use {
        if (it.moveToFirst()) it.getString(0) else null
    }
    @Synchronized fun put(key: String, body: String) {
        if (body.toByteArray().size > 2 * 1024 * 1024) return
        val db = writableDatabase
        db.beginTransaction()
        try {
            db.insertWithOnConflict("cache", null, ContentValues().apply { put("key", key); put("body", body); put("touched", System.currentTimeMillis()) }, SQLiteDatabase.CONFLICT_REPLACE)
            db.execSQL("DELETE FROM cache WHERE key IN (SELECT key FROM cache WHERE key NOT LIKE 'draft:%' ORDER BY touched DESC LIMIT -1 OFFSET 60)")
            fun bytes(): Long = db.rawQuery("SELECT COALESCE(SUM(LENGTH(CAST(body AS BLOB))),0) FROM cache", null).use { it.moveToFirst(); it.getLong(0) }
            while (bytes() > 24 * 1024 * 1024) {
                val removed = db.delete("cache", "key = (SELECT key FROM cache WHERE key NOT LIKE 'draft:%' ORDER BY touched LIMIT 1)", null)
                check(removed > 0) { "Draft storage is full. Send or clear older drafts before saving more." }
            }
            db.setTransactionSuccessful()
        } finally { db.endTransaction() }
    }
    @Synchronized fun recordSend(host: String, session: String, id: String, text: String, type: String, images: List<String> = emptyList()) {
        require(text.toByteArray().size <= 65536) { "Message is too large." }
        val pending = readableDatabase.rawQuery("SELECT COUNT(*) FROM outbox WHERE state != 'completed'", null).use { it.moveToFirst(); it.getInt(0) }
        check(pending < 100) { "Review pending messages before sending more." }
        writableDatabase.insertOrThrow("outbox", null, ContentValues().apply {
            put("id", id); put("host", host); put("session", session)
            put("body", JSONObject().put("text", text).put("type", type).put("images", org.json.JSONArray(images)).toString())
            put("state", "sending"); put("touched", System.currentTimeMillis())
        })
    }
    @Synchronized fun settleSend(id: String, state: String) {
        writableDatabase.update("outbox", ContentValues().apply { put("state", state); put("touched", System.currentTimeMillis()) }, if (state != "completed") "id = ? AND state != 'completed'" else "id = ?", arrayOf(id))
        writableDatabase.execSQL("DELETE FROM outbox WHERE id IN (SELECT id FROM outbox WHERE state = 'completed' ORDER BY touched DESC LIMIT -1 OFFSET 30)")
    }
    @Synchronized fun pending(host: String, session: String): List<PendingSend> =
        readableDatabase.rawQuery("SELECT id, body, state FROM outbox WHERE host = ? AND session = ? AND state != 'completed' ORDER BY touched", arrayOf(host, session)).use { cursor ->
            buildList { while (cursor.moveToNext()) { val body = JSONObject(cursor.getString(1)); val images = body.optJSONArray("images"); add(PendingSend(cursor.getString(0), body.optString("text"), cursor.getString(2), (0 until (images?.length() ?: 0)).map { images!!.getString(it) })) } }
        }
    @Synchronized fun storageUsage(): LocalStorageUsage {
        val db = readableDatabase
        fun bytes(table: String, predicate: String) = db.rawQuery("SELECT COALESCE(SUM(LENGTH(CAST(body AS BLOB))),0) FROM $table WHERE $predicate", null).use { it.moveToFirst(); it.getLong(0) }
        return LocalStorageUsage(bytes("cache", "key LIKE 'session:%'"), bytes("cache", "key LIKE 'draft:%'"), bytes("outbox", "state != 'completed'"))
    }
    @Synchronized fun clearHistory() { writableDatabase.delete("cache", "key LIKE 'session:%'", null) }
    @Synchronized fun removeMachine(id: String) {
        writableDatabase.delete("cache", "key LIKE ?", arrayOf("%:$id:%"))
        writableDatabase.delete("outbox", "host = ?", arrayOf(id))
    }
}

data class LocalStorageUsage(val historyBytes: Long = 0, val draftBytes: Long = 0, val queuedBytes: Long = 0)
