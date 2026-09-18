package dev.zyra.mobile

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.android.tools.screenshot.PreviewTest
import dev.zyra.mobile.data.*
import dev.zyra.mobile.ui.*
import dev.zyra.mobile.dictation.DictationState
import dev.zyra.mobile.voice.VoiceState

@PreviewTest @Preview(name = "Linked code line", widthDp = 320, heightDp = 480, fontScale = 1.1f)
@Composable fun FileLinkReview() {
    ZyraTheme(Appearance(mode = "light")) { Surface { Column(Modifier.fillMaxSize()) {
        Text("Linked code", Modifier.padding(16.dp), style = MaterialTheme.typography.titleLarge)
        FileCodePreview((1..100).joinToString("\n") { "val row$it = $it" }, "review.kt", Modifier.weight(1f), initialLine = 70)
    } } }
}

@PreviewTest @Preview(name = "Agent result", widthDp = 320, heightDp = 740, fontScale = 1.3f)
@Composable fun FleetResultReview() {
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    val controller = remember { FleetController(scope) }
    ZyraTheme(Appearance(mode = "light")) { Surface { FleetRunDetail(
        FleetState(selected = FleetRun("fixture", "Review mobile changes", "completed", "Check the chat loading and input transitions.", "gpt-5"),
            output = "## Review complete\n\nThe chat now keeps its scroll position while history loads.\n\n- **Checked** delayed history updates\n- **Verified** the input stays visible\n\nOne item needs a final check on your phone."),
        true, controller
    ) } }
}

@PreviewTest @Preview(name = "Authored Markdown image", widthDp = 320, heightDp = 740, fontScale = 1.1f)
@Composable fun MarkdownReview() {
    val context = androidx.compose.ui.platform.LocalContext.current
    val fixture = remember {
        java.io.File(context.cacheDir, "review-markdown-image.png").also { file ->
            context.resources.openRawResource(R.drawable.plugin_logo_test_android_apps).use { input ->
                file.outputStream().use { input.copyTo(it) }
            }
            check(file.length() > 8) { "Preview image fixture is empty" }
            val fromStream = file.inputStream().use { android.graphics.BitmapFactory.decodeStream(it) }
            check(fromStream != null) { "Preview image fixture cannot be decoded" }
            fromStream.recycle()
        }
    }
    ZyraTheme(Appearance(mode = "light")) { Surface { Column(Modifier.fillMaxSize().padding(20.dp)) {
        androidx.compose.runtime.CompositionLocalProvider(LocalMarkdownImage provides { image ->
            MarkdownImageCard(MarkdownDocument.imageAlt(image), if (image.destination == "preview.png") fixture else null,
                false, null, 900000L) {}
        }) {
            Markdown("## A clearer preview\n\nThe **image stays here**, between these paragraphs.\n\n![Project image](preview.png)\n\nThe response continues with `code` and a [link](https://example.com).\n\n![Larger image](large.png)\n\n- **Nested list** keeps its formatting\n  - A second level")
        }
    } } }
}

@PreviewTest @Preview(name = "Compact appearance", widthDp = 320, heightDp = 720, fontScale = 1.3f)
@Composable fun AppearanceReview() {
    var appearance by remember { mutableStateOf(Appearance(mode = "light")) }
    ZyraTheme(appearance) { Surface { AppearanceScreen(appearance) { appearance = it } } }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable private fun HeaderReview(mode: String) { ZyraTheme(Appearance(mode = mode)) { Surface { Box(Modifier.fillMaxSize()) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        repeat(3) { Text("Earlier conversation scrolls behind the header.", style = MaterialTheme.typography.bodyMedium) }
        val tool = TimelineItem("tool:review", "toolResult", "pwd\n/workspace", kind = "tool")
        TimelineWorkSummary(ChatRailRow.Work("review-work", listOf(tool), false, true, listOf(WorkActions.project(tool, null, null)), startedAt = 1000L, completedAt = 87000L), {})
        Text("The latest changes are ready to review.", style = MaterialTheme.typography.bodyLarge)
    }
    ChatHeaderSurface(true) {
        TopAppBar(title = { Column { Text("Improve the mobile experience", maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis, style = MaterialTheme.typography.titleLarge)
            Text("Zyra · My computer", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) } },
            navigationIcon = { IconButton({}) { AppIcon(R.drawable.ic_arrow_left, "Back") } },
            actions = { IconButton({}) { AppIcon(R.drawable.ic_sliders_horizontal, "Chat tools") } },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent))
    }
    Box(Modifier.align(Alignment.BottomCenter).padding(12.dp)) {
        ChatComposerContent(MobileState(connection = ConnectionState.Connected), AttachmentState(), ComposerActions({}, {}, {}, {}, {}, {}))
    }
} } } }
@PreviewTest @Preview(name = "Floating header light", widthDp = 320, heightDp = 640, fontScale = 1.1f)
@Composable fun HeaderReviewLight() = HeaderReview("light")
@PreviewTest @Preview(name = "Floating header dark", widthDp = 320, heightDp = 640, fontScale = 1.1f)
@Composable fun HeaderReviewDark() = HeaderReview("dark")

