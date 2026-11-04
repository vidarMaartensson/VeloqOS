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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.vidarmartensson.veloqos.data.ChoreKind
import com.vidarmartensson.veloqos.data.ChoreProject
import com.vidarmartensson.veloqos.data.Job
import com.vidarmartensson.veloqos.data.Project
import com.vidarmartensson.veloqos.domain.Logic
import com.vidarmartensson.veloqos.ui.ChoreRun
import com.vidarmartensson.veloqos.ui.components.Chip
import com.vidarmartensson.veloqos.ui.components.GhostButton
import com.vidarmartensson.veloqos.ui.components.Label
import com.vidarmartensson.veloqos.ui.components.LiveDot
import com.vidarmartensson.veloqos.ui.components.PrimaryButton
import com.vidarmartensson.veloqos.ui.components.ProgressLine
import com.vidarmartensson.veloqos.ui.theme.Veloq
import com.vidarmartensson.veloqos.ui.theme.VeloqType

/** Pick a project and type the addition, then run. Stays open with the API's reason if it refuses. */
@Composable
fun RunChoreDialog(
    run: ChoreRun,
    projects: List<Project>,
    onPick: (String?) -> Unit,
    onArgument: (String) -> Unit,
    onRun: () -> Unit,
    onClose: () -> Unit,
) {
    val chore = run.chore
    val choices = Logic.runnableProjects(chore, projects)
    Dialog(onDismissRequest = onClose) {
        Column(
            Modifier
                .fillMaxWidth()
                .clip(Veloq.RadiusLg)
                .background(Veloq.Surface)
                .border(1.dp, Veloq.LineStrong, Veloq.RadiusLg)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 22.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Label(listOf(if (chore.kind == ChoreKind.Skill) "Skill" else "Chore", chore.estimate).distinct().joinToString(" · "), accent = true)
            Text(Logic.runTitle(chore), style = VeloqType.H2)
            Text(chore.description, style = VeloqType.Body, maxLines = 4, overflow = TextOverflow.Ellipsis)

            if (chore.project != ChoreProject.None) {
                Label(if (chore.project == ChoreProject.Required) "Projekt" else "Projekt · valfritt")
                if (choices.isEmpty()) Text("Inget projekt har en mapp på datorn.", style = VeloqType.Meta)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    if (chore.project == ChoreProject.Optional) Chip("Inget projekt", selected = run.projectId == null) { onPick(null) }
                    choices.forEach { p -> Chip(p.name, selected = run.projectId == p.id) { onPick(p.id) } }
                }
            }
            chore.argument?.let { placeholder ->
                SettingField("Tillägg", run.argument, placeholder = placeholder, onChange = onArgument)
            }
            run.error?.let { Text(it, style = VeloqType.Body.copy(color = Veloq.Danger)) }

            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                PrimaryButton(
                    if (run.sending) "Startar…" else "Kör",
                    onRun,
                    Modifier.weight(1f),
                    enabled = !run.sending && Logic.canRun(chore, run.projectId),
                )
                GhostButton("Avbryt", onClose)
            }
        }
    }
}

/** One job: status and project, the result (tap to see all of it) and, when it waits, its choices. */
@Composable
fun JobRow(job: Job, ticked: Set<String>, onToggle: (String) -> Unit, onConfirm: () -> Unit) {
    var expanded by remember(job.id) { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            if (job.running) LiveDot()
            Text(job.title, style = VeloqType.BodyStrong, modifier = Modifier.weight(1f))
        }
        Label(Logic.jobLabel(job))
        if (job.running) {
            Text(job.step, style = VeloqType.Meta)
            ProgressLine(job.progress)
        }
        job.result?.let { result ->
            Text(
                result,
                style = VeloqType.Body.copy(color = if (job.failed) Veloq.Danger else Veloq.InkBody),
                maxLines = if (expanded) Int.MAX_VALUE else 4,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(Veloq.RadiusSm)
                    .clickable(role = Role.Button) { expanded = !expanded },
            )
        }
        if (job.waiting) {
            job.choices.orEmpty().forEach { choice ->
                ChoiceRow(choice.label, choice.detail, choice.id in ticked) { onToggle(choice.id) }
            }
            PrimaryButton(job.confirm ?: "Godkänn", onConfirm, Modifier.fillMaxWidth(), enabled = ticked.isNotEmpty())
        }
    }
}

/** A checkable row: ink-filled box when ticked, like a chosen chip. */
@Composable
private fun ChoiceRow(label: String, detail: String, checked: Boolean, onToggle: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
            .clip(Veloq.RadiusMd)
            .background(Veloq.BgSunk)
            .border(1.dp, if (checked) Veloq.LineStrong else Veloq.Line, Veloq.RadiusMd)
            .toggleable(value = checked, role = Role.Checkbox, onValueChange = { onToggle() })
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            Modifier
                .size(20.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(if (checked) Veloq.Ink else Veloq.Bg)
                .border(1.dp, if (checked) Veloq.Ink else Veloq.LineStrong, RoundedCornerShape(6.dp)),
        )
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(label, style = VeloqType.BodyStrong)
            Text(detail, style = VeloqType.Meta)
        }
    }
}
