package dev.zyra.mobile.ui

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.zyra.mobile.R
import dev.zyra.mobile.data.*

data class WorkspaceGitActions(val refresh: ()->Unit,val search:(String)->Unit,val mode:(Boolean)->Unit,val review:(GitChange)->Unit,val more:()->Unit,val options:()->Unit = {})
@Composable fun WorkspaceGitContent(state: WorkspaceState,connected: Boolean,actions: WorkspaceGitActions,modifier: Modifier=Modifier) {
    val clipboard=LocalClipboardManager.current
    var modes by remember { mutableStateOf(false) }
    val wrap = state.fileWrap
    Column(modifier.fillMaxSize(),verticalArrangement=Arrangement.spacedBy(8.dp)) {
        if(!state.repository && !state.busy) {
            Text("No Git repository in this folder",style=MaterialTheme.typography.titleMedium)
            Text("Choose a folder that belongs to a repository.",style=MaterialTheme.typography.bodyMedium,color=MaterialTheme.colorScheme.onSurfaceVariant)
            return@Column
        }
        if(state.diff!=null) {
            if(state.diffPath.contains('/')) Text(state.diffPath.substringBeforeLast('/'),style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
            if(state.diffTruncated) Text("This is a limited preview of a large diff. View the complete change on your PC.",style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.error)
            GitDiffContent(state.diff,state.diffPath.isNotBlank(),Modifier.weight(1f),wrap)
        } else {
            if (state.gitTotal > 0 || state.gitQuery.isNotBlank()) ZyraSearchField(state.gitQuery,actions.search,"Find a changed file",Modifier.fillMaxWidth())
            LazyColumn(Modifier.weight(1f),contentPadding=PaddingValues(bottom=24.dp)) {
                if(state.changes.isEmpty() && !state.busy) item {
                    Text(if(state.gitQuery.isNotBlank()) "No matching files" else if(state.staged) "Nothing staged" else "No working changes",Modifier.padding(vertical=24.dp),style=MaterialTheme.typography.bodyMedium,color=MaterialTheme.colorScheme.onSurfaceVariant)
                }
                items(state.changes,key={it.path}) { change ->
                    Surface(onClick={actions.review(change)},enabled=connected && !state.busy,color=Color.Transparent) {
                        Row(Modifier.fillMaxWidth().padding(vertical=13.dp),horizontalArrangement=Arrangement.spacedBy(12.dp),verticalAlignment=Alignment.CenterVertically) {
                            DesktopFileIcon(change.path, modifier=Modifier.size(24.dp))
                            Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(3.dp)) {
                                Text(change.path.substringAfterLast('/'),style=MaterialTheme.typography.titleSmall)
                                val location=change.oldPath.takeIf {it.isNotBlank()}?.let {"$it → ${change.path}"} ?: change.path.substringBeforeLast('/',"")
                                if(location.isNotBlank()) Text(location,style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant,maxLines=2,overflow=TextOverflow.Ellipsis)
                            }
                            Text(change.status(state.staged),style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
                            AppIcon(R.drawable.ic_chevron_right,modifier=Modifier.size(16.dp))
                        }
                    }
                    HorizontalDivider(color=MaterialTheme.colorScheme.outlineVariant.copy(alpha=.5f))
                }
                if(state.gitNextOffset!=null) item {TextButton(actions.more,enabled=connected && !state.busy,modifier=Modifier.fillMaxWidth()) {Text("Load more · ${state.changes.size} of ${state.gitMatchCount}")}}
            }
        }
    }
}

@Composable fun GitDiffContent(diff: String,singleFile: Boolean,modifier: Modifier=Modifier,wrap: Boolean=true) {
    val rows=remember(diff,singleFile) {gitDiffRows(diff).filter {!(singleFile && it.kind==GitDiffKind.FILE)}}
    val dark=MaterialTheme.colorScheme.background.luminance()<.5f
    val added=if(dark) Color(0xffa7e5ba) else Color(0xff176534)
    val removed=if(dark) Color(0xffffb3bd) else Color(0xffa51d34)
    if(diff.isBlank()) {Text("No changes in this view.",modifier.padding(vertical=20.dp),color=MaterialTheme.colorScheme.onSurfaceVariant);return}
    val horizontal=rememberScrollState()
    SelectionContainer(modifier) {
        LazyColumn(Modifier.fillMaxSize().then(if (wrap) Modifier else Modifier.horizontalScroll(horizontal))) {
            items(rows) { row ->
                val color=when(row.kind) {GitDiffKind.ADD->added;GitDiffKind.REMOVE->removed;else->MaterialTheme.colorScheme.onSurface}
                val background=when(row.kind) {GitDiffKind.ADD->added.copy(alpha=.09f);GitDiffKind.REMOVE->removed.copy(alpha=.09f);GitDiffKind.HUNK->MaterialTheme.colorScheme.surfaceContainer;else->Color.Transparent}
                if(row.kind in setOf(GitDiffKind.FILE,GitDiffKind.HUNK,GitDiffKind.NOTE)) {
                    Text(row.text,Modifier.background(background).padding(horizontal=10.dp,vertical=8.dp),fontFamily=FontFamily.Monospace,style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant,softWrap=wrap)
                } else Row(Modifier.then(if (wrap) Modifier.fillMaxWidth() else Modifier).background(background).padding(vertical=2.dp),verticalAlignment=Alignment.Top) {
                    Text((row.before?.toString() ?: "").padStart(4),Modifier.widthIn(min=38.dp),fontFamily=FontFamily.Monospace,style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
                    Text((row.after?.toString() ?: "").padStart(4),Modifier.widthIn(min=38.dp),fontFamily=FontFamily.Monospace,style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(when(row.kind) {GitDiffKind.ADD->"+";GitDiffKind.REMOVE->"−";else->" "},Modifier.width(18.dp),fontFamily=FontFamily.Monospace,style=MaterialTheme.typography.bodySmall,color=color)
                    Text(row.text,Modifier.then(if (wrap) Modifier.weight(1f) else Modifier).padding(end=12.dp),fontFamily=FontFamily.Monospace,style=MaterialTheme.typography.bodySmall,color=color,softWrap=wrap)
                }
            }
        }
    }
}

