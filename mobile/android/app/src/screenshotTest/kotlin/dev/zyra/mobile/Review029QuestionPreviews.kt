package dev.zyra.mobile

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.android.tools.screenshot.PreviewTest
import dev.zyra.mobile.data.*
import dev.zyra.mobile.ui.*

@Composable private fun AnsweredQuestionFixture(light: Boolean) {
    ZyraTheme(Appearance(mode = if (light) "light" else "dark")) { Surface { Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
        Text("Answered questions", style = MaterialTheme.typography.titleLarge)
        TimelineMessage(TimelineItem("one", "user", "Here are my answers:\n\n- Restart: Not now"),
            questionAnswers = listOf(QuestionAnswer("May I rebuild the native app code and restart Zyra to apply and verify the fix? This will briefly interrupt the app.", "Not now"))) {}
        TimelineMessage(TimelineItem("many", "user", "Here are my answers:\n\n- Theme: Paper\n- Layout: Compact"),
            questionAnswers = listOf(QuestionAnswer("Which theme should be the default when the app first opens?", "Paper, with soft borders and a warm accent color"), QuestionAnswer("Which layout?", "Compact"))) {}
        TimelineMessage(TimelineItem("ordinary", "user", "Keep this ordinary message as it is.")) {}
    } } }
}
@PreviewTest @Preview(widthDp = 320, heightDp = 640, fontScale = 1.15f)
@Composable fun AnsweredQuestionDarkReview() = AnsweredQuestionFixture(false)
@PreviewTest @Preview(widthDp = 320, heightDp = 640, fontScale = 1.15f)
@Composable fun AnsweredQuestionLightReview() = AnsweredQuestionFixture(true)
