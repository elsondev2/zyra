package dev.zyra.mobile.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.zyra.mobile.R
import dev.zyra.mobile.data.ChatSearchMatch

@Composable fun SearchResultRow(match: ChatSearchMatch, query: String, click: () -> Unit) {
    Column(Modifier.fillMaxWidth().clickable(onClick = click).padding(horizontal = 12.dp, vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            AppIcon(R.drawable.ic_message_square, modifier = Modifier.size(17.dp))
            Text(match.chat.title, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            AppIcon(R.drawable.ic_chevron_right, "View matching message", Modifier.size(14.dp))
        }
        Text(highlightSearch(match.snippet, query), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 4, overflow = TextOverflow.Ellipsis)
        Text(if (match.role == "user") "Your message" else "Zyra’s reply", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
@Composable private fun highlightSearch(text: String, query: String): AnnotatedString {
    val color = MaterialTheme.colorScheme.primary.copy(alpha = .18f)
    return buildAnnotatedString {
        append(text)
        if (query.isNotBlank()) {
            var start = text.indexOf(query.trim(), ignoreCase = true)
            while (start >= 0) {
                addStyle(SpanStyle(background = color), start, (start + query.trim().length).coerceAtMost(text.length))
                start = text.indexOf(query.trim(), start + query.trim().length, ignoreCase = true)
            }
        }
    }
}
@Composable fun SearchContextScreen(state: MobileState, vm: MobileSession) {
    val match = state.searchSelection ?: return
    val list = rememberLazyListState()
    LaunchedEffect(state.searchContext) {
        val target = state.searchContext.indexOfFirst { it.id == match.messageId }
        if (target >= 0) list.scrollToItem(target)
    }
    Column(Modifier.fillMaxSize()) {
        if (state.searchContextBusy) LinearProgressIndicator(Modifier.fillMaxWidth())
        LazyColumn(Modifier.weight(1f), state = list, contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
            items(state.searchContext, key = { it.id }) { message ->
                if (message.id == match.messageId) Surface(shape = MaterialTheme.shapes.medium, border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = .5f))) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) { Text("Search match", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary); TimelineMessage(message) {} }
                } else TimelineMessage(message) {}
            }
            if (!state.searchContextBusy && state.searchContext.isEmpty()) item { TextButton(onClick = { vm.openSearchMatch(match) }) { Text("Try loading the message again") } }
        }
        ZyraButton(onClick = { vm.open(match.chat) }, modifier = Modifier.fillMaxWidth().padding(16.dp), shape = MaterialTheme.shapes.medium) { Text("Continue conversation") }
    }
}
