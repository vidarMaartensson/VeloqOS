package com.vidarmartensson.veloqos

import com.vidarmartensson.veloqos.data.CalendarEvent
import com.vidarmartensson.veloqos.data.CiState
import com.vidarmartensson.veloqos.data.ProjectStatus
import com.vidarmartensson.veloqos.data.Routine
import com.vidarmartensson.veloqos.data.Chore
import com.vidarmartensson.veloqos.data.ChoreKind
import com.vidarmartensson.veloqos.data.ChoreProject
import com.vidarmartensson.veloqos.data.Job
import com.vidarmartensson.veloqos.data.JobChoice
import com.vidarmartensson.veloqos.data.JobStatus
import com.vidarmartensson.veloqos.data.Project
import com.vidarmartensson.veloqos.data.InboxAction
import com.vidarmartensson.veloqos.data.InboxItem
import com.vidarmartensson.veloqos.data.LinearIssue
import com.vidarmartensson.veloqos.data.LinearState
import com.vidarmartensson.veloqos.data.LinearTeam
import com.vidarmartensson.veloqos.domain.Logic
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.OffsetDateTime
import java.time.ZonedDateTime

class LogicTest {
    private val now: ZonedDateTime = ZonedDateTime.of(2026, 10, 29, 15, 20, 0, 0, Logic.zone)

    private fun at(text: String) = OffsetDateTime.parse(text)

    private fun item(tag: String, handled: InboxAction? = null) =
        InboxItem("id", "GitHub", at("2026-10-29T14:52:00+01:00"), "s", tag, "s", InboxAction.Archive, "arkivera", null, handled)

    private fun event(start: String, end: String, suggested: Boolean = false) =
        CalendarEvent("e", "t", at(start), at(end), null, suggested)

    @Test
    fun `greets by Stockholm time`() {
        assertEquals("God morgon", Logic.greeting(now.withHour(8)))
        assertEquals("God förmiddag", Logic.greeting(now.withHour(10).withMinute(36)))
        assertEquals("God eftermiddag", Logic.greeting(now.withHour(12).withMinute(0)))
        assertEquals("God eftermiddag", Logic.greeting(now))
        assertEquals("God kväll", Logic.greeting(now.withHour(20)))
    }

    @Test
    fun `labels the date in Swedish capitals`() {
        assertEquals("TORSDAG 29 OKTOBER", Logic.dateLabel(now))
    }

    @Test
    fun `counts unhandled action and reply items`() {
        val items = listOf(item("Åtgärd"), item("Svar"), item("Svar", InboxAction.Reply), item("Info"), item("Brus"))
        assertEquals(2, Logic.needsYou(items))
    }

    @Test
    fun `describes a row by suggestion or result`() {
        assertEquals("Förslag: arkivera", Logic.rowStatus(item("Info")))
        assertEquals("Arkivera", Logic.rowStatus(item("Info", InboxAction.Archive)))
        assertEquals("Arkiverat.", Logic.result(InboxAction.Archive))
    }

    @Test
    fun `shows times relative to today`() {
        assertEquals("14:52", Logic.relativeDay(at("2026-10-29T14:52:00+01:00"), now))
        assertEquals("Igår", Logic.relativeDay(at("2026-10-28T09:00:00+01:00"), now))
        assertEquals("Mån", Logic.relativeDay(at("2026-10-26T09:00:00+01:00"), now))
    }

    @Test
    fun `knows past, now and upcoming events`() {
        assertEquals(Logic.Phase.Past, Logic.phase(event("2026-10-29T08:30:00+01:00", "2026-10-29T09:00:00+01:00"), now))
        assertEquals(Logic.Phase.Now, Logic.phase(event("2026-10-29T15:00:00+01:00", "2026-10-29T16:00:00+01:00"), now))
        assertEquals(Logic.Phase.Upcoming, Logic.phase(event("2026-10-29T18:30:00+01:00", "2026-10-29T20:00:00+01:00"), now))
    }

