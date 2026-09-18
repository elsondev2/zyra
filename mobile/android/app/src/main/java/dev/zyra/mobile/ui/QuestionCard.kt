@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package dev.zyra.mobile.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import dev.zyra.mobile.data.QuestionSpec
import dev.zyra.mobile.data.TimelineItem
import org.json.JSONArray
import org.json.JSONObject

@Composable fun QuestionCard(item: TimelineItem, connected: Boolean, vm: MobileSession) {
    val questions = remember(item.raw) {
        runCatching {
            val array = JSONObject(item.raw).optJSONArray("questions") ?: JSONArray()
            (0 until array.length()).map { QuestionSpec.parse(array.getJSONObject(it)) }
        }.getOrDefault(emptyList())
    }
    val answers = remember(item.id) { mutableStateMapOf<String, List<String>>() }
    val touched = remember(item.id) { mutableStateMapOf<String, Boolean>() }
    val valid = questions.isNotEmpty() && questions.all { it.validate(answers[it.id].orEmpty()) == null }
    OutlinedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text("Zyra needs your answer", style = MaterialTheme.typography.titleMedium)
            if (questions.isEmpty()) Text("This question format could not be loaded. Reconnect to refresh it.")
            questions.forEach { question ->
                val selected = answers[question.id].orEmpty()
                val enabled = connected && item.pending
                fun change(values: List<String>) { answers[question.id] = values; touched[question.id] = true }
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(question.title, style = MaterialTheme.typography.titleSmall)
                    if (!question.required) Text("Optional", style = MaterialTheme.typography.labelSmall)
                    if (question.type == "ranking") {
                        val order = if (selected.isEmpty()) question.options.map { it.label } else selected
                        order.forEachIndexed { index, label -> Row(Modifier.fillMaxWidth()) {
                            Text((index + 1).toString() + ". " + label, Modifier.weight(1f).padding(top = 12.dp))
                            TextButton(enabled = enabled && index > 0, onClick = { change(order.toMutableList().apply { add(index - 1, removeAt(index)) }) }) { Text("Up") }
                            TextButton(enabled = enabled && index < order.lastIndex, onClick = { change(order.toMutableList().apply { add(index + 1, removeAt(index)) }) }) { Text("Down") }
                        } }
                        TextButton(enabled = enabled, onClick = { change(order) }) { Text("Use this order") }
                    } else question.options.forEach { option ->
                        val multi = question.type == "multi_select" || (question.type == "file_select" && question.multiple)
                        OutlinedCard(onClick = {
                            change(if (multi) if (option.label in selected) selected - option.label else selected + option.label else listOf(option.label))
                        }, enabled = enabled, modifier = Modifier.fillMaxWidth()) {
                            Row(Modifier.padding(14.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                                ZyraSelectionMark(option.label in selected)
                                Column(Modifier.weight(1f).padding(start = 8.dp)) {
                                    Text(option.label)
                                    if (option.recommended) Text("Recommended", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                                    if (option.description.isNotBlank()) Text(option.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                    }
                    if (question.type in listOf("text", "number", "date") || question.allowOther) {
                        val custom = selected.firstOrNull { value -> question.options.none { it.label == value } }.orEmpty()
                        ZyraTextField(value = custom, onValueChange = { value ->
                            change(if (question.type == "multi_select") selected.filter { old -> question.options.any { it.label == old } } + value else listOf(value))
                        }, enabled = enabled, modifier = Modifier.fillMaxWidth(), label = { Text(if (question.allowOther) "Another answer" else "Your answer") },
                            placeholder = { Text(question.placeholder.ifBlank { if (question.type == "date") "YYYY-MM-DD" else "" }) },
                            keyboardOptions = KeyboardOptions(keyboardType = if (question.type == "number") KeyboardType.Decimal else KeyboardType.Text))
                    }
                    if (touched[question.id] == true) question.validate(selected)?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                }
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ZyraButton(enabled = connected && item.pending && valid, onClick = { vm.answer(item.id, JSONObject().apply {
                    questions.forEach { question -> val values = answers[question.id].orEmpty().filter { it.isNotBlank() }; put(question.id, if (question.arrayAnswer) JSONArray(values) else values.firstOrNull().orEmpty()) }
                }) }) { Text("Send answers") }
                TextButton(enabled = connected && item.pending, onClick = { vm.answer(item.id, JSONObject(), true) }) { Text("Cancel") }
            }
        }
    }
}
