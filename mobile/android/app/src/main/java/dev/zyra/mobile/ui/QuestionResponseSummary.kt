package dev.zyra.mobile.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.zyra.mobile.R
import dev.zyra.mobile.data.QuestionAnswer

@Composable fun QuestionResponseSummary(answers: List<QuestionAnswer>) {
    if (answers.isEmpty()) return
    var open by rememberSaveable { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            AppIcon(R.drawable.ic_openai, modifier = Modifier.size(14.dp))
            Text("Answered agent question", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
        }
        Text(answers.first().question, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
        Text(answers.first().answer, style = MaterialTheme.typography.bodyMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
        TextButton(onClick = { open = true }, contentPadding = PaddingValues(0.dp)) {
            Text(if (answers.size == 1) "View answer" else "View ${answers.size} answers", style = MaterialTheme.typography.labelSmall)
            AppIcon(R.drawable.ic_chevron_right, modifier = Modifier.size(14.dp))
        }
    }
    if (open) ZyraSheet(if (answers.size == 1) "Your answer" else "Your answers", { open = false }) {
        answers.forEachIndexed { index, entry ->
            Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (answers.size > 1) Text("${index + 1}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                Markdown(entry.question)
                Surface(shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.surfaceContainer) {
                    Box(Modifier.padding(12.dp)) { Markdown(entry.answer, preserveLineBreaks = true) }
                }
            }
            if (index != answers.lastIndex) HorizontalDivider(Modifier.padding(horizontal = 20.dp))
        }
    }
}