    @Test
    fun `formats durations`() {
        assertEquals("30 min", Logic.duration(event("2026-10-29T08:30:00+01:00", "2026-10-29T09:00:00+01:00")))
        assertEquals("2 h", Logic.duration(event("2026-10-29T09:00:00+01:00", "2026-10-29T11:00:00+01:00")))
        assertEquals("1,5 h", Logic.duration(event("2026-10-29T18:30:00+01:00", "2026-10-29T20:00:00+01:00")))
    }

    @Test
    fun `reads the new-event form as Stockholm time`() {
        val winter = Logic.newEvent(" Tandläkare ", "2026-11-02", "10:00", "10:45", " ").getOrThrow()
        assertEquals("Tandläkare", winter.title)
        assertEquals(at("2026-11-02T10:00:00+01:00"), winter.start)
        assertEquals(at("2026-11-02T10:45:00+01:00"), winter.end)
        assertNull(winter.location)

        assertEquals(at("2026-07-01T10:00:00+02:00"), Logic.newEvent("Möte", "2026-07-01", "10:00", "11:00", "").getOrThrow().start)
    }

    @Test
    fun `explains what is wrong with the new-event form`() {
        assertEquals("Ge händelsen en titel.", Logic.newEvent(" ", "2026-11-02", "10:00", "11:00", "").exceptionOrNull()?.message)
        assertEquals("Slutet måste ligga efter starten.", Logic.newEvent("Möte", "2026-11-02", "10:00", "10:00", "").exceptionOrNull()?.message)
        assertTrue(Logic.newEvent("Möte", "2 nov", "10", "11:00", "").exceptionOrNull()!!.message!!.contains("ÅÅÅÅ-MM-DD"))
    }

    @Test
    fun `groups Linear issues by the team states in order`() {
        val todo = LinearState("todo", "Todo", "unstarted", "")
        val doing = LinearState("doing", "In Progress", "started", "")
        val review = LinearState("review", "Review", "started", "")
        val team = LinearTeam("t", "VEL", "Veloq", "w", "Veloq Labs", listOf(todo, doing, review))
        fun issue(id: String, state: LinearState) =
            LinearIssue(id, id, id, null, 0, "Ingen", "", state, null, OffsetDateTime.parse("2026-10-30T09:00:00Z"))

        val groups = Logic.groupByState(team, listOf(issue("b", doing), issue("a", todo), issue("c", doing)))

        assertEquals(listOf("Todo", "In Progress"), groups.map { it.first.name })
        assertEquals(listOf("b", "c"), groups[1].second.map { it.id })
    }

    @Test
    fun `keeps teams under their workspace in the API order`() {
        val teams = listOf(
            LinearTeam("a", "VEL", "Veloq", "w1", "Veloq Labs", emptyList()),
            LinearTeam("b", "HAL", "Halo", "w1", "Veloq Labs", emptyList()),
            LinearTeam("c", "PLA", "Plattform", "w2", "Jobbet", emptyList()),
        )

        val groups = Logic.teamsByWorkspace(teams)

        assertEquals(listOf("Veloq Labs", "Jobbet"), groups.map { it.first })
        assertEquals(listOf("VEL", "HAL"), groups[0].second.map { it.key })
    }

    @Test
    fun `titles open stories as a sentence`() {
        assertEquals("Inget öppet.", Logic.storiesTitle(0))
        assertEquals("En öppen story.", Logic.storiesTitle(1))
        assertEquals("4 öppna stories.", Logic.storiesTitle(4))
    }

    // ---- chores and jobs ----

    private val cache = Chore("disk-cleanup", "Rensa cache", "d", "disk", "≈ 1 min")
    private val unused = Chore("unused-packages", "Oanvända paket", "d", "package", "≈ 3 min", project = ChoreProject.Required)
    private val deps = Chore("dependencies", "Kolla beroenden", "d", "package", "≈ 3 min", project = ChoreProject.Optional)
    private val pr = Chore("skill-pr", "/pr", "d", "skill", "Skill", ChoreKind.Skill, argument = "branchnamn")
    private val projects = listOf(
        Project("veloq-os", "Veloq OS", "m", "s", 3, "b", "Verktyg", repoPath = "/r/VeloqOS"),
        Project("quizter", "Quizter", "m", "s", 1, "b", "Appar"),
    )