private val launcher = """${'$'}Root = Split-Path -Parent ${'$'}MyInvocation.MyCommand.Path
${'$'}Cli = Join-Path ${'$'}Root "bin\zyra.mjs"

node ${'$'}Cli @args
exit ${'$'}LASTEXITCODE
"""
@Composable private fun FileReview(mode: String) { ZyraTheme(Appearance(mode = mode)) { Surface { Column(Modifier.fillMaxSize()) {
    WorkspaceHeader("zyra.ps1", false, true, {}) {}
    WorkspaceFileContent(WorkspaceState(root = "fixture", file = WorkspaceFile("zyra.ps1", launcher, launcher, "hash", false, false, false, launcher.length.toLong(), "etag")), true, {}, {}, {}, {}, Modifier.weight(1f).padding(horizontal = 16.dp))
} } } }
@PreviewTest @Preview(name = "Compact file light", widthDp = 320, heightDp = 640, fontScale = 1.3f)
@Composable fun FileReviewLight() = FileReview("light")
@PreviewTest @Preview(name = "Compact file dark", widthDp = 360, heightDp = 640)
@Composable fun FileReviewDark() = FileReview("dark")

@PreviewTest @Preview(name = "Composer modes", widthDp = 320, heightDp = 640, fontScale = 1.15f)
@Composable fun ComposerReview() { ZyraTheme(Appearance(mode = "dark")) { Surface { Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
    Text("Input modes", Modifier.padding(20.dp), style = MaterialTheme.typography.titleLarge)
    val state = MobileState(connection = ConnectionState.Connected)
    val actions = ComposerActions({}, {}, {}, {}, {}, {})
    ChatComposerContent(state, AttachmentState(), actions)
    ChatComposerContent(state.copy(draft = "Can you check this change?"), AttachmentState(), actions, dictationEnabled = true)
    ChatComposerContent(state, AttachmentState(), actions, dictation = DictationState(phase = "recording", durationMs = 12000, levels = List(20) { .15f + (it % 5) * .16f }))
    ChatComposerContent(state, AttachmentState(), actions, voice = VoiceState(phase = "active"))
} } } }
@PreviewTest @Preview(name = "Wrapped changes", widthDp = 320, heightDp = 640, fontScale = 1.15f)
@Composable fun ChangesReview() { ZyraTheme(Appearance(mode = "light")) { Surface { Column(Modifier.fillMaxSize()) {
    WorkspaceHeader("app.ts", true, true, {}) {}
    WorkspaceGitContent(WorkspaceState(root = "fixture", git = true, branch = "feature/mobile", diffPath = "src/app.ts", gitWorkingCount = 3,
        diff = "@@ -1,2 +1,2 @@\n-export const greeting = 'Hello';\n+export const greeting = 'Welcome back. Your conversations are ready to continue.';\n start();"), true, WorkspaceGitActions({}, {}, {}, {}, {}), Modifier.weight(1f).padding(horizontal = 16.dp))
} } } }

@PreviewTest @Preview(name = "New conversation", widthDp = 360, heightDp = 740, fontScale = 1.1f)
@Composable fun NewConversationReview() { ZyraTheme(Appearance(mode = "light")) { Surface { Column(Modifier.fillMaxSize()) {
    NewChatTopBar("My computer", {}) {}
    NewChatWelcome("Zyra", null, false, null, {}, Modifier.weight(1f))
    ChatComposerContent(MobileState(connection = ConnectionState.Connected), AttachmentState(), ComposerActions({}, {}, {}, {}, {}, {}), allowUnboundControls = true)
} } } }

