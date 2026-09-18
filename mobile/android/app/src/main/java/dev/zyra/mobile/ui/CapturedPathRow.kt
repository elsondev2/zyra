package dev.zyra.mobile.ui

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.zyra.mobile.R

@Composable fun CapturedPathRow(path: String, modifier: Modifier = Modifier) {
    var wrap by rememberSaveable(path) { mutableStateOf(false) }
    val scroll = key(path, wrap) { rememberScrollState(initial = Int.MAX_VALUE) }
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        SelectionContainer(Modifier.weight(1f).then(if (wrap) Modifier else Modifier.horizontalScroll(scroll))) {
            Text(path, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                softWrap = wrap, maxLines = if (wrap) Int.MAX_VALUE else 1)
        }
        IconToggleButton(wrap, { wrap = it }, Modifier.size(40.dp)) {
            AppIcon(R.drawable.ic_wrap_text, if (wrap) "Show path on one line" else "Wrap path", Modifier.size(18.dp))
        }
    }
}
