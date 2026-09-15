package dev.zyra.mobile.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.zyra.mobile.data.TimelineItem
import dev.zyra.mobile.voice.VoiceTranscript

@Composable fun VoiceTranscriptMessage(entry: VoiceTranscript) {
    Column(Modifier.fillMaxWidth(), horizontalAlignment = if (entry.role == "user") Alignment.End else Alignment.Start) {
        TimelineMessage(TimelineItem("voice:" + entry.id, entry.role, entry.text, if (entry.complete) "message" else "stream"), copyable = !entry.placeholder) {}
        val status = when (entry.delivery) {
            "listening" -> "Listening…"
            "transcribing", "recovering" -> "Transcribing…"
            "unavailable" -> "Transcript unavailable · this voice message was not saved"
            "uncertain" -> "Delivery not confirmed · check this chat before resending"
            "failed" -> "Voice response failed"
            "interrupted" -> "Not saved · Voice ended before this message finished"
            else -> null
        }
        if (status != null) Text(status, style = MaterialTheme.typography.labelSmall,
            color = if (entry.delivery in setOf("uncertain", "failed", "interrupted", "unavailable")) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp, start = 2.dp, end = 2.dp))
    }
}