@PreviewTest @Preview(name = "Rendered editing", widthDp = 360, heightDp = 740, fontScale = 1.1f)
@Composable fun RenderedEditingReview() {
    var source by remember { mutableStateOf("# Project notes\n\nA **clearer editor** with a [project link](docs/guide.md).\n\n## Next steps\n\n- [x] Match desktop spacing\n- [ ] Review on your phone\n\n| Feature | Status |\n| --- | --- |\n| Files | Ready |\n\n> Keep the useful details.\n\n```kotlin\nval title = \"Welcome\"\n```\n") }
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    val controller = remember { WorkspaceController(scope) }
    val state = WorkspaceState(root = "fixture", file = WorkspaceFile("README.md", source, source, "hash", false, false, false, source.length.toLong(), "etag"))
    ZyraTheme(Appearance(mode = "light")) { Surface { Column(Modifier.fillMaxSize()) {
        WorkspaceHeader("README.md", false, true, {}, actions = { WorkspaceFileActions(state, controller, true) }) {}
        WorkspaceFileContent(state, true, { source = it }, {}, {}, {}, Modifier.weight(1f).padding(horizontal = 16.dp))
    } } }
}

@PreviewTest @Preview(name = "Markdown messages", widthDp = 360, heightDp = 740, fontScale = 1.1f)
@Composable fun MessageMarkdownReview() { ZyraTheme(Appearance(mode = "light")) { Surface { Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
    TimelineMessage(TimelineItem("user", "user", "Please check **this change**.\n\n- Keep the links\n- Format `code`\n\n[Read the guide](https://example.com)", kind = "message"), inspect = {})
    TimelineMessage(TimelineItem("assistant", "assistant", "## Changes are ready\n\nThe **spacing and links** match the rest of the app.\n\n1. Open the file\n2. Edit the rendered paragraph\n\n> Your original formatting is preserved.", kind = "message"), inspect = {})
} } } }

@PreviewTest @Preview(name = "Native diagram", widthDp = 360, heightDp = 640, fontScale = 1.1f)
@Composable fun NativeDiagramReview() {
    val picture = remember { diagramPicture(java.io.File("mobile/.state/mermaid-engine/flowchart.safe.svg").readText()) }
    ZyraTheme(Appearance(mode = "light")) { Surface { Column(Modifier.fillMaxSize().padding(20.dp)) {
        Text("Project flow", style = MaterialTheme.typography.titleLarge)
        Text("Rendered by the bundled diagram engine", Modifier.padding(vertical = 12.dp), style = MaterialTheme.typography.bodyMedium)
        DiagramPicture(picture, Modifier.fillMaxWidth().weight(1f))
    } } }
}

@PreviewTest @Preview(name = "Editable linked source", widthDp = 320, heightDp = 480, fontScale = 1.1f)
@Composable fun EditableFileLinkReview() {
    val code = (1..100).joinToString("\n") { "val row$it = $it" }
    ZyraTheme(Appearance(mode = "light")) { Surface { Column(Modifier.fillMaxSize()) {
        WorkspaceHeader("review.kt", false, true, {}) {}
        WorkspaceFileContent(WorkspaceState(root = "fixture", fileSource = true, file = WorkspaceFile("review.kt", code, code, "hash", false, false, false, code.length.toLong(), "etag", line = 70)), true, {}, {}, {}, {}, Modifier.weight(1f).padding(horizontal = 16.dp))
    } } }
}

