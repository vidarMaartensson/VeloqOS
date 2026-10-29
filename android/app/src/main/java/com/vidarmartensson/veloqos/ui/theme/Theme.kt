package com.vidarmartensson.veloqos.ui.theme

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

/** Veloq Labs design system tokens, 1:1 with web/src/styles/tokens.css. Dark only. */
object Veloq {
    val Bg = Color(0xFF0B0D12)
    val BgSunk = Color(0xFF0D1016)
    val Surface = Color(0xFF11141B)
    val SurfaceHover = Color(0xFF131721)
    val SurfaceRaised = Color(0xFF161A22)
    val Tile = Color(0xFF232935)
    val LineSubtle = Color(0xFF1A1E27)
    val Line = Color(0xFF1E232D)
    val LineStrong = Color(0xFF2A303C)
    val Ink = Color(0xFFF2F4F8)
    val InkSoft = Color(0xFFC9CFD9)
    val InkBody = Color(0xFFB4BCC8)
    val InkMuted = Color(0xFF9AA3B2)
    val InkFaint = Color(0xFF8A93A3)
    val Accent = Color(0xFF3DF2C6)
    val OnAccent = Color(0xFF0B0D12)
    val Danger = Color(0xFFFF8A7A)

    val RadiusSm = RoundedCornerShape(14.dp)
    val RadiusTile = RoundedCornerShape(18.dp)
    val RadiusMd = RoundedCornerShape(24.dp)
    val RadiusLg = RoundedCornerShape(28.dp)
    val Pill = RoundedCornerShape(percent = 50)

    /** Springs with overshoot – the brand's motion. Compose equivalents of --ease-spring(-soft). */
    fun <T> springy() = spring<T>(dampingRatio = 0.55f, stiffness = Spring.StiffnessMediumLow)
    fun <T> springySoft() = spring<T>(dampingRatio = 0.65f, stiffness = Spring.StiffnessLow)
    val EaseOut = CubicBezierEasing(0.2f, 0.9f, 0.2f, 1f)
    val EaseDraw = CubicBezierEasing(0.6f, 0f, 0.2f, 1f)
}

/**
 * Space Grotesk and JetBrains Mono. Add the TTFs to res/font (space_grotesk.ttf variable,
 * jetbrains_mono_regular.ttf) from Google Fonts and swap these for
 * FontFamily(Font(R.font.space_grotesk, …)). Until then the system families stand in.
 */
val Sans: FontFamily = FontFamily.SansSerif
val Mono: FontFamily = FontFamily.Monospace

object VeloqType {
    val Display = TextStyle(fontFamily = Sans, fontWeight = FontWeight.SemiBold, fontSize = 34.sp, lineHeight = 36.sp, letterSpacing = (-0.03).em, color = Veloq.Ink)
    val H2 = TextStyle(fontFamily = Sans, fontWeight = FontWeight.SemiBold, fontSize = 26.sp, lineHeight = 30.sp, letterSpacing = (-0.02).em, color = Veloq.Ink)
    val H3 = TextStyle(fontFamily = Sans, fontWeight = FontWeight.SemiBold, fontSize = 20.sp, lineHeight = 24.sp, letterSpacing = (-0.01).em, color = Veloq.Ink)
    val Body = TextStyle(fontFamily = Sans, fontSize = 16.sp, lineHeight = 25.sp, color = Veloq.InkBody)
    val BodyStrong = TextStyle(fontFamily = Sans, fontWeight = FontWeight.Medium, fontSize = 16.sp, lineHeight = 22.sp, color = Veloq.Ink)
    val Button = TextStyle(fontFamily = Sans, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
    val Label = TextStyle(fontFamily = Mono, fontSize = 12.sp, letterSpacing = 0.22.em, color = Veloq.InkMuted)
    val Meta = TextStyle(fontFamily = Mono, fontSize = 13.sp, color = Veloq.InkFaint)
    val Pill = TextStyle(fontFamily = Mono, fontSize = 11.sp, letterSpacing = 0.12.em, color = Veloq.InkSoft)
}

@Composable
fun VeloqTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Veloq.Accent,
            onPrimary = Veloq.OnAccent,
            background = Veloq.Bg,
            onBackground = Veloq.Ink,
            surface = Veloq.Surface,
            onSurface = Veloq.Ink,
            outline = Veloq.LineStrong,
            error = Veloq.Danger,
        ),
        content = content,
    )
}
