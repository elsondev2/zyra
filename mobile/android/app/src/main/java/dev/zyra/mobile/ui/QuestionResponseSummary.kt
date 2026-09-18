package dev.zyra.mobile.ui

import androidx.compose.foundation.BorderStroke
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

@Composable fun QuestionResponseSummary(answers: List<QuestionAnswer>, modifier: Modifier = Modifier, media: @Composable () -> Unit = {}) {
    if (answers.isEmpty()) return
    var open by rememberSaveable(answers) { mutableStateOf(false) }
    Column(modifier, horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            AppIcon(R.drawable.ic_bot, modifier = Modifier.size(14.dp))
            Text(if (answers.size == 1) "Answered agent question" else "Answered ${answers.size} agent questions",
                style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Surface(onClick = { open = true }, shape = MaterialTheme.shapes.large, color = MaterialTheme.colorScheme.surfaceContainer,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = .5f))) {
            Column(Modifier.padding(horizontal = 14.dp, vertical = 10.dp)) {
                media()
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(answers.first().question, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(answers.first().answer, style = MaterialTheme.typography.bodyMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    }
                    AppIcon(R.drawable.ic_chevron_right, if (answers.size == 1) "View full answer" else "View all ${answers.size} answers", Modifier.size(14.dp))
                }
            }
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
