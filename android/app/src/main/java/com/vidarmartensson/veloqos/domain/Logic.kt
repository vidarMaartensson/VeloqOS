package com.vidarmartensson.veloqos.domain

import com.vidarmartensson.veloqos.data.CalendarEvent
import com.vidarmartensson.veloqos.data.CiState
import com.vidarmartensson.veloqos.data.ProjectStatus
import com.vidarmartensson.veloqos.data.Routine
import com.vidarmartensson.veloqos.data.Chore
import com.vidarmartensson.veloqos.data.ChoreKind
import com.vidarmartensson.veloqos.data.ChoreProject
import com.vidarmartensson.veloqos.data.Job
import com.vidarmartensson.veloqos.data.JobStatus
import com.vidarmartensson.veloqos.data.Project
import com.vidarmartensson.veloqos.data.InboxAction
import com.vidarmartensson.veloqos.data.InboxItem
import com.vidarmartensson.veloqos.data.NewCalendarEvent
import com.vidarmartensson.veloqos.data.LinearIssue
import com.vidarmartensson.veloqos.data.LinearState
import com.vidarmartensson.veloqos.data.LinearTeam
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeParseException
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.time.temporal.ChronoUnit
import java.util.Locale

/** Pure presentation rules shared by the screens, kept here so they can be unit tested. */
object Logic {
    val zone: ZoneId = ZoneId.of("Europe/Stockholm")
    private val sv = Locale.forLanguageTag("sv-SE")
    private val clock = DateTimeFormatter.ofPattern("HH:mm")

    fun greeting(now: ZonedDateTime): String = when (now.withZoneSameInstant(zone).hour) {
        in 0..9 -> "God morgon"
        in 10..11 -> "God förmiddag"
        in 12..17 -> "God eftermiddag"
        else -> "God kväll"
    }

    /** "TORSDAG 29 OKTOBER" */
    fun dateLabel(now: ZonedDateTime): String {
        val local = now.withZoneSameInstant(zone)
        val weekday = local.dayOfWeek.getDisplayName(TextStyle.FULL, sv)
        val month = local.month.getDisplayName(TextStyle.FULL, sv)
        return "$weekday ${local.dayOfMonth} $month".uppercase(sv)
    }

    fun clock(time: OffsetDateTime): String = time.atZoneSameInstant(zone).format(clock)

    // ---- inbox ----

    fun needsYou(items: List<InboxItem>) = items.count { it.handledWith == null && (it.tag == "Åtgärd" || it.tag == "Svar") }

    fun result(action: InboxAction) = when (action) {
        InboxAction.Reply -> "Svar skickat."
        InboxAction.Delegate -> "Veloq OS tar hand om det. Du får en sammanfattning när det är klart."
        InboxAction.Archive -> "Arkiverat."
        InboxAction.Task -> "Lagt som uppgift i projektet."
        InboxAction.Snooze -> "Kommer tillbaka i inkorgen i morgon 08:00."
        InboxAction.Calendar -> "Inlagt i kalendern och svar skickat."
    }

    fun title(action: InboxAction) = when (action) {
        InboxAction.Reply -> "Svara"
        InboxAction.Delegate -> "Låt Veloq OS hantera"
        InboxAction.Archive -> "Arkivera"
        InboxAction.Task -> "Gör till uppgift"
        InboxAction.Snooze -> "Påminn senare"
        InboxAction.Calendar -> "Lägg i kalendern"
    }

    fun rowStatus(item: InboxItem) = item.handledWith?.let(::title) ?: "Förslag: ${item.suggestion}"

    fun relativeDay(time: OffsetDateTime, now: ZonedDateTime): String {
        val day = time.atZoneSameInstant(zone).toLocalDate()
        val today = now.withZoneSameInstant(zone).toLocalDate()
        return when (val days = ChronoUnit.DAYS.between(day, today)) {
            0L -> clock(time)
            1L -> "Igår"
            in 2L..6L -> day.dayOfWeek.getDisplayName(TextStyle.SHORT, sv).trimEnd('.').replaceFirstChar { it.uppercase(sv) }
            else -> if (days < 0) clock(time) else "${day.dayOfMonth}/${day.monthValue}"
        }
    }

    // ---- calendar ----

    enum class Phase { Past, Now, Upcoming }

