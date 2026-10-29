package com.vidarmartensson.veloqos.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.vidarmartensson.veloqos.data.Connection
import com.vidarmartensson.veloqos.domain.Logic
import com.vidarmartensson.veloqos.ui.components.GhostButton
import com.vidarmartensson.veloqos.ui.components.LiveDot
import com.vidarmartensson.veloqos.ui.components.Mark
import com.vidarmartensson.veloqos.ui.screens.HomeScreen
import com.vidarmartensson.veloqos.ui.screens.InboxScreen
import com.vidarmartensson.veloqos.ui.screens.MoreScreen
import com.vidarmartensson.veloqos.ui.screens.ProjectsScreen
import com.vidarmartensson.veloqos.ui.screens.PromptScreen
import com.vidarmartensson.veloqos.ui.theme.Veloq
import com.vidarmartensson.veloqos.ui.theme.VeloqType
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.StateFlow
import java.time.ZonedDateTime

enum class Tab(val label: String, val icon: String) {
    Home("Hem", "M4 11l8-7 8 7v9h-5v-6H9v6H4z"),
    Prompt("Prompt", "M5 5h14v10H10l-5 4z"),
    Projects("Projekt", "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"),
    Inbox("Inkorg", "M4 6h16v12H4zM4 7l8 6 8-6"),
    More("Mer", "M13 3L5 13h6l-1 8 8-10h-6z"),
}

@Composable
fun VeloqApp(
    viewModel: AppViewModel,
    connection: StateFlow<Connection>,
    onSaveConnection: (Connection) -> Unit,
    openUrl: (String) -> Unit,
) {
    val state by viewModel.state.collectAsState()
    val conn by connection.collectAsState()
    var tab by rememberSaveable { mutableStateOf(Tab.Home) }
    var openMail by rememberSaveable { mutableStateOf<String?>(null) }
    var now by remember { mutableStateOf(ZonedDateTime.now(Logic.zone)) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(60_000)
            now = ZonedDateTime.now(Logic.zone)
        }
    }

    BackHandler(enabled = tab != Tab.Home || openMail != null) {
        if (openMail != null) openMail = null else tab = Tab.Home
    }

    Column(Modifier.fillMaxSize().background(Veloq.Bg)) {
        Header(online = state.error == null, modifier = Modifier.statusBarsPadding())

        state.error?.let { message ->
            Row(
                Modifier.padding(horizontal = 20.dp).fillMaxWidth().clip(Veloq.RadiusMd).border(1.dp, Veloq.LineStrong, Veloq.RadiusMd).padding(14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text("Når inte datorn. $message", style = VeloqType.Body.copy(color = Veloq.Danger), modifier = Modifier.weight(1f))
                GhostButton("Försök igen", { viewModel.dismissError(); viewModel.refresh() })
            }
        }

        AnimatedContent(
            targetState = tab,
            transitionSpec = { (fadeIn(tween(300)) + slideInVertically(tween(450, easing = Veloq.EaseOut)) { it / 24 }) togetherWith fadeOut(tween(150)) },
            modifier = Modifier.weight(1f),
            label = "tab",
        ) { current ->
            Column(
                Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .imePadding()
                    .padding(horizontal = 20.dp, vertical = 8.dp)
                    .padding(bottom = 24.dp),
            ) {
                when (current) {
                    Tab.Home -> HomeScreen(
                        state = state,
                        now = now,
                        onSend = { viewModel.send(it); tab = Tab.Prompt },
                        onConnectCalendar = { viewModel.connectCalendar(openUrl) },
                        onBook = viewModel::book,
                        onRunChore = viewModel::runChore,
                        onOpenJobs = { tab = Tab.More },
                        onOpenMore = { tab = Tab.More },
                        onOpenMail = { openMail = it; tab = Tab.Inbox },
                    )
                    Tab.Prompt -> PromptScreen(state, onSend = viewModel::send)
                    Tab.Projects -> ProjectsScreen(state.projects, onPrompt = { viewModel.setPromptContext(it.name); tab = Tab.Prompt })
                    Tab.Inbox -> InboxScreen(
                        items = state.inbox,
                        openId = openMail,
                        now = now,
                        onOpen = { openMail = it },
                        onAct = viewModel::act,
                        onUndo = viewModel::undo,
                    )
                    Tab.More -> MoreScreen(state, conn, viewModel::setRoutine, viewModel::runChore, onSaveConnection)
                }
            }
        }

        TabBar(tab, onSelect = { tab = it; if (it != Tab.Inbox) openMail = null })
    }
}

