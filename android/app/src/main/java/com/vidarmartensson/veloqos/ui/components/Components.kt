package com.vidarmartensson.veloqos.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import com.vidarmartensson.veloqos.ui.theme.Veloq
import com.vidarmartensson.veloqos.ui.theme.VeloqType
import androidx.compose.foundation.Canvas
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path

/** Surface card with a 1dp line border – borders, not shadows. */
@Composable
fun VCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier
            .fillMaxWidth()
            .clip(Veloq.RadiusLg)
            .background(Veloq.Surface)
            .border(1.dp, Veloq.Line, Veloq.RadiusLg)
            .padding(horizontal = 20.dp, vertical = 18.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        content = content,
    )
}

@Composable
fun CardHead(label: String, trailing: String? = null, onTrailing: (() -> Unit)? = null) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        Label(label)
        if (trailing != null) {
            Text(
                trailing,
                style = VeloqType.Meta,
                modifier = if (onTrailing != null) Modifier.clip(Veloq.Pill).clickable(onClick = onTrailing).padding(vertical = 8.dp) else Modifier,
            )
        }
    }
}

@Composable
fun Label(text: String, accent: Boolean = false) =
    Text(text.uppercase(), style = VeloqType.Label.copy(color = if (accent) Veloq.Accent else Veloq.InkMuted))

@Composable
fun Pill(text: String) {
    Text(
        text.uppercase(),
        style = VeloqType.Pill,
        modifier = Modifier.border(1.dp, Veloq.LineStrong, Veloq.Pill).padding(horizontal = 10.dp, vertical = 5.dp),
    )
}

/** Press feedback: scale 0.97 with a spring, the web's :active. */
@Composable
private fun pressScale(source: MutableInteractionSource): Float {
    val pressed by source.collectIsPressedAsState()
    return animateFloatAsState(if (pressed) 0.96f else 1f, Veloq.springy(), label = "press").value
}

@Composable
fun PrimaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    val source = remember { MutableInteractionSource() }
    Box(
        modifier
            .scale(pressScale(source))
            .heightIn(min = 52.dp)
            .clip(Veloq.Pill)
            .background(if (enabled) Veloq.Accent else Veloq.LineStrong)
            .clickable(source, null, enabled = enabled, role = Role.Button, onClick = onClick)
            .padding(horizontal = 22.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, style = VeloqType.Button.copy(color = Veloq.OnAccent))
    }
}

@Composable
fun GhostButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, leading: (@Composable RowScope.() -> Unit)? = null) {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val border by animateColorAsState(if (pressed) Veloq.Accent else Veloq.LineStrong, label = "ghost-border")
    Row(
        modifier
            .scale(pressScale(source))
            .heightIn(min = 48.dp)
            .clip(Veloq.Pill)
            .border(1.dp, border, Veloq.Pill)
            .clickable(source, null, role = Role.Button, onClick = onClick)
            .padding(horizontal = 18.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
    ) {
        leading?.invoke(this)
        Text(text, style = VeloqType.BodyStrong)
    }
}

/** Round send button with the Veloq arrow. */
@Composable
fun SendButton(onClick: () -> Unit, description: String = "Skicka") {
    val source = remember { MutableInteractionSource() }
    Box(
        Modifier
            .scale(pressScale(source))
            .size(52.dp)
            .clip(CircleShape)
            .background(Veloq.Accent)
            .clickable(source, null, role = Role.Button, onClick = onClick)
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) { Arrow(Veloq.OnAccent) }
}

@Composable
fun Arrow(color: Color, size: Int = 20) {
    Canvas(Modifier.size(size.dp)) {
        val s = this.size.width / 24f
        val stroke = Stroke(width = 2.2f * s, cap = StrokeCap.Round)
        drawPath(
            Path().apply {
                moveTo(5 * s, 12 * s); lineTo(19 * s, 12 * s)
                moveTo(13 * s, 6 * s); lineTo(19 * s, 12 * s); lineTo(13 * s, 18 * s)
            },
            color,
            style = stroke,
        )
    }
}

@Composable
fun Toggle(on: Boolean, description: String, onChange: (Boolean) -> Unit) {
    val knob by animateDpAsState(if (on) 22.dp else 0.dp, Veloq.springy(), label = "knob")
    val track by animateColorAsState(if (on) Veloq.Accent else Veloq.Bg, label = "track")
    Box(
        Modifier
            .size(width = 52.dp, height = 30.dp)
            .clip(Veloq.Pill)
            .background(track)
            .border(1.dp, if (on) Veloq.Accent else Veloq.LineStrong, Veloq.Pill)
            .clickable(role = Role.Switch) { onChange(!on) }
            .semantics {
                contentDescription = description
                stateDescription = if (on) "På" else "Av"
            },
    ) {
        Box(
            Modifier
                .offset(x = 3.dp + knob, y = 3.dp)
                .size(22.dp)
                .clip(CircleShape)
                .background(if (on) Veloq.OnAccent else Veloq.InkMuted),
        )
    }
}

/** The pulsing accent dot for "running now". */
@Composable
fun LiveDot() {
    val t = rememberInfiniteTransition(label = "live")
    val a by t.animateFloat(0.35f, 1f, infiniteRepeatable(tween(700), RepeatMode.Reverse), label = "live-alpha")
    Box(Modifier.size(8.dp).alpha(a).clip(CircleShape).background(Veloq.Accent))
}

@Composable
fun ProgressLine(progress: Float) {
    val p by animateFloatAsState(progress.coerceIn(0f, 1f), tween(900, easing = Veloq.EaseDraw), label = "progress")
    Box(Modifier.fillMaxWidth().height(2.dp).clip(Veloq.Pill).background(Veloq.Line)) {
        Box(Modifier.fillMaxWidth(p).height(2.dp).background(Veloq.Accent))
    }
}

/** The Veloq mark, drawn. */
@Composable
fun Mark(size: Int = 28) {
    Canvas(Modifier.size(size.dp)) {
        val s = this.size.width / 120f
        val w = 14 * s
        drawLine(Veloq.Ink, Offset(18 * s, 40 * s), Offset(50 * s, 104 * s), w, StrokeCap.Round)
        drawLine(Veloq.Accent, Offset(50 * s, 104 * s), Offset(90 * s, 33 * s), w, StrokeCap.Round)
        drawCircle(Veloq.Accent, 8 * s, Offset(102 * s, 13 * s))
    }
}


/** Choice pill: ink fill when chosen, like the web's chips. */
@Composable
fun Chip(text: String, selected: Boolean, enabled: Boolean = true, onClick: () -> Unit) {
    Box(
        Modifier
            .heightIn(min = 44.dp)
            .clip(Veloq.Pill)
            .background(if (selected) Veloq.Ink else Veloq.Bg)
            .border(1.dp, if (selected) Veloq.Ink else Veloq.LineStrong, Veloq.Pill)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .semantics { this.selected = selected }
            .padding(horizontal = 16.dp),
        contentAlignment = Alignment.Center,
    ) {
        val color = when {
            selected -> Veloq.OnAccent
            enabled -> Veloq.InkSoft
            else -> Veloq.InkMuted
        }
        Text(text, style = VeloqType.BodyStrong.copy(color = color))
    }
}
