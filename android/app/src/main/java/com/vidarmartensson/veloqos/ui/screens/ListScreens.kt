package com.vidarmartensson.veloqos.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.vidarmartensson.veloqos.data.Connection
import com.vidarmartensson.veloqos.data.InboxAction
import com.vidarmartensson.veloqos.data.InboxItem
import com.vidarmartensson.veloqos.data.Project
import com.vidarmartensson.veloqos.domain.Logic
import com.vidarmartensson.veloqos.ui.UiState
import com.vidarmartensson.veloqos.ui.components.CardHead
import com.vidarmartensson.veloqos.ui.components.GhostButton
import com.vidarmartensson.veloqos.ui.components.Label
import com.vidarmartensson.veloqos.ui.components.Pill
import com.vidarmartensson.veloqos.ui.components.PrimaryButton
import com.vidarmartensson.veloqos.ui.components.ProgressLine
import com.vidarmartensson.veloqos.ui.components.Toggle
import com.vidarmartensson.veloqos.ui.components.VCard
import com.vidarmartensson.veloqos.ui.theme.Veloq
import com.vidarmartensson.veloqos.ui.theme.VeloqType
import java.time.ZonedDateTime

@Composable
private fun ScreenTitle(eyebrow: String, title: String) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 8.dp)) {
        Label(eyebrow, accent = true)
        Text(title, style = VeloqType.Display)
    }
}

@Composable
fun ProjectsScreen(projects: List<Project>, onPrompt: (Project) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        ScreenTitle("Projekt", "Allt som är på gång.")
        projects.forEachIndexed { i, p ->
            VCard {
                Text("${(i + 1).toString().padStart(2, '0')} · ${p.meta}", style = VeloqType.Meta)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text(p.name, style = VeloqType.H3, modifier = Modifier.weight(1f))
                    Pill(p.status)
                }
                Text(p.body, style = VeloqType.Body)
                GhostButton("Prompta", { onPrompt(p) })
            }
        }
    }
}

@Composable
fun InboxScreen(
    items: List<InboxItem>,
    openId: String?,
    now: ZonedDateTime,
    onOpen: (String?) -> Unit,
    onAct: (String, InboxAction, String?) -> Unit,
    onUndo: (String) -> Unit,
) {
    val open = items.firstOrNull { it.id == openId }
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        if (open == null) {
            val n = Logic.needsYou(items)
            ScreenTitle("Inkorg · Gmail", if (n == 0) "Allt är hanterat." else "Det som behöver dig.")
            VCard {
                items.forEach { item ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clip(Veloq.RadiusSm)
                            .clickable(role = Role.Button) { onOpen(item.id) }
                            .padding(vertical = 10.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(
                            Modifier.size(40.dp).clip(Veloq.RadiusSm).background(Veloq.SurfaceRaised).border(1.dp, Veloq.Line, Veloq.RadiusSm),
                            contentAlignment = Alignment.Center,
                        ) { Text(item.from.firstOrNull { it.isLetter() }?.uppercase() ?: "·", style = VeloqType.Meta.copy(color = Veloq.InkSoft)) }
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                                Text(item.from, style = VeloqType.BodyStrong.copy(color = if (item.handledWith != null) Veloq.InkMuted else Veloq.Ink), maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                                Text(Logic.relativeDay(item.receivedAt, now), style = VeloqType.Meta)
                            }
                            Text(Logic.rowStatus(item), style = VeloqType.Meta, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
            }
        } else {
            MailDetail(open, now, onBack = { onOpen(null) }, onAct = onAct, onUndo = onUndo)
        }
    }
}

@Composable
private fun MailDetail(item: InboxItem, now: ZonedDateTime, onBack: () -> Unit, onAct: (String, InboxAction, String?) -> Unit, onUndo: (String) -> Unit) {
    var replying by remember(item.id) { mutableStateOf(false) }
    var draft by remember(item.id) { mutableStateOf(item.draft ?: "Hej,\n\n[Ditt svar här].\n\nVänliga hälsningar\nVidar") }

    GhostButton("Tillbaka", onBack)
    VCard {
        Text("${item.from} · ${Logic.relativeDay(item.receivedAt, now)}", style = VeloqType.Meta)
        Text(item.subject, style = VeloqType.H2)
        Text(item.summary, style = VeloqType.Body)
        Text("Förslag: ${item.suggestion}", style = VeloqType.Meta)

        val handled = item.handledWith
        when {
            handled != null -> {
                Text(Logic.result(handled), style = VeloqType.BodyStrong)
                GhostButton("Ångra", { onUndo(item.id) })
            }
            replying -> {
                Label("Utkast")
                BasicTextField(
                    value = draft,
                    onValueChange = { draft = it },
                    textStyle = VeloqType.Body.copy(color = Veloq.Ink),
                    cursorBrush = SolidColor(Veloq.Accent),
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 120.dp)
                        .clip(Veloq.RadiusMd)
                        .background(Veloq.Bg)
                        .border(1.dp, Veloq.LineStrong, Veloq.RadiusMd)
                        .padding(16.dp)
                        .semantics { contentDescription = "Utkast" },
                )
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    PrimaryButton("Skicka svar", { onAct(item.id, InboxAction.Reply, draft); replying = false }, Modifier.weight(1f), enabled = draft.isNotBlank())
                    GhostButton("Avbryt", { replying = false })
                }
            }
            else -> {
                Label("Välj vad som ska hända")
                InboxAction.entries.forEach { action ->
                    val recommended = action == item.suggestedAction
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .heightIn(min = 52.dp)
                            .clip(Veloq.RadiusMd)
                            .background(Veloq.BgSunk)
                            .border(1.dp, if (recommended) Veloq.LineStrong else Veloq.Line, Veloq.RadiusMd)
                            .clickable(role = Role.Button) { if (action == InboxAction.Reply) replying = true else onAct(item.id, action, null) }
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Box(Modifier.size(8.dp).clip(Veloq.Pill).background(if (recommended) Veloq.Accent else Veloq.LineStrong))
                        Text(Logic.title(action), style = VeloqType.BodyStrong, modifier = Modifier.weight(1f))
                        if (recommended) Text("Förslag", style = VeloqType.Meta)
                    }
                }
            }
        }
    }
}

