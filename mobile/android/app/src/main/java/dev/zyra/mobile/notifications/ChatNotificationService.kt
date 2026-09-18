package dev.zyra.mobile.notifications

import android.app.*
import android.content.*
import android.content.pm.ServiceInfo
import android.os.*
import dev.zyra.mobile.*
import dev.zyra.mobile.data.Chat
import dev.zyra.mobile.lifecycle.SessionStore
import dev.zyra.mobile.ui.MobileSession
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.Channel
import org.json.JSONObject

/** User-enabled cross-device messaging. Holds the existing authenticated session. */
class ChatNotificationService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var lease: SessionStore.Lease<MobileSession>? = null
    private val refresh = Channel<Unit>(Channel.CONFLATED)
    private val manager get() = getSystemService(NotificationManager::class.java)
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == STOP) { lease?.value?.preferences?.notifications(false); stopSelf(); return START_NOT_STICKY }
        if (lease != null) return START_NOT_STICKY
        val owner = (application as ZyraApplication).sessions.acquire(); lease = owner
        if (!owner.value.preferences.notifications.value || !allowed(this)) { stopSelf(); return START_NOT_STICKY }
        manager.createNotificationChannel(NotificationChannel(CONNECTION, "Chat connection", NotificationManager.IMPORTANCE_LOW))
        manager.createNotificationChannel(NotificationChannel(ALERTS, "Chat responses and requests", NotificationManager.IMPORTANCE_DEFAULT))
        val stop = PendingIntent.getService(this, 0, Intent(this, javaClass).setAction(STOP), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val status = Notification.Builder(this, CONNECTION).setSmallIcon(R.drawable.ic_bell).setContentTitle("Zyra chat notifications")
            .setContentText("Keeping your paired computers connected").setOngoing(true).setOnlyAlertOnce(true)
            .addAction(Notification.Action.Builder(null, "Turn off", stop).build()).build()
        try {
            if (Build.VERSION.SDK_INT >= 34) startForeground(1201, status, ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING) else startForeground(1201, status)
        } catch (_: Exception) { owner.value.preferences.notifications(false); stopSelf(); return START_NOT_STICKY }
        owner.value.notificationConnection(true)
        val prefs = getSharedPreferences("chat-alert-receipts", MODE_PRIVATE)
        val saved = runCatching { JSONObject(prefs.getString("seen", "{}")!!) }.getOrDefault(JSONObject())
        val seen = linkedMapOf<String, String>(); saved.keys().forEach { seen[it] = saved.optString(it) }
        val policy = ChatAlertPolicy(seen, System.currentTimeMillis())
        scope.launch { owner.value.notificationChanges.collect { refresh.trySend(Unit) } }
        scope.launch { while (isActive) { refresh.trySend(Unit); delay(30000) } }
        scope.launch {
            for (signal in refresh) {
                if (!allowed(this@ChatNotificationService) || !owner.value.preferences.notifications.value) { stopSelf(); break }
                delay(250)
                for (chat in owner.value.notificationChats()) {
                    val message = policy.observe(chat, owner.value.visibleChatKey())
                    if (message != null) notify(chat, message)
                }
                prefs.edit().putString("seen", JSONObject(seen as Map<*, *>).toString()).apply()
            }
        }
        return START_NOT_STICKY
    }
    private fun notify(chat: Chat, message: String) {
        val intent = Intent(this, MainActivity::class.java).setAction(OPEN)
            .setData(android.net.Uri.Builder().scheme("zyra-alert").authority("chat").appendPath(chat.machineId).appendPath(chat.id).build())
            .putExtra("machine", chat.machineId).putExtra("chat", chat.id)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val open = PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val alert = Notification.Builder(this, ALERTS).setSmallIcon(R.drawable.ic_bell).setContentTitle(chat.title)
            .setContentText(message).setContentIntent(open).setAutoCancel(true).setVisibility(Notification.VISIBILITY_PRIVATE)
            .setCategory(if (chat.attention != null) Notification.CATEGORY_REMINDER else Notification.CATEGORY_MESSAGE).build()
        manager.notify(chat.key, 1202, alert)
    }
    override fun onDestroy() { scope.cancel(); lease?.value?.notificationConnection(false); lease?.close(); lease = null; stopForeground(STOP_FOREGROUND_REMOVE); super.onDestroy() }
    companion object {
        const val OPEN = "dev.zyra.mobile.OPEN_CHAT_ALERT"
        private const val STOP = "dev.zyra.mobile.STOP_CHAT_ALERTS"
        private const val CONNECTION = "chat-connection"
        private const val ALERTS = "chat-alerts"
        fun allowed(context: Context) = context.getSystemService(NotificationManager::class.java).areNotificationsEnabled()
        fun start(context: Context): Boolean = runCatching {
            if (!allowed(context)) false else { context.startForegroundService(Intent(context, ChatNotificationService::class.java)); true }
        }.getOrDefault(false)
        fun stop(context: Context) { context.stopService(Intent(context, ChatNotificationService::class.java)) }
    }
}