    fun phase(event: CalendarEvent, now: ZonedDateTime): Phase {
        val t = now.toInstant()
        return when {
            !t.isBefore(event.end.toInstant()) -> Phase.Past
            !t.isBefore(event.start.toInstant()) -> Phase.Now
            else -> Phase.Upcoming
        }
    }

    /** "30 min", "2 h", "1,5 h" */
    fun duration(event: CalendarEvent): String {
        val minutes = ChronoUnit.MINUTES.between(event.start, event.end)
        if (minutes < 60) return "$minutes min"
        val hours = minutes / 60.0
        return if (hours % 1.0 == 0.0) "${hours.toInt()} h" else "${"%.1f".format(Locale.US, hours).replace('.', ',')} h"
    }

    // ---- new calendar event ----

    /**
     * Reads the new-event form (date "2026-11-02", times "10:00") as Stockholm time.
     * Fails with a sentence for the user when something is missing or out of order.
     */
    fun newEvent(title: String, date: String, start: String, end: String, location: String): Result<NewCalendarEvent> {
        if (title.isBlank()) return Result.failure(IllegalArgumentException("Ge händelsen en titel."))
        return try {
            val day = LocalDate.parse(date.trim())
            val from = day.atTime(LocalTime.parse(start.trim())).atZone(zone).toOffsetDateTime()
            val to = day.atTime(LocalTime.parse(end.trim())).atZone(zone).toOffsetDateTime()
            if (!to.isAfter(from)) Result.failure(IllegalArgumentException("Slutet måste ligga efter starten."))
            else Result.success(NewCalendarEvent(title.trim(), from, to, location.trim().ifEmpty { null }))
        } catch (e: DateTimeParseException) {
            Result.failure(IllegalArgumentException("Skriv datum som ÅÅÅÅ-MM-DD och tider som TT:MM."))
        }
    }

    val priorities = listOf("Ingen", "Brådskande", "Hög", "Medel", "Låg")

    /** Issues under their team's states in Linear's order; empty states are left out. */
    fun groupByState(team: LinearTeam?, issues: List<LinearIssue>): List<Pair<LinearState, List<LinearIssue>>> {
        val states = (team?.states ?: emptyList()) + issues.map { it.state }.filter { s -> team?.states?.none { it.id == s.id } ?: true }.distinctBy { it.id }
        return states.map { s -> s to issues.filter { it.state.id == s.id } }.filter { it.second.isNotEmpty() }
    }

    /** Teams under their workspace name, keeping the API's order (key order, then name). */
    fun teamsByWorkspace(teams: List<LinearTeam>): List<Pair<String, List<LinearTeam>>> =
        teams.groupBy { it.workspaceId }.values.map { it.first().workspace to it }

    fun storiesTitle(open: Int): String = when (open) {
        0 -> "Inget öppet."
        1 -> "En öppen story."
        else -> "$open öppna stories."
    }

    // ---- chores and jobs ----

    /** Built-ins first, then your skills – the API's order within each. */
    fun builtins(chores: List<Chore>) = chores.filter { it.kind == ChoreKind.Chore }
    fun skills(chores: List<Chore>) = chores.filter { it.kind == ChoreKind.Skill }

    /** A chore that runs in a project or takes an addition opens the run dialog; the rest run directly. */
    fun needsDialog(chore: Chore) = chore.project != ChoreProject.None || chore.argument != null

    /** Only projects with a folder on the computer can be picked. */
    fun runnableProjects(chore: Chore, projects: List<Project>): List<Project> =
        if (chore.project == ChoreProject.None) emptyList() else projects.filter { it.repoPath != null }

    fun canRun(chore: Chore, projectId: String?) = chore.project != ChoreProject.Required || projectId != null

    /** "Kör /pr." */
    fun runTitle(chore: Chore) = "Kör ${chore.name}."

    /** "KÖR · VELOQ OS", "KLART", "MISSLYCKADES · HALODECK" (Label uppercases). */
    fun jobLabel(job: Job): String {
        val status = when {
            job.status == JobStatus.Running -> "Kör"
            job.status == JobStatus.Failed -> "Misslyckades"
            job.waiting -> "Väntar på dig"
            else -> "Klart"
        }
        return listOfNotNull(status, job.project).joinToString(" · ")
    }