@Composable
private fun Header(online: Boolean, modifier: Modifier = Modifier) {
    Row(
        modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 18.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Mark()
            Text("Veloq OS", style = VeloqType.H3.copy(fontSize = 18.sp))
        }
        Row(
            Modifier.clip(Veloq.Pill).border(1.dp, Veloq.LineStrong, Veloq.Pill).padding(horizontal = 14.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (online) LiveDot() else Box(Modifier.size(8.dp).clip(Veloq.Pill).border(1.dp, Veloq.Danger, Veloq.Pill))
            Text(if (online) "Datorn" else "Offline", style = VeloqType.Meta.copy(color = Veloq.InkSoft))
        }
    }
}

@Composable
private fun TabBar(current: Tab, onSelect: (Tab) -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .background(Veloq.BgSunk)
            .border(width = 1.dp, color = Veloq.LineSubtle)
            .navigationBarsPadding()
            .padding(horizontal = 8.dp, vertical = 6.dp),
    ) {
        Tab.entries.forEach { tab ->
            val active = tab == current
            val lift by animateDpAsState(if (active) (-2).dp else 0.dp, Veloq.springy(), label = "tab-lift")
            Column(
                Modifier
                    .weight(1f)
                    .heightIn(min = 60.dp)
                    .clip(Veloq.RadiusMd)
                    .clickable(role = Role.Tab) { onSelect(tab) }
                    .semantics { selected = active },
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterVertically),
            ) {
                Box(
                    Modifier
                        .offset(y = lift)
                        .size(width = 52.dp, height = 30.dp)
                        .clip(Veloq.Pill)
                        .background(if (active) Veloq.SurfaceRaised else Color.Transparent),
                    contentAlignment = Alignment.Center,
                ) { LineIcon(tab.icon, if (active) Veloq.Ink else Veloq.InkMuted) }
                Text(tab.label.uppercase(), style = VeloqType.Pill.copy(color = if (active) Veloq.Ink else Veloq.InkMuted))
            }
        }
    }
}

/** Draws a 24-unit line icon from the small path subset the tab icons use (M, L, H, V, h, v, l, z). */
@Composable
private fun LineIcon(path: String, color: Color) {
    Canvas(Modifier.size(22.dp)) {
        val s = size.width / 24f
        drawPath(parseIcon(path, s), color, style = Stroke(width = 1.6f * s, cap = StrokeCap.Round, join = StrokeJoin.Round))
    }
}

internal fun parseIcon(d: String, scale: Float): Path {
    val path = Path()
    val tokens = Regex("[MLHVZmlhvz]|-?\\d*\\.?\\d+").findAll(d).map { it.value }.toList()
    var i = 0
    var cmd = 'M'
    var x = 0f
    var y = 0f
    var startX = 0f
    var startY = 0f
    fun num() = tokens[i++].toFloat()
    while (i < tokens.size) {
        val t = tokens[i]
        if (t.length == 1 && t[0].isLetter()) { cmd = t[0]; i++; if (cmd == 'z' || cmd == 'Z') { path.close(); x = startX; y = startY }; continue }
        when (cmd) {
            'M' -> { x = num(); y = num(); path.moveTo(x * scale, y * scale); startX = x; startY = y; cmd = 'L' }
            'm' -> { x += num(); y += num(); path.moveTo(x * scale, y * scale); startX = x; startY = y; cmd = 'l' }
            'L' -> { x = num(); y = num(); path.lineTo(x * scale, y * scale) }
            'l' -> { x += num(); y += num(); path.lineTo(x * scale, y * scale) }
            'H' -> { x = num(); path.lineTo(x * scale, y * scale) }
            'h' -> { x += num(); path.lineTo(x * scale, y * scale) }
            'V' -> { y = num(); path.lineTo(x * scale, y * scale) }
            'v' -> { y += num(); path.lineTo(x * scale, y * scale) }
            else -> i++
        }
    }
    return path
}

