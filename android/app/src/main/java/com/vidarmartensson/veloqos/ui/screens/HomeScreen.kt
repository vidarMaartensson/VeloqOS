package com.vidarmartensson.veloqos.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
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
import com.vidarmartensson.veloqos.data.CalendarDay
import com.vidarmartensson.veloqos.data.NewCalendarEvent
import com.vidarmartensson.veloqos.domain.Logic
import com.vidarmartensson.veloqos.ui.BRIEF
import com.vidarmartensson.veloqos.ui.UiState
import com.vidarmartensson.veloqos.ui.components.CardHead
import com.vidarmartensson.veloqos.ui.components.GhostButton
import com.vidarmartensson.veloqos.ui.components.Label
import com.vidarmartensson.veloqos.ui.components.LiveDot
import com.vidarmartensson.veloqos.ui.components.PrimaryButton
import com.vidarmartensson.veloqos.ui.components.ProgressLine
import com.vidarmartensson.veloqos.ui.components.VCard
import com.vidarmartensson.veloqos.ui.theme.Veloq
import com.vidarmartensson.veloqos.ui.theme.VeloqType
import java.time.ZonedDateTime

@Composable
fun HomeScreen(
    state: UiState,
    now: ZonedDateTime,
    onConnectCalendar: () -> Unit,
    onBook: (String) -> Unit,
    onAddEvent: (NewCalendarEvent, onDone: () -> Unit) -> Unit,
    onRunChore: (String) -> Unit,
    onRunRoutine: (String) -> Unit,
    onOpenJobs: () -> Unit,
    onOpenMore: () -> Unit,
    onOpenMail: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(20.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 8.dp)) {
            Label(Logic.dateLabel(now), accent = true)
            Text("${Logic.greeting(now)}, Vidar.", style = VeloqType.Display)
        }

        state.system?.disk?.takeIf { it.low }?.let { disk ->
            DiskWarning(disk.label, cleaning = state.choreState("disk-cleanup")?.running == true, onClean = { onRunChore("disk-cleanup") })
        }

        CalendarCard(state.calendar, now, onConnectCalendar, onBook, onAddEvent)

        BriefCard(state, now, onWrite = { onRunRoutine(BRIEF) })

        VCard {
            CardHead("Pågående", "${state.jobs.count { it.running }} jobb")
            if (state.jobs.isEmpty()) {
                Text("Inget körs just nu.", style = VeloqType.Body)
            }
            state.jobs.take(2).forEach { job ->
                Column(
                    Modifier
                        .fillMaxWidth()
                        .clip(Veloq.RadiusSm)
                        .clickable(role = Role.Button, onClick = onOpenJobs)
                        .padding(vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        if (job.running) LiveDot()
                        Text(job.title, style = VeloqType.BodyStrong, modifier = Modifier.weight(1f))
                    }
                    Label(Logic.jobLabel(job))
                    Text(
                        if (job.running) job.step else job.result ?: job.step,
                        style = VeloqType.Meta.copy(color = if (job.failed) Veloq.Danger else Veloq.InkFaint),
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    ProgressLine(job.progress)
                }
            }
        }

        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            CardHead("Chores", "Alla", onTrailing = onOpenMore)
            Row(
                Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                // Built-ins here; your skills are under Mer, next to the chores.
                Logic.builtins(state.chores).forEach { chore ->
                    val job = state.choreState(chore.id)
                    GhostButton(
                        text = if (job != null && !job.running) "${chore.name} · klart" else chore.name,
                        onClick = { onRunChore(chore.id) },
                        leading = if (job?.running == true) ({ LiveDot() }) else null,
                    )
                }
            }
        }

        VCard {
            CardHead("Inkorg", "${state.needsYou} behöver dig")
            state.inbox.filter { it.handledWith == null }.take(2).forEach { item ->
                Column(
                    Modifier
                        .fillMaxWidth()
                        .clip(Veloq.RadiusSm)
                        .clickable(role = Role.Button) { onOpenMail(item.id) }
                        .padding(vertical = 10.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(item.subject, style = VeloqType.BodyStrong, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text("${item.from} · ${item.suggestion}", style = VeloqType.Meta, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}

/** Little disk left on the computer: danger, not the accent, and a direct way to free some. */
@Composable
private fun DiskWarning(label: String, cleaning: Boolean, onClean: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(Veloq.RadiusMd)
            .border(1.dp, Veloq.Danger, Veloq.RadiusMd)
            .padding(start = 18.dp, end = 8.dp, top = 8.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text("Lite plats kvar på datorn.", style = VeloqType.BodyStrong.copy(color = Veloq.Danger))
            Text(label, style = VeloqType.Meta)
        }
        GhostButton("Rensa cache", onClean, leading = if (cleaning) ({ LiveDot() }) else null)
    }
}

/** The latest morning brief; before the first one, a way to write it now. */
@Composable
private fun BriefCard(state: UiState, now: ZonedDateTime, onWrite: () -> Unit) {
    val brief = state.brief
    val writing = state.choreState(BRIEF)?.running == true
    VCard {
        CardHead("Morgonbrief", brief?.let { Logic.relativeDay(it.createdAt, now) })
        when {
            brief != null -> Text(brief.text, style = VeloqType.Body)
            writing -> Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                LiveDot()
                Text("Skriver briefen…", style = VeloqType.Body)
            }
            else -> {
                Text("Ingen brief än.", style = VeloqType.Body)
                GhostButton("Skriv nu", onWrite)
            }
        }
    }
}

@Composable
fun CalendarCard(
    calendar: CalendarDay?,
    now: ZonedDateTime,
    onConnect: () -> Unit,
    onBook: (String) -> Unit,
    onAddEvent: (NewCalendarEvent, onDone: () -> Unit) -> Unit,
) {
    var adding by remember { mutableStateOf(false) }
    VCard {
        CardHead("Kalender", if (calendar?.connected == true) "Idag" else "Inte ansluten")
        if (calendar?.connected != true) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                Box(
                    Modifier.size(44.dp).clip(Veloq.RadiusSm).background(Veloq.SurfaceRaised).border(1.dp, Veloq.LineStrong, Veloq.RadiusSm),
                    contentAlignment = Alignment.Center,
                ) { Box(Modifier.size(8.dp).clip(Veloq.Pill).background(Veloq.Accent)) }
                Text("Koppla Google så ser du dagen och inkorgen här.", style = VeloqType.Body)
            }
            GhostButton("Anslut Google", onConnect, Modifier.fillMaxWidth())
        } else if (calendar.events.isEmpty()) {
            Text("Inget inbokat idag.", style = VeloqType.Body)
        } else {
            calendar.events.forEach { event ->
                val phase = Logic.phase(event, now)
                val isNow = phase == Logic.Phase.Now && !event.suggested
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clip(Veloq.RadiusSm)
                        .then(
                            when {
                                event.suggested -> Modifier.border(1.dp, Veloq.LineStrong, Veloq.RadiusSm)
                                isNow -> Modifier.background(Veloq.SurfaceRaised).border(1.dp, Veloq.LineStrong, Veloq.RadiusSm)
                                else -> Modifier
                            },
                        )
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text(Logic.clock(event.start), style = VeloqType.Meta.copy(color = if (isNow) Veloq.Ink else Veloq.InkFaint), modifier = Modifier.width(44.dp))
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(
                            event.title,
                            style = VeloqType.BodyStrong.copy(color = if (phase == Logic.Phase.Past) Veloq.InkMuted else Veloq.Ink),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        val prefix = if (event.suggested) "Förslag från Veloq OS · " else ""
                        Text(prefix + Logic.duration(event) + (event.location?.let { " · $it" } ?: ""), style = VeloqType.Meta)
                    }
                    if (isNow) LiveDot()
                    if (event.suggested) GhostButton("Boka", { onBook(event.id) })
                }
            }
        }
        if (calendar?.connected == true) {
            if (adding) NewEventForm(now, onCancel = { adding = false }, onSave = { event -> onAddEvent(event) { adding = false } })
            else GhostButton("Ny händelse", { adding = true }, Modifier.fillMaxWidth())
        }
    }
}