    @Test
    fun `splits built-in chores from skills`() {
        val all = listOf(cache, unused, pr)
        assertEquals(listOf(cache, unused), Logic.builtins(all))
        assertEquals(listOf(pr), Logic.skills(all))
    }

    @Test
    fun `opens the run dialog only when there is something to choose`() {
        assertFalse(Logic.needsDialog(cache))
        assertTrue(Logic.needsDialog(unused))
        assertTrue(Logic.needsDialog(deps))
        assertTrue(Logic.needsDialog(pr))
        assertEquals("Kör /pr.", Logic.runTitle(pr))
    }

    @Test
    fun `offers only projects with a folder and requires one when the chore does`() {
        assertEquals(listOf("veloq-os"), Logic.runnableProjects(unused, projects).map { it.id })
        assertTrue(Logic.runnableProjects(cache, projects).isEmpty())
        assertFalse(Logic.canRun(unused, null))
        assertTrue(Logic.canRun(unused, "veloq-os"))
        assertTrue(Logic.canRun(deps, null))
        assertTrue(Logic.canRun(pr, null))
    }

    private fun job(status: JobStatus, project: String? = null, choices: List<JobChoice>? = null) =
        Job("j", "c", "t", "s", 1f, status, null, project, choices, choices?.let { "Rensa valda" })

    @Test
    fun `labels a job by status and project`() {
        val choice = listOf(JobChoice("gradle", "Gradle", "~/.gradle/caches · 9,8 GB"))
        assertEquals("Kör · Veloq OS", Logic.jobLabel(job(JobStatus.Running, "Veloq OS")))
        assertEquals("Klart", Logic.jobLabel(job(JobStatus.Done)))
        assertEquals("Misslyckades · Quizter", Logic.jobLabel(job(JobStatus.Failed, "Quizter")))
        assertEquals("Väntar på dig", Logic.jobLabel(job(JobStatus.Done, choices = choice)))
        assertFalse(job(JobStatus.Done, choices = emptyList()).waiting)
    }

    @Test
    fun `ticks choices and sends them in the job's order`() {
        val j = job(JobStatus.Done, choices = listOf(JobChoice("a", "A", ""), JobChoice("b", "B", ""), JobChoice("c", "C", "")))
        val ticked = Logic.toggle(Logic.toggle(Logic.toggle(emptySet(), "c"), "a"), "x")
        assertEquals(setOf("a", "c", "x"), ticked)
        assertEquals(listOf("a", "c"), Logic.picked(j, ticked))
        assertEquals(setOf("c", "x"), Logic.toggle(ticked, "a"))
    }

    // ---- routines ----

    @Test
    fun `labels a routine's next and last run by Stockholm weekday`() {
        // now is Thursday 29 October 15:20.
        val brief = Routine("morning-brief", "Morgonbrief", "Vardagar · 07:40", "d", true, "morning-brief",
            nextRunAt = at("2026-10-30T07:40:00+01:00"), lastRunAt = at("2026-10-29T06:40:00Z"))
        val off = Routine("r", "R", "s", "d", false)
        val far = Routine("r", "R", "s", "d", true, nextRunAt = at("2026-11-08T20:00:00+01:00"))

        assertEquals("Nästa · fre 07:40 · Senast · tors 07:40", Logic.routineTimes(brief, now))
        assertNull(Logic.routineTimes(off, now))
        assertEquals("Nästa · 8/11 20:00", Logic.routineTimes(far, now))
    }

    // ---- project status ----

    private fun status(changes: Int = 0, pullRequests: Int? = null, ci: CiState? = null, error: String? = null, ahead: Int? = null) =
        ProjectStatus("veloq-os", "feature/x", changes, ahead, null, pullRequests, ci, null, false, error)

