package dev.zyra.mobile.ui

import android.graphics.RuntimeShader
import android.os.Build
import androidx.annotation.RequiresApi
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import dev.zyra.mobile.voice.VoiceChoice
import dev.zyra.mobile.voice.VoiceActivity
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlin.math.*

@Composable fun VoiceOrb(choice: VoiceChoice, active: Boolean, modifier: Modifier = Modifier, activity: VoiceActivity? = null) {
    val reduced = LocalReduceMotion.current
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val time = remember { mutableFloatStateOf(0f) }
    val energy = remember { mutableFloatStateOf(0f) }
    LaunchedEffect(active, reduced, lifecycle, activity) {
        energy.floatValue = 0f
        if (!reduced) lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            val step = if (active) 50L else 125L
            while (isActive) {
                delay(step)
                time.floatValue += step / 1000f * (if (active) .41f else .173f)
                energy.floatValue = VoiceActivity.smooth(energy.floatValue, if (active) activity?.level() ?: 0f else 0f, step)
            }
        }
    }
    if (Build.VERSION.SDK_INT >= 33) ShaderOrb(choice, active, time, modifier, energy)
    else StrandFallback(choice, active, time, modifier, energy)
}

@RequiresApi(33)
@Composable private fun ShaderOrb(choice: VoiceChoice, active: Boolean, time: State<Float>, modifier: Modifier, energy: State<Float>) {
    val shader = remember { RuntimeShader(VOICE_ORB_SHADER) }
    val brush = remember(shader) { ShaderBrush(shader) }
    Canvas(modifier) {
        shader.setFloatUniform("resolution", size.width, size.height)
        shader.setFloatUniform("time", time.value)
        shader.setFloatUniform("energy", (if (active) .04f else .018f) + energy.value * .65f)
        shader.setFloatUniform("active", if (active) 1f else 0f)
        shader.setFloatUniform("frequency", choice.frequency)
        shader.setFloatUniform("phase", choice.phase)
        listOf("primary" to choice.primary, "secondary" to choice.secondary, "highlight" to choice.highlight).forEach { (name, value) ->
            val color = Color(value); shader.setFloatUniform(name, color.red, color.green, color.blue)
        }
        drawRect(brush)
    }
}

/** Older Android uses the same strand geometry with bounded native paths. */
@Composable internal fun StrandFallback(choice: VoiceChoice, active: Boolean, time: State<Float>, modifier: Modifier, energy: State<Float> = remember { mutableFloatStateOf(0f) }) {
    Canvas(modifier) {
        val r = size.minDimension * .4416f
        drawCircle(Color(choice.primary).copy(alpha = .045f), r)
        val colors = listOf(Color(choice.secondary), Color(choice.highlight), Color(choice.primary))
        for (i in 0..2) {
            val path = Path()
            for (n in 0..80) {
                val x = (n / 80f - .5f) * 2 * r
                val uv = x / size.height / 1.3f
                val env = max(cos(uv * PI.toFloat() * 1.3f), 0f).pow(3)
                val ph = i * 1.7f * 2.4f; val freq = (2f + i * .35f) * choice.frequency; val spd = 1.4f + i * 1.2f
                val w = sin(uv * freq + time.value * spd + ph) * .6f + sin(uv * freq * 1.1f - time.value * spd * .7f + ph * 1.7f) * .4f
                val y = -w * .11f * env * ((if (active) .782f else .748f) + energy.value * 1.0f) * size.height * 1.3f
                if (n == 0) path.moveTo(center.x + x, center.y + y) else path.lineTo(center.x + x, center.y + y)
            }
            drawPath(path, colors[i].copy(alpha = .08f), style = Stroke(size.minDimension * .085f))
            drawPath(path, colors[i].copy(alpha = .8f), style = Stroke(size.minDimension * .018f))
        }
        drawCircle(Brush.linearGradient(listOf(Color.White.copy(alpha = .28f), Color.Transparent, Color.White.copy(alpha = .1f)), Offset.Zero, Offset(size.width, size.height)), r, style = Stroke(1f))
    }
}