@Composable
private fun NewEventForm(now: ZonedDateTime, onCancel: () -> Unit, onSave: (NewCalendarEvent) -> Unit) {
    val local = now.withZoneSameInstant(Logic.zone)
    val nextHour = local.plusHours(1).withMinute(0)
    var title by remember { mutableStateOf("") }
    var date by remember { mutableStateOf(local.toLocalDate().toString()) }
    var start by remember { mutableStateOf("%02d:00".format(nextHour.hour)) }
    var end by remember { mutableStateOf("%02d:00".format(nextHour.plusHours(1).hour)) }
    var location by remember { mutableStateOf("") }
    val parsed = Logic.newEvent(title, date, start, end, location)

    Label("Ny händelse", accent = true)
    SettingField("Titel", title) { title = it }
    SettingField("Datum (ÅÅÅÅ-MM-DD)", date) { date = it }
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.weight(1f)) { SettingField("Start", start) { start = it } }
        Box(Modifier.weight(1f)) { SettingField("Slut", end) { end = it } }
    }
    SettingField("Plats", location) { location = it }
    if (title.isNotBlank()) parsed.exceptionOrNull()?.let { Text(it.message ?: "", style = VeloqType.Meta) }
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        PrimaryButton("Lägg in", { parsed.getOrNull()?.let(onSave) }, Modifier.weight(1f), enabled = parsed.isSuccess)
        GhostButton("Avbryt", onCancel)
    }
}