    @Test
    fun `summarises git and PRs and labels CI on its own`() {
        assertEquals("feature/x · 12 ocommittade filer · 1 öppen PR", Logic.statusSummary(status(12, 1)))
        assertEquals("feature/x · 1 ocommittad fil · 3 öppna PR:er", Logic.statusSummary(status(1, 3)))
        assertEquals("feature/x · Inga ändringar", Logic.statusSummary(status()))
        assertEquals("feature/x · Inga ändringar · Inga PR:er", Logic.statusSummary(status(pullRequests = 0)))
        assertEquals("Inte ett git-repo.", Logic.statusSummary(status(error = "Inte ett git-repo.")))
        assertEquals("CI rött", Logic.ciLabel(CiState.Failing))
        assertEquals("CI grönt", Logic.ciLabel(CiState.Passing))
        assertEquals("CI kör", Logic.ciLabel(CiState.Running))
        assertNull(Logic.ciLabel(null))
        assertEquals("2 commits att pusha", Logic.aheadLabel(2))
        assertNull(Logic.aheadLabel(0))
        assertNull(Logic.aheadLabel(null))
    }

    // ---- notifications ----

    private fun finished(id: String, at: String?, status: JobStatus = JobStatus.Done, result: String? = "Klart.") =
        Job(id, "x", "Jobb $id", "Klart", 1f, status, result, finishedAt = at?.let(::at))

    @Test
    fun `the first check only records the newest finished job`() {
        val jobs = listOf(finished("b", "2026-10-30T09:05:00+01:00"), finished("a", "2026-10-30T09:00:00+01:00"), finished("r", null, JobStatus.Running, null))
        val first = Logic.jobsToNotify(jobs, lastSeen = null)
        assertTrue(first.notify.isEmpty())
        assertEquals(at("2026-10-30T09:05:00+01:00"), first.seen)

        assertEquals(Logic.Notify(emptyList(), null), Logic.jobsToNotify(emptyList(), null))
    }

    @Test
    fun `notifies about jobs finished after the last seen, oldest first`() {
        val lastSeen = at("2026-10-30T09:00:00+01:00")
        val jobs = listOf(
            finished("c", "2026-10-30T08:10:00Z"), // 09:10 Stockholm – compared as instants
            finished("b", "2026-10-30T09:05:00+01:00"),
            finished("a", "2026-10-30T09:00:00+01:00"), // already seen
            finished("r", null, JobStatus.Running, null),
        )
        val decision = Logic.jobsToNotify(jobs, lastSeen)
        assertEquals(listOf("b", "c"), decision.notify.map { it.id })
        assertEquals(at("2026-10-30T08:10:00Z"), decision.seen)

        val again = Logic.jobsToNotify(jobs, decision.seen)
        assertTrue(again.notify.isEmpty())
        assertEquals(decision.seen, again.seen)
    }

    @Test
    fun `words a notification by how the job ended`() {
        assertEquals("Jobb a" to "Frigjorde 9,8 GB.", Logic.notification(finished("a", null, result = "\n  Frigjorde 9,8 GB.\nMer text.")))
        assertEquals("Jobb a" to "Misslyckades – claude saknas", Logic.notification(finished("a", null, JobStatus.Failed, "claude saknas\nstack")))
        assertEquals("Jobb a" to "Misslyckades", Logic.notification(finished("a", null, JobStatus.Failed, null)))
        assertEquals("Jobb a" to "Klart.", Logic.notification(finished("a", null, result = null)))
        val waiting = finished("w", null, result = "Hittade 14,2 GB.").copy(choices = listOf(JobChoice("gradle", "Gradle", "9,8 GB")), confirm = "Rensa valda")
        assertEquals("Jobb w" to "Väntar på ditt val", Logic.notification(waiting))
        val brief = finished("m", null, result = "Tre möten idag.").copy(choreId = "morning-brief")
        assertEquals("Morgonbriefen är klar." to "Tre möten idag.", Logic.notification(brief))
    }
}
