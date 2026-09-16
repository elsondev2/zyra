package dev.zyra.mobile.ui

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.text.*
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import dev.zyra.mobile.data.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@Composable fun highlightedCode(text: String, path: String): AnnotatedString {
    val dark = MaterialTheme.colorScheme.background.luminance() < .5f
    val preview = androidx.compose.ui.platform.LocalInspectionMode.current
    val tokens by produceState(initialValue = if (preview) CodeSyntax.tokens(text, path) else emptyList(), text, path) {
        value = withContext(Dispatchers.Default) { CodeSyntax.tokens(text, path) }
    }
    return remember(text, tokens, dark) {
        buildAnnotatedString {
            append(text)
            tokens.forEach { token ->
                val color = when (token.kind) {
                    CodeTokenKind.COMMENT -> if (dark) Color(0xff999999) else Color(0xff686868)
                    CodeTokenKind.STRING -> if (dark) Color(0xffa7e5ba) else Color(0xff176534)
                    CodeTokenKind.KEYWORD -> if (dark) Color(0xffd6b8fa) else Color(0xff74429b)
                    CodeTokenKind.NUMBER -> if (dark) Color(0xfff0c888) else Color(0xff8a5014)
                    CodeTokenKind.PROPERTY -> if (dark) Color(0xff9bd3ef) else Color(0xff236783)
                }
                if (token.end <= text.length) addStyle(SpanStyle(color = color), token.start, token.end)
            }
        }
    }
}

@Composable fun FileCodePreview(text: String, path: String, modifier: Modifier = Modifier, wrap: Boolean = true, initialLine: Int = 0) {
    val code = highlightedCode(text, path)
    val lines = remember(text) { buildList { add(0); text.forEachIndexed { i, c -> if (c == '\n') add(i + 1) } } }
    val horizontal = rememberScrollState()
    val list = key(path, initialLine) { rememberLazyListState(initialFirstVisibleItemIndex = (initialLine - 1).coerceIn(0, lines.lastIndex)) }
    SelectionContainer(modifier) {
        LazyColumn(Modifier.fillMaxSize().then(if (wrap) Modifier else Modifier.horizontalScroll(horizontal)), state = list, contentPadding = PaddingValues(vertical = 12.dp)) {
            items(lines.size) { index ->
                val start = lines[index]
                val end = (lines.getOrNull(index + 1)?.minus(1) ?: text.length).coerceAtLeast(start)
                Row(Modifier.then(if (wrap) Modifier.fillMaxWidth() else Modifier)
                    .then(if (initialLine == index + 1) Modifier.background(MaterialTheme.colorScheme.primary.copy(alpha = .09f)) else Modifier)
                    .padding(end = 12.dp)) {
                    androidx.compose.foundation.text.selection.DisableSelection {
                        Text((index + 1).toString(), Modifier.width((lines.size.toString().length * 9 + 24).dp).padding(end = 12.dp),
                            color = MaterialTheme.colorScheme.onSurfaceVariant, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodySmall,
                            textAlign = androidx.compose.ui.text.style.TextAlign.End)
                    }
                    Text(code.subSequence(start, end), Modifier.then(if (wrap) Modifier.weight(1f) else Modifier), fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodySmall, softWrap = wrap)
                }
            }
        }
    }
}