@PreviewTest @Preview(name = "Turn review", widthDp = 360, heightDp = 640, fontScale = 1.1f)
@Composable fun TurnChangesReview() {
    val controller = remember {
        TurnReviewController(kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.Unconfined)).also { review ->
            review.bind { _, _ -> org.json.JSONObject("""{"turns":[{"id":"turn-2","number":2,"prompt":"Make the input easier to use","state":"completed","changes":[{"activityId":"a2","rootId":"fixture","path":"ui/ChatComposer.kt","kind":"modified","additions":18,"deletions":7},{"activityId":"a3","rootId":"fixture","path":"ui/VoiceWaveform.kt","kind":"modified","additions":24,"deletions":10}]},{"id":"turn-1","number":1,"prompt":"Keep the conversation in place while history loads","state":"completed","changes":[{"activityId":"a1","rootId":"fixture","path":"data/SessionHistory.kt","kind":"modified","additions":32,"deletions":12}]}]}""") }
            review.refresh()
        }
    }
    ZyraTheme(Appearance(mode = "light")) { Surface { Column(Modifier.fillMaxSize()) {
        WorkspaceHeader(null, true, true, {}, actions = { IconButton(controller::refresh) { AppIcon(R.drawable.ic_refresh_cw, "Refresh changes") } }) {}
        TurnReviewScreen(controller, Modifier.weight(1f).padding(horizontal = 16.dp))
    } } }
}

@PreviewTest @Preview(name = "Thinking and answers", widthDp = 360, heightDp = 640, fontScale = 1.1f)
@Composable fun ThinkingAnswersReview() {
    var effort by remember { mutableStateOf("high") }
    val answers = listOf(QuestionAnswer("Which theme should the app use?", "Paper, with soft borders"), QuestionAnswer("Which layout feels clearer?", "Compact"))
    ZyraTheme(Appearance(mode = "light")) { Surface { Column(Modifier.fillMaxSize().padding(vertical = 20.dp), verticalArrangement = Arrangement.spacedBy(24.dp)) {
        Text("Model controls", Modifier.padding(horizontal = 20.dp), style = MaterialTheme.typography.titleLarge)
        ThinkingSlider("gpt-5", listOf("low", "medium", "high", "xhigh"), effort, true) { _, value -> effort = value }
        Box(Modifier.padding(horizontal = 20.dp)) { TimelineMessage(TimelineItem("answer", "user", "Here are my answers"), questionAnswers = answers, inspect = {}) }
    } } }
}

@PreviewTest @Preview(name = "Work and pending answer", widthDp = 360, heightDp = 640, fontScale = 1.1f)
@Composable fun WorkQuestionReview() {
    val completed = ChatRailRow.Work("finished", emptyList(), false, true, emptyList(), 1000, 147000)
    val question = TimelineItem("q", "system", "Choose a theme", "user_input_requested", pending = true)
    val pending = ChatRailRow.Work("pending", listOf(question), true, false, emptyList(), System.currentTimeMillis() - 30000, null)
    var answer by remember { mutableStateOf("") }
    ZyraTheme(Appearance(mode = "light")) { Surface { Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(24.dp)) {
        TimelineWorkSummary(completed, {})
        TimelineWorkSummary(pending, {}, question = {
            Column(Modifier.fillMaxWidth().padding(vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Which theme should the app use?", style = MaterialTheme.typography.titleSmall)
                ZyraTextField(answer, { answer = it }, placeholder = { Text("Your answer") })
                ZyraButton({}, enabled = answer.isNotBlank()) { Text("Send answer") }
            }
        })
    } } }
}

@PreviewTest @Preview(name = "Composer row geometry", widthDp = 360, heightDp = 420, fontScale = 1.3f)
@Composable fun ComposerGeometryReview() { ZyraTheme(Appearance(mode = "light")) { Surface { Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(24.dp)) {
    listOf(false, true).forEach { expanded ->
        Surface(shape = androidx.compose.foundation.shape.RoundedCornerShape(28.dp), color = MaterialTheme.colorScheme.surfaceContainer) {
            ComposerInputLayout(expanded, leading = { IconButton({}) { AppIcon(R.drawable.ic_plus, "Attach") } },
                input = { Text("Review this change", Modifier.heightIn(min = 44.dp).padding(vertical = 11.dp), style = MaterialTheme.typography.bodyMedium) },
                trailing = { Row { IconButton({}) { AppIcon(R.drawable.ic_sliders_horizontal, "Controls") }; IconButton({}) { AppIcon(R.drawable.ic_arrow_up, "Send") } } })
        }
    }
} } } }

