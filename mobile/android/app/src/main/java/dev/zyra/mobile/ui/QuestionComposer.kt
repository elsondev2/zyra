package dev.zyra.mobile.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import dev.zyra.mobile.R
import dev.zyra.mobile.data.QuestionForm
import dev.zyra.mobile.data.QuestionSpec
import dev.zyra.mobile.data.TimelineItem
import org.json.JSONObject

@Composable fun QuestionComposer(item: TimelineItem, connected: Boolean, submitting: Boolean,
    answer: (String, JSONObject, Boolean) -> Unit, voiceControls: (@Composable () -> Unit)? = null) {
    val questions = remember(item.raw) { QuestionForm.questions(item.raw) }
    var serialized by rememberSaveable(item.id) { mutableStateOf("{}") }
    var index by rememberSaveable(item.id) { mutableIntStateOf(0) }
    val currentIndex = index.coerceIn(0, (questions.size - 1).coerceAtLeast(0))
    val question = questions.getOrNull(currentIndex)
    val enabled = connected && item.pending && !submitting
    val valid = remember(questions, serialized) { QuestionForm.valid(questions, serialized) }
    val maximumHeight = (LocalConfiguration.current.screenHeightDp * .56f).coerceAtLeast(180f).dp
    Column(Modifier.fillMaxWidth().heightIn(max = maximumHeight).padding(horizontal = 16.dp, vertical = 8.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            AppIcon(R.drawable.ic_openai, modifier = Modifier.size(20.dp))
            Text("Your answer", Modifier.weight(1f).padding(start = 10.dp), style = MaterialTheme.typography.titleSmall)
            if (questions.size > 1) Text("${currentIndex + 1} / ${questions.size}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            IconButton(enabled = enabled, onClick = { answer(item.id, JSONObject(), true) }, modifier = Modifier.size(40.dp)) { AppIcon(R.drawable.ic_x, "Cancel question", Modifier.size(18.dp)) }
        }
        if (voiceControls != null) voiceControls()
        key(item.id, currentIndex) {
            Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()).padding(vertical = 6.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (question == null) Text("Could not load this question. Reconnect to refresh it.", style = MaterialTheme.typography.bodySmall)
                else QuestionField(question, QuestionForm.values(serialized, question.id), enabled) { values ->
                    serialized = QuestionForm.change(serialized, question.id, values)
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (currentIndex > 0) IconButton(onClick = { index = currentIndex - 1 }, enabled = !submitting) { AppIcon(R.drawable.ic_arrow_left, "Previous question") }
            if (!connected) Text("Reconnect to send", Modifier.weight(1f), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            else Spacer(Modifier.weight(1f))
            if (currentIndex < questions.lastIndex) ZyraButton(enabled = enabled && question?.validate(QuestionForm.values(serialized, question.id)) == null,
                onClick = { index = currentIndex + 1 }) { Text("Next"); AppIcon(R.drawable.ic_chevron_right, modifier = Modifier.size(16.dp)) }
            else ZyraButton(enabled = enabled && valid, onClick = { answer(item.id, QuestionForm.response(questions, serialized), false) }) {
                if (submitting) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp) else AppIcon(R.drawable.ic_arrow_up, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp)); Text(if (submitting) "Sending" else "Send answer")
            }
        }
    }
}

@Composable private fun QuestionField(question: QuestionSpec, selected: List<String>, enabled: Boolean, change: (List<String>) -> Unit) {
    var touched by remember(question.id) { mutableStateOf(false) }
    fun update(values: List<String>) { touched = true; change(values) }
    Text(question.title, style = MaterialTheme.typography.bodyMedium)
    if (!question.required) Text("Optional", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    if (question.type == "ranking") {
        val order = selected.ifEmpty { question.options.map { it.label } }
        order.forEachIndexed { index, label -> Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("${index + 1}. $label", Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
            IconButton(enabled = enabled && index > 0, onClick = { update(order.toMutableList().apply { add(index - 1, removeAt(index)) }) }) { AppIcon(R.drawable.ic_arrow_up, "Move up", Modifier.size(18.dp)) }
            IconButton(enabled = enabled && index < order.lastIndex, onClick = { update(order.toMutableList().apply { add(index + 1, removeAt(index)) }) }) { AppIcon(R.drawable.ic_arrow_down, "Move down", Modifier.size(18.dp)) }
        } }
        TextButton(enabled = enabled, onClick = { update(order) }) { Text("Use this order") }
    } else question.options.forEach { option ->
        val multi = question.type == "multi_select" || question.type == "file_select" && question.multiple
        Surface(onClick = { update(if (multi) if (option.label in selected) selected - option.label else selected + option.label else listOf(option.label)) },
            enabled = enabled, shape = MaterialTheme.shapes.medium, color = if (option.label in selected) MaterialTheme.colorScheme.primary.copy(alpha = .10f) else MaterialTheme.colorScheme.surfaceContainerHigh,
            modifier = Modifier.fillMaxWidth()) {
            Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                ZyraSelectionMark(option.label in selected)
                Column(Modifier.weight(1f)) {
                    Text(option.label, style = MaterialTheme.typography.bodyMedium)
                    if (option.description.isNotBlank()) Text(option.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
    if (question.type in listOf("text", "number", "date") || question.allowOther) {
        val custom = selected.firstOrNull { value -> question.options.none { it.label == value } }.orEmpty()
        ZyraTextField(value = custom, onValueChange = { value ->
            update(if (question.type == "multi_select") selected.filter { old -> question.options.any { it.label == old } } + value else listOf(value))
        }, enabled = enabled, modifier = Modifier.fillMaxWidth(), label = { Text(if (question.allowOther) "Another answer" else "Your answer") },
            placeholder = { Text(question.placeholder.ifBlank { if (question.type == "date") "YYYY-MM-DD" else "" }) },
            keyboardOptions = KeyboardOptions(keyboardType = if (question.type == "number") KeyboardType.Decimal else KeyboardType.Text))
    }
    if (touched) question.validate(selected)?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
}
