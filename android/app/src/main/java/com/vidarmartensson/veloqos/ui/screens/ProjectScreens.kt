package com.vidarmartensson.veloqos.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.vidarmartensson.veloqos.data.CiState
import com.vidarmartensson.veloqos.data.LinearIssue
import com.vidarmartensson.veloqos.data.Project
import com.vidarmartensson.veloqos.data.ProjectStatus
import com.vidarmartensson.veloqos.domain.Logic
import com.vidarmartensson.veloqos.ui.ProjectDetail
import com.vidarmartensson.veloqos.ui.UiState
import com.vidarmartensson.veloqos.ui.components.CardHead
import com.vidarmartensson.veloqos.ui.components.GhostButton
import com.vidarmartensson.veloqos.ui.components.Label
import com.vidarmartensson.veloqos.ui.components.Pill
import com.vidarmartensson.veloqos.ui.components.VCard
import com.vidarmartensson.veloqos.ui.theme.Veloq
import com.vidarmartensson.veloqos.ui.theme.VeloqType
import java.time.ZonedDateTime

@Composable
fun ProjectsScreen(
    state: UiState,
    now: ZonedDateTime,
    onLoad: () -> Unit,
    onOpen: (String) -> Unit,
    onBack: () -> Unit,
    openUrl: (String) -> Unit,
) {
    // Git and CI change while the app is open, so they reload each time the tab opens.
    LaunchedEffect(Unit) { onLoad() }
    val open = state.openProject
    val detail = state.project
    if (open != null && detail != null) {
        ProjectDetailScreen(open, state.status(open.id), detail, now, onBack, openUrl)
        return
    }
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        ScreenTitle("Projekt", "Allt som är på gång.")
        state.projects.forEachIndexed { i, p ->
            val status = state.status(p.id)
            VCard(Modifier.clip(Veloq.RadiusLg).clickable(role = Role.Button) { onOpen(p.id) }) {
                Text("${(i + 1).toString().padStart(2, '0')} · ${p.meta}", style = VeloqType.Meta)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(p.name, style = VeloqType.H3, modifier = Modifier.weight(1f, fill = false))
                    if (status?.attention == true) AttentionDot()
                    Box(Modifier.weight(1f))
                    Pill(p.status)
                }
                Text(p.body, style = VeloqType.Body)
                if (status != null) StatusLine(status)
            }
        }
    }
}

/** "feature/x · 12 ocommittade filer · 1 öppen PR", then CI – red when it fails. */
@Composable
private fun StatusLine(status: ProjectStatus) {
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(
            Logic.statusSummary(status),
            style = VeloqType.Meta.copy(color = if (status.error != null) Veloq.Danger else Veloq.InkFaint),
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f, fill = false),
        )
        Logic.ciLabel(status.ci)?.let { Text(it, style = VeloqType.Meta.copy(color = ciColor(status.ci))) }
    }
}

private fun ciColor(ci: CiState?) = if (ci == CiState.Failing) Veloq.Danger else Veloq.InkFaint

/** Red CI or uncommitted changes. */
@Composable
private fun AttentionDot() {
    Box(Modifier.size(8.dp).clip(Veloq.Pill).background(Veloq.Accent).semantics { contentDescription = "Behöver dig" })
}

@Composable
private fun ProjectDetailScreen(
    project: Project,
    status: ProjectStatus?,
    detail: ProjectDetail,
    now: ZonedDateTime,
    onBack: () -> Unit,
    openUrl: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        GhostButton("Tillbaka", onBack)
        ScreenTitle(listOfNotNull("Projekt", project.meta).joinToString(" · "), "${project.name}.")
        Text(project.body, style = VeloqType.Body)

        VCard {
            CardHead("Status", if (status?.attention == true) "Behöver dig" else null)
            when {
                status == null -> Text(
                    if (project.repoPath == null) "Projektet har ingen mapp på datorn." else "Datorn har inte läst repot än.",
                    style = VeloqType.Body,
                )
                status.error != null -> Text(status.error, style = VeloqType.Body.copy(color = Veloq.Danger))
                else -> {
                    status.branch?.let { StatusRow("Branch", it) }
                    StatusRow("Filer", Logic.changesLabel(status.changes))
                    Logic.aheadLabel(status.ahead)?.let { StatusRow("Push", it) }
                    Logic.pullRequestsLabel(status.pullRequests)?.let { StatusRow("PR:er", it) }
                    Logic.ciLabel(status.ci)?.let { ci ->
                        val url = status.ciUrl
                        StatusRow("CI", ci, color = ciColor(status.ci), onClick = url?.let { { openUrl(it) } })
                    }
                    status.lastCommit?.let { StatusRow("Senast", "${it.message} · ${Logic.relativeDay(it.at, now)}") }
                }
            }
        }

        project.linearTeam?.let { team ->
            VCard {
                CardHead("Stories · $team", if (detail.loading) null else "${detail.stories.size} öppna")
                when {
                    detail.loading -> Text("Hämtar stories…", style = VeloqType.Body)
                    detail.error != null -> Text(detail.error, style = VeloqType.Body.copy(color = Veloq.Danger))
                    detail.stories.isEmpty() -> Text("Inget öppet.", style = VeloqType.Body)
                }
                detail.stories.forEach { issue -> StoryRow(issue, openUrl) }
            }
        }
    }
}

@Composable
private fun StatusRow(label: String, value: String, color: androidx.compose.ui.graphics.Color = Veloq.Ink, onClick: (() -> Unit)? = null) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = if (onClick != null) 44.dp else 0.dp)
            .clip(Veloq.RadiusSm)
            .then(if (onClick != null) Modifier.clickable(role = Role.Button, onClick = onClick) else Modifier)
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.width(72.dp)) { Label(label) }
        Text(value, style = VeloqType.BodyStrong.copy(color = color), maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
    }
}

@Composable
private fun StoryRow(issue: LinearIssue, openUrl: (String) -> Unit) {
    Column(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(
            Modifier.fillMaxWidth().clip(Veloq.RadiusSm).clickable(role = Role.Button) { openUrl(issue.url) },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(issue.identifier, style = VeloqType.Meta, modifier = Modifier.width(64.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(issue.title, style = VeloqType.BodyStrong, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    StateDot(issue.state)
                    Text(issue.state.name, style = VeloqType.Meta)
                }
            }
        }
    }
}