@PreviewTest @Preview(name = "Settings and limits", widthDp = 360, heightDp = 800, fontScale = 1.1f)
@Composable fun SettingsLimitsReview() {
    ZyraTheme(Appearance(mode = "light")) { Surface { Column(Modifier.fillMaxSize()) {
        Box(Modifier.weight(1f)) { SettingsContent({}, {}) }
        Box(Modifier.padding(20.dp)) { LimitsGroup(org.json.JSONObject("""{"label":"Codex","windows":[{"remainingPercent":67,"durationMinutes":300,"resetsAt":1790000000},{"remainingPercent":42,"durationMinutes":10080,"resetsAt":1790400000}]}""")) }
    } } }
}
@PreviewTest @Preview(name = "Turn detail", widthDp = 360, heightDp = 740, fontScale = 1.1f)
@Composable fun TurnDetailReview() {
    val controller = remember {
        val turn = org.json.JSONObject("""{"id":"turn","number":3,"prompt":"Make the input easier to use","response":"Updated the composer. **Controls stay aligned** as the keyboard opens.","state":"completed","changes":[{"activityId":"a","rootId":"fixture","path":"ui/ComposerInputLayout.kt","kind":"modified","additions":18,"deletions":7}]}""")
        TurnReviewController(kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.Unconfined)).also { review ->
            review.bind { method, _ -> if (method == "review.list") org.json.JSONObject().put("turns", org.json.JSONArray().put(turn)) else org.json.JSONObject().put("turn", turn) }
            review.refresh(); review.select(review.state.value.turns.first())
        }
    }
    ZyraTheme(Appearance(mode = "light")) { Surface { Column(Modifier.fillMaxSize().padding(20.dp)) {
        Text("Turn 3", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(bottom = 20.dp))
        TurnReviewScreen(controller, Modifier.weight(1f))
    } } }
}

@PreviewTest @Preview(name = "Thread details and review states", widthDp = 360, heightDp = 740, fontScale = 1.2f)
@Composable fun ThreadDetailsReview() {
    ZyraTheme(Appearance(mode = "light")) { Surface { Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
        Text("Thread details", style = MaterialTheme.typography.titleLarge)
        Text("GPT-5", style = MaterialTheme.typography.titleSmall)
        ThreadUsageSummary(org.json.JSONObject("""{"context":{"usedTokens":36400,"windowTokens":128000},"usage":{"inputTokens":24000,"outputTokens":3200,"cachedInputTokens":42000,"responses":14,"reportedResponses":0,"estimatedResponses":14,"estimatedCostUsd":0.0412,"unpricedResponses":0},"note":"API estimates do not represent subscription charges."}"""))
        HorizontalDivider()
        listOf("completed", "running", "failed").forEachIndexed { i, state -> TurnReviewMetadata(state, i + 1, i + 1) }
    } } }
}

@PreviewTest @Preview(name = "Grouped action sequence", widthDp = 360, heightDp = 640, fontScale = 1.1f)
@Composable fun GroupedActionReview() {
    val note = TimelineItem("note", "assistant", "I’ll check the files and verify the change.")
    val one = TimelineItem("tool:one", "tool", "bash\npassed", "tool", raw = """{"toolName":"bash","actionBatchIntent":"Verify the input layout"}""")
    val two = TimelineItem("tool:two", "tool", "read\nsource", "tool", raw = """{"toolName":"read","args":{"path":"src/Composer.kt"}}""")
    val blank = TimelineItem("call", "assistant", "", toolNames = listOf("read"))
    val work = ChatRailRow.Work("work", listOf(note, one, blank, two), true, false, listOf(WorkActions.project(one), WorkActions.project(two)), System.currentTimeMillis() - 83000)
    ZyraTheme(Appearance(mode = "light")) { Surface { Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
        Text("Review input layout", style = MaterialTheme.typography.titleLarge)
        TimelineWorkSummary(work, {})
    } } }
}

@PreviewTest @Preview(name = "Folder search", widthDp = 320, heightDp = 640, fontScale = 1.2f)
@Composable fun FolderSearchReview() {
    val controller = remember {
        WorkspaceController(kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.Unconfined)).also { workspace ->
            workspace.open { method, _ -> if (method == "workspace.roots") org.json.JSONObject("""{"roots":[{"id":"root","label":"Project"}]}""") else org.json.JSONObject("""{"entries":[{"name":"ChatComposer.kt","path":"ChatComposer.kt","directory":false}],"nextOffset":null}""") }
            workspace.fileSearch(true)
        }
    }
    ZyraTheme(Appearance(mode = "light")) { Surface { Column(Modifier.fillMaxSize()) {
        WorkspaceTopBar(controller, true, {})
        WorkspaceScreen(controller, true)
    } } }
}

