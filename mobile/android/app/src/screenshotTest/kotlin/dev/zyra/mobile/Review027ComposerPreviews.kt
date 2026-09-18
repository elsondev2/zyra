package dev.zyra.mobile

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.android.tools.screenshot.PreviewTest
import dev.zyra.mobile.data.*
import dev.zyra.mobile.ui.*

@PreviewTest @Preview(widthDp = 360, heightDp = 640)
@Composable fun ComposerLoadingReview() {
    ZyraTheme(Appearance(mode = "dark")) { Surface { Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        val actions = ComposerActions({}, {}, {}, {}, {}, {})
        val state = MobileState(connection = ConnectionState.Connected, session = SessionView(id = "fixture"))
        Text("Ready", Modifier.padding(horizontal = 20.dp), style = MaterialTheme.typography.labelMedium)
        ChatComposerContent(state, AttachmentState(), actions, dictationEnabled = true)
        Text("Loading · draft available", Modifier.padding(horizontal = 20.dp), style = MaterialTheme.typography.labelMedium)
        ChatComposerContent(state.copy(busy = true), AttachmentState(), actions, dictationEnabled = true)
        ChatComposerContent(state.copy(busy = true, draft = "A draft written while loading"), AttachmentState(), actions, dictationEnabled = true)
        Text("Ready to send", Modifier.padding(horizontal = 20.dp), style = MaterialTheme.typography.labelMedium)
        ChatComposerContent(state.copy(draft = "A draft written while loading"), AttachmentState(), actions, dictationEnabled = true)
        TimelineMessage(TimelineItem("attachment", "user", "Check this picture\n\nAttached files (1):\n1. Pasted image [IMAGE]\nref: clipboard://fixture.png\nmime: image/png\nsize: 400 bytes")) {}
    } } }
}
