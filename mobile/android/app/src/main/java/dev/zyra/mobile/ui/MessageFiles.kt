package dev.zyra.mobile.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.zyra.mobile.R
import dev.zyra.mobile.data.MessageTextAttachment

@Composable fun MessageFiles(files: List<MessageTextAttachment>) {
    var selected by remember { mutableStateOf<MessageTextAttachment?>(null) }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        files.forEach { file ->
            Surface(onClick = { selected = file }, shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.surfaceContainerHigh) {
                Row(Modifier.widthIn(max = 240.dp).padding(horizontal = 10.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    DesktopFileIcon(file.name, modifier = Modifier.size(20.dp))
                    Text(file.name, Modifier.weight(1f, fill = false), style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    AppIcon(R.drawable.ic_chevron_right, "View attachment", Modifier.size(14.dp))
                }
            }
        }
    }
    selected?.let { file -> ZyraSheet(file.name, close = { selected = null }) {
        Column(Modifier.fillMaxWidth().weight(1f, fill = false).verticalScroll(rememberScrollState()).padding(16.dp)) {
            AttachmentTextContent(file.name, file.text)
        }
    } }
}

@Composable fun AttachmentTextContent(name: String, text: String) {
    val source = remember(name, text) {
        if (name.substringAfterLast('.').lowercase() in setOf("md", "markdown")) text
        else {
            val fence = "~".repeat(maxOf(3, Regex("~+").findAll(text).maxOfOrNull { it.value.length + 1 } ?: 3))
            fence + name.substringAfterLast('.') + "\n" + text + "\n" + fence
        }
    }
    Markdown(source)
}