@PreviewTest @Preview(name = "Camera composer and image tiles", widthDp = 360, heightDp = 740, fontScale = 1.1f)
@Composable fun CameraComposerReview() {
    val context = androidx.compose.ui.platform.LocalContext.current
    val fixture = remember {
        java.io.File(context.cacheDir, "review-markdown-image.png").also { file -> context.resources.openRawResource(R.drawable.plugin_logo_test_android_apps).use { input -> file.outputStream().use { input.copyTo(it) } } }
    }
    ZyraTheme(Appearance(mode = "light")) { Surface { Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text("Review the mobile layout", Modifier.padding(20.dp), style = MaterialTheme.typography.titleLarge)
        Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp), horizontalArrangement = Arrangement.End) {
            Surface(shape = androidx.compose.foundation.shape.RoundedCornerShape(20.dp), color = MaterialTheme.colorScheme.surfaceContainer) {
                Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    MessageImageTile(fixture)
                    Text("Does this look right?", style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
        Spacer(Modifier.weight(1f))
        ChatComposerContent(MobileState(draft = "Review this", connection = ConnectionState.Connected), AttachmentState(),
            ComposerActions({}, {}, {}, {}, {}, {}), cameraVisible = true,
            cameraContent = { CameraPanel { Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("Camera preview", color = Color.White) } } })
    } } }
}

@PreviewTest @Preview(name = "Usage by model", widthDp = 320, heightDp = 740, fontScale = 1.2f)
@Composable fun UsageReview() {
    val record = org.json.JSONObject("""{"harness":"zyra","model":"gpt-5.4","responses":27,"totalTokens":459230,"inputTokens":141000,"outputTokens":18300,"cachedInputTokens":299930,"reportedResponses":0,"estimatedResponses":27,"unpricedResponses":0,"estimatedCostUsd":0.7565}""")
    val result = org.json.JSONObject().put("totals", record).put("models", org.json.JSONArray().put(record)).put("note", "API estimates do not represent subscription charges.")
    val daily = org.json.JSONArray()
    val amounts = listOf(0, 9000, 13000, 4000, 17000, 22000, 6000, 8000, 18000, 33000, 28000, 10000, 0, 14000, 9000, 25000, 7000, 18000, 39000, 11000, 17000, 8000, 21000, 32000, 12000, 26000, 34000, 0, 13000, 5230)
    amounts.forEachIndexed { index, amount -> daily.put(org.json.JSONObject().put("date", java.time.LocalDate.of(2026, 8, 17).plusDays(index.toLong()).toString()).put("totalTokens", amount).put("responses", if (amount > 0) 1 else 0).put("estimatedResponses", if (amount > 0) 1 else 0).put("estimatedCostUsd", amount * .7565 / 459230)) }
    result.put("daily", daily)
    ZyraTheme(Appearance(mode = "light")) { Surface { Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text("Usage", style = MaterialTheme.typography.titleLarge)
        UsageContent(result)
    } } }
}

@PreviewTest @Preview(name = "Quota boundaries", widthDp = 320, heightDp = 620, fontScale = 1.3f)
@Composable fun LimitBoundariesReview() {
    ZyraTheme(Appearance(mode = "dark")) { Surface { Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text("Limits", style = MaterialTheme.typography.titleLarge)
        LimitsGroup(org.json.JSONObject("""{"label":"Codex","windows":[{"remainingPercent":0,"durationMinutes":300},{"remainingPercent":100,"durationMinutes":10080},{"durationMinutes":60}]}"""))
    } } }
}

@PreviewTest @Preview(name = "Usage selectors", widthDp = 320, heightDp = 740, fontScale = 1.2f)
@Composable fun UsageSelectorsReview() {
    val machine = dev.zyra.mobile.data.Machine("preview", "phone", "A long desktop computer name", "https://example.invalid", "", "")
    val state = MobileState(machine = machine, machines = listOf(machine, machine.copy(id = "second", name = "Second computer")), connection = ConnectionState.Connected,
        machineStatus = mapOf(machine.id to ConnectionState.Connected))
    val result = org.json.JSONObject("""{"totals":{"responses":0},"models":[],"note":"API estimates do not represent subscription charges."}""")
    ZyraTheme(Appearance(mode = "light")) { Surface { Column(Modifier.fillMaxSize()) {
        Text("Usage", Modifier.padding(20.dp), style = MaterialTheme.typography.titleLarge)
        UsageScreen(state) { _, _ -> result }
    } } }
}