@Composable
fun MoreScreen(
    state: UiState,
    connection: Connection,
    onToggleRoutine: (String, Boolean) -> Unit,
    onRunChore: (String) -> Unit,
    onSaveConnection: (Connection) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(20.dp)) {
        ScreenTitle("Mer", "Rutiner och chores.")

        VCard {
            CardHead("Rutiner")
            state.routines.forEach { r ->
                Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Text(r.name, style = VeloqType.BodyStrong)
                        Text(r.schedule, style = VeloqType.Meta)
                    }
                    Toggle(r.enabled, "${r.name}", onChange = { onToggleRoutine(r.id, it) })
                }
            }
        }

        VCard {
            CardHead("Chores")
            state.chores.forEach { chore ->
                val job = state.choreState(chore.id)
                Column(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                            Text(chore.name, style = VeloqType.BodyStrong)
                            Text(
                                when {
                                    job == null -> "Redo · ${chore.estimate}"
                                    job.running -> job.step
                                    else -> job.result ?: "Klart."
                                },
                                style = VeloqType.Meta,
                            )
                        }
                        GhostButton(if (job == null) "Kör" else if (job.running) "Kör…" else "Igen", { onRunChore(chore.id) })
                    }
                    ProgressLine(job?.progress ?: 0f)
                }
            }
        }

        ConnectionCard(connection, onSaveConnection)
    }
}

@Composable
private fun ConnectionCard(connection: Connection, onSave: (Connection) -> Unit) {
    var url by remember(connection) { mutableStateOf(connection.baseUrl) }
    var key by remember(connection) { mutableStateOf(connection.apiKey) }
    VCard {
        CardHead("Datorn")
        Text("Adressen till Veloq OS-API:t, till exempel via Tailscale. Emulatorn når datorn på 10.0.2.2.", style = VeloqType.Body)
        SettingField("Adress", url) { url = it }
        SettingField("Nyckel (X-Veloq-Key)", key) { key = it }
        PrimaryButton("Spara", { onSave(Connection(url, key)) }, Modifier.fillMaxWidth())
    }
}

@Composable
private fun SettingField(label: String, value: String, onChange: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Label(label)
        BasicTextField(
            value = value,
            onValueChange = onChange,
            singleLine = true,
            textStyle = VeloqType.Body.copy(color = Veloq.Ink),
            cursorBrush = SolidColor(Veloq.Accent),
            modifier = Modifier
                .fillMaxWidth()
                .clip(Veloq.Pill)
                .background(Veloq.Bg)
                .border(1.dp, Veloq.LineStrong, Veloq.Pill)
                .padding(horizontal = 20.dp, vertical = 14.dp)
                .semantics { contentDescription = label },
        )
    }
}
