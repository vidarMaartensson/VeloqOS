package com.vidarmartensson.veloqos.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.vidarmartensson.veloqos.data.LinearState
import com.vidarmartensson.veloqos.data.NewLinearIssue
import com.vidarmartensson.veloqos.domain.Logic
import com.vidarmartensson.veloqos.ui.LinearUi
import com.vidarmartensson.veloqos.ui.components.CardHead
import com.vidarmartensson.veloqos.ui.components.Chip
import com.vidarmartensson.veloqos.ui.components.GhostButton
import com.vidarmartensson.veloqos.ui.components.Label
import com.vidarmartensson.veloqos.ui.components.Pill
import com.vidarmartensson.veloqos.ui.components.PrimaryButton
import com.vidarmartensson.veloqos.ui.components.VCard
import com.vidarmartensson.veloqos.ui.theme.Veloq
import com.vidarmartensson.veloqos.ui.theme.VeloqType

@Composable
fun LinearScreen(
    linear: LinearUi,
    onOpen: () -> Unit,
    onPickTeam: (String) -> Unit,
    onShowDone: (Boolean) -> Unit,
    onCreate: (NewLinearIssue, onDone: () -> Unit) -> Unit,
    openUrl: (String) -> Unit,
) {
    LaunchedEffect(Unit) { onOpen() }
    var writing by remember { mutableStateOf(false) }
    val team = linear.team

    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 8.dp)) {
            Label(listOfNotNull("Linear", team?.workspace, team?.key).joinToString(" · "), accent = true)
            Text(
                if (linear.loading && linear.issues.isEmpty()) "Hämtar stories…" else Logic.storiesTitle(linear.issues.count { it.state.open }),
                style = VeloqType.Display,
            )
        }
        if (linear.status?.configured == false) {
            Text("Exempeldata. Lägg en nyckel per workspace (Linear:ApiKeys) i user-secrets på datorn och starta om API:t.", style = VeloqType.Meta)
        }
        linear.status?.workspaces?.filter { it.error != null }?.forEach { w ->
            Text("${w.name} svarar inte – ${w.error}", style = VeloqType.Body.copy(color = Veloq.Danger))
        }
        linear.error?.let { Text(it, style = VeloqType.Body.copy(color = Veloq.Danger)) }

        Logic.teamsByWorkspace(linear.teams).forEach { (workspace, teams) ->
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Label(workspace)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    teams.forEach { t -> Chip(t.name, selected = t.id == linear.teamId) { onPickTeam(t.id) } }
                }
            }
        }
        Chip("Även klara", selected = linear.showDone) { onShowDone(!linear.showDone) }

        if (team != null) {
            if (writing) {
                VCard {
                    NewStoryForm(
                        states = team.states.filter { it.open },
                        onCancel = { writing = false },
                        onSave = { title, description, priority, stateId ->
                            onCreate(NewLinearIssue(team.id, title, description, priority, stateId)) { writing = false }
                        },
                    )
                }
            } else {
                PrimaryButton("Ny story", { writing = true }, Modifier.fillMaxWidth())
            }
        }

        val groups = Logic.groupByState(team, linear.issues)
        if (groups.isEmpty() && !linear.loading) Text("Inga stories här.", style = VeloqType.Body)
        groups.forEach { (state, issues) ->
            VCard {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    StateDot(state)
                    Box(Modifier.weight(1f)) { CardHead(state.name, trailing = issues.size.toString()) }
                }
                issues.forEach { issue ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .heightIn(min = 44.dp)
                            .clip(Veloq.RadiusMd)
                            .clickable(role = Role.Button) { openUrl(issue.url) }
                            .padding(vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Text(issue.identifier, style = VeloqType.Meta, modifier = Modifier.width(64.dp))
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(issue.title, style = VeloqType.BodyStrong, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            issue.assignee?.let { Text(it, style = VeloqType.Meta) }
                        }
                        if (issue.priority > 0) Pill(issue.priorityLabel)
                    }
                }
            }
        }
    }
}

/** One accent per view: only work in progress gets it, not Linear's own state colors. */
@Composable
internal fun StateDot(state: LinearState) {
    val started = state.type == "started"
    Box(
        Modifier
            .size(8.dp)
            .clip(Veloq.Pill)
            .background(if (started) Veloq.Accent else Veloq.Bg)
            .border(1.dp, if (started) Veloq.Accent else Veloq.InkMuted, Veloq.Pill),
    )
}

@Composable
private fun NewStoryForm(states: List<LinearState>, onCancel: () -> Unit, onSave: (String, String?, Int, String?) -> Unit) {
    var title by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var priority by remember { mutableIntStateOf(0) }
    var stateId by remember { mutableStateOf<String?>(null) }

    Label("Ny story", accent = true)
    SettingField("Titel", title) { title = it }
    SettingField("Beskrivning", description) { description = it }
    Label("Prioritet")
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Logic.priorities.forEachIndexed { value, label -> Chip(label, selected = priority == value) { priority = value } }
    }
    Label("Status")
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Chip("Standard", selected = stateId == null) { stateId = null }
        states.forEach { s -> Chip(s.name, selected = stateId == s.id) { stateId = s.id } }
    }
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        PrimaryButton(
            "Skapa story",
            { onSave(title.trim(), description.trim().ifEmpty { null }, priority, stateId) },
            Modifier.weight(1f),
            enabled = title.isNotBlank(),
        )
        GhostButton("Avbryt", onCancel)
    }
}