    /** Ticks or unticks [choiceId]; what the confirm button sends is the ticked ids in the job's order. */
    fun toggle(ticked: Set<String>, choiceId: String) = if (choiceId in ticked) ticked - choiceId else ticked + choiceId

    fun picked(job: Job, ticked: Set<String>): List<String> = job.choices.orEmpty().map { it.id }.filter { it in ticked }

    /** The first line with text in it, trimmed; null when there is none. */
    fun firstLine(text: String?): String? = text?.lineSequence()?.map { it.trim() }?.firstOrNull { it.isNotEmpty() }

    // ---- routines ----

    /** "fre 07:40" – the weekday when it is within a week, otherwise "2/11 07:40". */
    fun runTime(time: OffsetDateTime, now: ZonedDateTime): String {
        val local = time.atZoneSameInstant(zone)
        val days = ChronoUnit.DAYS.between(now.withZoneSameInstant(zone).toLocalDate(), local.toLocalDate())
        val day = if (days in -6L..6L) local.dayOfWeek.getDisplayName(TextStyle.SHORT, sv).trimEnd('.') else "${local.dayOfMonth}/${local.monthValue}"
        return "$day ${clock(time)}"
    }

    /** "Nästa · fre 07:40 · senast · tor 07:40" (Label uppercases); null when neither is set. */
    fun routineTimes(routine: Routine, now: ZonedDateTime): String? = listOfNotNull(
        routine.nextRunAt?.let { "Nästa · ${runTime(it, now)}" },
        routine.lastRunAt?.let { "Senast · ${runTime(it, now)}" },
    ).joinToString(" · ").ifEmpty { null }

    // ---- project status ----

    fun changesLabel(changes: Int) = when (changes) {
        0 -> "Inga ändringar"
        1 -> "1 ocommittad fil"
        else -> "$changes ocommittade filer"
    }

    /** Null when the computer cannot tell (no gh or not on GitHub). */
    fun pullRequestsLabel(count: Int?) = when (count) {
        null -> null
        0 -> "Inga PR:er"
        1 -> "1 öppen PR"
        else -> "$count öppna PR:er"
    }

    fun ciLabel(ci: CiState?) = when (ci) {
        CiState.Passing -> "CI grönt"
        CiState.Failing -> "CI rött"
        CiState.Running -> "CI kör"
        null -> null
    }

    /** "feature/x · 12 ocommittade filer · 1 öppen PR" – CI is shown on its own so red can be red. */
    fun statusSummary(status: ProjectStatus): String = status.error ?: listOfNotNull(
        status.branch,
        changesLabel(status.changes),
        pullRequestsLabel(status.pullRequests),
    ).joinToString(" · ")

    /** "2 commits att pusha", null when everything is pushed or there is no upstream. */
    fun aheadLabel(ahead: Int?) = when {
        ahead == null || ahead <= 0 -> null
        ahead == 1 -> "1 commit att pusha"
        else -> "$ahead commits att pusha"
    }

    // ---- notifications ----

    /** [notify]: newly finished jobs, oldest first. [seen]: what to store as the last finishedAt seen. */
    data class Notify(val notify: List<Job>, val seen: OffsetDateTime?)

    /**
     * Which finished jobs to notify about. With nothing seen yet (the first run) it only records the
     * newest finishedAt, so old jobs never show up as notifications.
     */
    fun jobsToNotify(jobs: List<Job>, lastSeen: OffsetDateTime?): Notify {
        val finished = jobs.filter { it.finishedAt != null && !it.running }.sortedBy { it.finishedAt!!.toInstant() }
        val newest = finished.lastOrNull()?.finishedAt
        if (lastSeen == null) return Notify(emptyList(), newest)
        val fresh = finished.filter { it.finishedAt!!.toInstant().isAfter(lastSeen.toInstant()) }
        return Notify(fresh, fresh.lastOrNull()?.finishedAt ?: lastSeen)
    }

    /** Title and text for a finished job's notification. */
    fun notification(job: Job): Pair<String, String> {
        val title = if (job.choreId == "morning-brief" && !job.failed) "Morgonbriefen är klar." else job.title
        val line = firstLine(job.result)
        val text = when {
            job.failed -> if (line != null) "Misslyckades – $line" else "Misslyckades"
            job.waiting -> "Väntar på ditt val"
            else -> line ?: "Klart."
        }
        return title to text
    }
}
