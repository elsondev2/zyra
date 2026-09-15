package dev.zyra.mobile.voice

import android.app.*
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import dev.zyra.mobile.MainActivity
import dev.zyra.mobile.R
import dev.zyra.mobile.ZyraApplication
import dev.zyra.mobile.ui.MobileSession
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map

/** Visible, user-started microphone lifetime. It never restarts a call after
 * process death; closing the task stops capture and then drains the transcript. */
class VoiceCallService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var owner: MobileSession? = null
    private var observer: Job? = null
    private val connection get() = (application as ZyraApplication).voiceService
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == STOP) { if (owner == null) stopSelf() else owner?.voice?.stop(); return START_NOT_STICKY }
        val session = connection.session
        if (session == null || !session.voice.state.value.inCall) { stopSelf(); return START_NOT_STICKY }
        owner = session
        connection.attached()
        try {
            getSystemService(NotificationManager::class.java).createNotificationChannel(
                NotificationChannel(CHANNEL, "Voice calls", NotificationManager.IMPORTANCE_LOW).apply { description = "Controls for a Voice call you started"; setShowBadge(false) })
            val notification = notification(session.voice.state.value)
            if (Build.VERSION.SDK_INT >= 30) startForeground(ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
            else startForeground(ID, notification)
            connection.connected()
            if (observer == null) observer = scope.launch {
                session.voice.state.map { it.phase to it.muted }.distinctUntilChanged().collect {
                    if (session.voice.state.value.inCall) getSystemService(NotificationManager::class.java).notify(ID, notification(session.voice.state.value))
                }
            }
        } catch (e: Exception) { connection.failed("Android could not keep Voice running. Check microphone access and try again."); stopSelf() }
        return START_NOT_STICKY
    }
    private fun notification(state: VoiceState): Notification {
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val stop = PendingIntent.getService(this, 1, Intent(this, VoiceCallService::class.java).setAction(STOP), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val text = when (state.phase) { "connecting" -> "Connecting…"; "reconnecting" -> "Reconnecting…"; "stopping" -> "Ending Voice…"; else -> if (state.muted) "Microphone muted" else "Microphone is on" }
        return Notification.Builder(this, CHANNEL).setSmallIcon(R.drawable.ic_mic).setContentTitle("Zyra Voice").setContentText(text)
            .setContentIntent(open).setOngoing(true).setOnlyAlertOnce(true).setCategory(Notification.CATEGORY_SERVICE)
            .setVisibility(Notification.VISIBILITY_PRIVATE).addAction(Notification.Action.Builder(null, "End Voice", stop).build()).build()
    }
    override fun onTaskRemoved(rootIntent: Intent?) { owner?.voice?.stop(); super.onTaskRemoved(rootIntent) }
    override fun onDestroy() {
        observer?.cancel(); scope.cancel()
        connection.destroyed(owner); owner = null
        stopForeground(STOP_FOREGROUND_REMOVE)
        super.onDestroy()
    }
    companion object { private const val CHANNEL = "zyra-voice"; private const val ID = 1101; private const val STOP = "dev.zyra.mobile.END_VOICE" }
}