@PreviewTest @Preview(name = "Question composer", widthDp = 360, heightDp = 740, fontScale = 1.1f)
@Composable fun QuestionComposerReview() {
    val question = TimelineItem("question-review", "system", "", "user_input_requested", pending = true,
        raw = """{"questions":[{"id":"direction","question":"Which version should we build first?","type":"single_select","options":[{"label":"Android","description":"Continue with the native phone experience."},{"label":"Desktop","description":"Polish the existing desktop client."}],"allowOther":true},{"id":"notes","question":"Anything else?","type":"text","required":false}]}""")
    ZyraTheme(Appearance(mode = "light")) { Surface { Column(Modifier.fillMaxSize()) {
        Text("Review the next step", Modifier.padding(20.dp), style = MaterialTheme.typography.titleLarge)
        Text("I have a quick question before continuing.", Modifier.padding(20.dp), style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.weight(1f))
        ChatComposerContent(MobileState(draft = "An unsent draft", connection = ConnectionState.Connected), AttachmentState(), ComposerActions({}, {}, {}, {}, {}, {}),
            questionVisible = true, questionContent = { QuestionComposer(question, true, false, { _, _, _ -> }) })
    } } }
}
@PreviewTest @Preview(name = "Full chat settings", widthDp = 360, heightDp = 800, fontScale = 1.1f)
@Composable fun FullChatSettingsReview() {
    ZyraTheme(Appearance(mode = "light")) { Surface { Column(Modifier.fillMaxSize()) {
        Text("Chat settings", Modifier.padding(20.dp), style = MaterialTheme.typography.titleLarge)
        Column(Modifier.padding(20.dp)) { ThreadUsageSummary(org.json.JSONObject("""{"context":{"usedTokens":32730,"windowTokens":1050000},"usage":{"totalTokens":932974,"inputTokens":185569,"cachedInputTokens":744492,"outputTokens":2913,"responses":6,"reportedCostUsd":2.7455,"reportedResponses":6}}""")) }
        ChatSettingsContent(ChatConfiguration(model = "openai-codex/gpt-6-astra"), ChatPreferencesState(loaded = true, profile = "concise", memoryMode = "enabled"), true, {}, {}, {}, {}, { _, _ -> }, chooseProfile = {})
        HorizontalDivider(Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
        ZyraSettingRow(R.drawable.ic_refresh_cw, "Refresh conversation", click = {})
        ZyraSettingRow(R.drawable.ic_square_pen, "Regenerate title", click = {})
        ZyraSettingRow(R.drawable.ic_archive, "Compact context", click = {})
    } } }
}
@PreviewTest @Preview(name = "Usage and account limits", widthDp = 360, heightDp = 900, fontScale = 1.1f)
@Composable fun CombinedUsageReview() {
    val record = org.json.JSONObject("""{"responses":27,"totalTokens":459230,"estimatedResponses":27,"estimatedCostUsd":0.7565}""")
    val daily = org.json.JSONArray()
    repeat(30) { day -> daily.put(org.json.JSONObject().put("date", java.time.LocalDate.of(2026, 8, 17).plusDays(day.toLong()).toString()).put("totalTokens", (day % 7 + 1) * 2100).put("responses", 1)) }
    val result = org.json.JSONObject().put("totals", record).put("daily", daily)
    val limits = org.json.JSONObject("""{"groups":[{"label":"Codex","windows":[{"remainingPercent":67,"durationMinutes":300,"resetsAt":1790000000},{"remainingPercent":82,"durationMinutes":10080,"resetsAt":1790400000}]}]}""")
    ZyraTheme(Appearance(mode = "light")) { Surface { Column(Modifier.fillMaxSize().padding(horizontal = 20.dp)) {
        Text("Usage & limits", Modifier.padding(vertical = 20.dp), style = MaterialTheme.typography.titleLarge)
        UsageContent(result, header = { AccountLimitsOverview(limits, false, null) })
    } } }
}
