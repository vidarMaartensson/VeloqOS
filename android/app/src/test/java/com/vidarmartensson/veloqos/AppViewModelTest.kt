package com.vidarmartensson.veloqos

import com.vidarmartensson.veloqos.data.ApiException
import com.vidarmartensson.veloqos.data.Brief
import com.vidarmartensson.veloqos.data.CalendarDay
import com.vidarmartensson.veloqos.data.CalendarEvent
import com.vidarmartensson.veloqos.data.CiState
import com.vidarmartensson.veloqos.data.Disk
import com.vidarmartensson.veloqos.data.Chore
import com.vidarmartensson.veloqos.data.ChoreKind
import com.vidarmartensson.veloqos.data.ChoreProject
import com.vidarmartensson.veloqos.data.InboxAction
import com.vidarmartensson.veloqos.data.InboxItem
import com.vidarmartensson.veloqos.data.Job
import com.vidarmartensson.veloqos.data.JobChoice
import com.vidarmartensson.veloqos.data.JobStatus
import com.vidarmartensson.veloqos.data.LinearIssue
import com.vidarmartensson.veloqos.data.LinearState
import com.vidarmartensson.veloqos.data.LinearStatus
import com.vidarmartensson.veloqos.data.LinearTeam
import com.vidarmartensson.veloqos.data.LinearWorkspace
import com.vidarmartensson.veloqos.data.NewLinearIssue
import com.vidarmartensson.veloqos.data.NewCalendarEvent
import com.vidarmartensson.veloqos.data.Overview
import com.vidarmartensson.veloqos.data.Project
import com.vidarmartensson.veloqos.data.ProjectStatus
import com.vidarmartensson.veloqos.data.Routine
import com.vidarmartensson.veloqos.data.SystemInfo
import com.vidarmartensson.veloqos.data.VeloqApi
import com.vidarmartensson.veloqos.ui.AppViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.IOException
import java.time.LocalDate
import java.time.OffsetDateTime

@OptIn(ExperimentalCoroutinesApi::class)
class AppViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    private val day = LocalDate.of(2026, 10, 29)

    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    /** In-memory API with just enough behaviour for the ViewModel. */
    private class FakeApi : VeloqApi {
        var failNext = false
        var connected = false
        var jobPolls = 0
        val added = mutableListOf<CalendarEvent>()
        val linearCalls = mutableListOf<Pair<String, Boolean>>()
        val stories = mutableListOf(story("VEL-1", todo))
        var linearError: Exception? = null
        val inbox = mutableListOf(
            InboxItem("m1", "GitHub", OffsetDateTime.parse("2026-10-29T14:52:00+01:00"), "CI", "Åtgärd", "s", InboxAction.Delegate, "fix", null, null),
        )

        override suspend fun overview(): Overview {
            if (failNext) { failNext = false; throw IOException("nere") }
            return Overview(1, 1, 0, inbox.count { it.handledWith == null }, 1, 1, 0)
        }
        override suspend fun projects() = listOf(
            Project("p", "HaloDeck", "m", "I utveckling", 3, "b", "Appar", repoPath = "/repos/HaloDeck", linearTeam = "HAL"),
            Project("q", "Quizter", "m", "På paus", 1, "b", "Appar", linearTeam = "QUI"),
        )
        var diskLow = true
        override suspend fun system() = SystemInfo(Disk(3_435_973_836, 494_384_795_648, "3,2 GB ledigt av 460 GB", diskLow))
        var statusError: Exception? = null
        override suspend fun projectStatus(): List<ProjectStatus> {
            statusError?.let { throw it }
            return listOf(ProjectStatus("p", "feature/x", 12, 2, null, 1, CiState.Failing, null, true, null))
        }
        val storyCalls = mutableListOf<String>()
        var storiesError: Exception? = null
        override suspend fun stories(projectId: String): List<LinearIssue> {
            storiesError?.let { throw it }
            storyCalls += projectId
            return listOf(story("HAL-7", todo, "Restart-knapp").copy(description = "Starta om API:t."))
        }
        var briefText: String? = null
        override suspend fun brief() = briefText?.let { Brief(it, OffsetDateTime.parse("2026-10-29T07:41:00+01:00"), "b") }
        val routineRuns = mutableListOf<String>()
        override suspend fun runRoutine(id: String): Job {
            routineRuns += id
            // Running now, done at the next poll.
            val job = Job("rb", id, "Morgonbrief", "Kör…", 0f, JobStatus.Running, null)
            jobList = listOf(job.copy(status = JobStatus.Done, progress = 1f, result = "Klar.")) + jobList
            return job
        }
        override suspend fun chores() = listOf(
            Chore("memory-cleanup", "Städa minnet", "d", "memory", "≈ 1 min"),
            Chore("unused-packages", "Oanvända paket", "d", "package", "≈ 3 min", project = ChoreProject.Required),
            Chore("skill-pr", "/pr", "d", "skill", "Skill", ChoreKind.Skill, ChoreProject.Optional, argument = "branchnamn"),
        )
        val runs = mutableListOf<Triple<String, String?, String?>>()
        var runError: Exception? = null
        override suspend fun runChore(id: String, projectId: String?, argument: String?): Job {
            runError?.let { throw it }
            runs += Triple(id, projectId, argument)
            return Job("j", id, "Städa minnet", "Kör…", 0f, JobStatus.Running, null)
        }
        var jobList = listOf(Job("j", "memory-cleanup", "Städa minnet", "Klart", 1f, JobStatus.Done, "Klart."))
        override suspend fun jobs(): List<Job> {
            jobPolls++
            return jobList
        }
        val confirms = mutableListOf<Pair<String, List<String>>>()
        var confirmError: Exception? = null
        override suspend fun confirmJob(id: String, choiceIds: List<String>): Job {
            confirmError?.let { throw it }
            confirms += id to choiceIds
            // The old job stops waiting; the new one runs once and is done at the next poll.
            jobList = listOf(Job("c", "disk-cleanup", "Rensa cache", "Klart", 1f, JobStatus.Done, "Frigjorde 9,8 GB.")) +
                jobList.map { if (it.id == id) it.copy(choices = null, confirm = null) else it }
            return Job("c", "disk-cleanup", "Rensa cache", "Kör…", 0f, JobStatus.Running, null)
        }
        override suspend fun routines() = listOf(Routine("r", "Morgonbrief", "Vardagar · 07:40", "d", true))
        override suspend fun setRoutine(id: String, enabled: Boolean) = Routine(id, "Morgonbrief", "Vardagar · 07:40", "d", enabled)
        override suspend fun inbox() = inbox.toList()
        override suspend fun act(id: String, action: InboxAction, body: String?): InboxItem {
            val i = inbox.indexOfFirst { it.id == id }
            inbox[i] = inbox[i].copy(handledWith = action)
            return inbox[i]
        }
        override suspend fun undo(id: String): InboxItem {
            val i = inbox.indexOfFirst { it.id == id }
            inbox[i] = inbox[i].copy(handledWith = null)
            return inbox[i]
        }
        override suspend fun calendar(date: LocalDate) = CalendarDay(
            connected, date,
            if (connected) listOf(CalendarEvent("e", "Fokus", OffsetDateTime.parse("2026-10-29T09:00:00+01:00"), OffsetDateTime.parse("2026-10-29T11:00:00+01:00"), null, true)) + added else emptyList(),
        )
        override suspend fun createEvent(event: NewCalendarEvent): CalendarEvent {
            if (!connected) throw IOException("POST /calendar/events gav 409")
            return CalendarEvent("added-${added.size}", event.title, event.start, event.end, event.location, false).also { added += it }
        }
        override suspend fun connectCalendar(): String? { connected = true; return null }
        override suspend fun book(id: String) {}
        override suspend fun linear() = LinearStatus(
            configured = true,
            workspaces = listOf(LinearWorkspace("w-veloq", "Veloq Labs", null), LinearWorkspace("w-jobb", "Jobbet", null)),
        )
        override suspend fun linearTeams() = teams
        override suspend fun linearIssues(teamId: String, open: Boolean): List<LinearIssue> {
            linearCalls += teamId to open
            return stories.toList()
        }
        override suspend fun createLinearIssue(issue: NewLinearIssue): LinearIssue {
            linearError?.let { throw it }
            return story("VEL-${stories.size + 1}", todo, issue.title).also { stories += it }
        }
    }

    private companion object {
        val todo = LinearState("todo", "Todo", "unstarted", "#e2e2e2")
        val teams = listOf(
            LinearTeam("t-veloq", "VEL", "Veloq", "w-veloq", "Veloq Labs", listOf(todo)),
            LinearTeam("t-halo", "HAL", "Halo", "w-veloq", "Veloq Labs", listOf(todo)),
            LinearTeam("t-plattform", "PLA", "Plattform", "w-jobb", "Jobbet", listOf(todo)),
        )

        fun story(id: String, state: LinearState, title: String = "Story $id") =
            LinearIssue(id, id, title, null, 0, "Ingen", "https://linear.app/x/$id", state, null, OffsetDateTime.parse("2026-10-30T09:00:00Z"))
    }

    private fun viewModel(api: FakeApi = FakeApi()) = AppViewModel(api, today = { day }, pollMillis = 1_000)

    @Test
    fun `loads everything on start`() = runTest(dispatcher) {
        val vm = viewModel()
        advanceUntilIdle()
        val s = vm.state.value
        assertFalse(s.loading)
        assertNull(s.error)
        assertEquals(listOf("HaloDeck", "Quizter"), s.projects.map { it.name })
        assertEquals(1, s.needsYou)
        assertFalse(s.calendar!!.connected)
    }

    @Test
    fun `running a chore adds a job and polls until it is done`() = runTest(dispatcher) {
        val api = FakeApi()
        val vm = viewModel(api)
        advanceUntilIdle()
        val pollsBefore = api.jobPolls

        vm.runChore("memory-cleanup")
        advanceTimeBy(1_500)

        assertTrue(api.jobPolls > pollsBefore)
        assertFalse(vm.state.value.choreState("memory-cleanup")!!.running)
    }

    @Test
    fun `acting on mail updates the item and undo restores it`() = runTest(dispatcher) {
        val vm = viewModel()
        advanceUntilIdle()

        vm.act("m1", InboxAction.Archive)
        advanceUntilIdle()
        assertEquals(InboxAction.Archive, vm.state.value.inbox.single().handledWith)
        assertEquals(0, vm.state.value.needsYou)

        vm.undo("m1")
        advanceUntilIdle()
        assertNull(vm.state.value.inbox.single().handledWith)
    }

    @Test
    fun `connecting the calendar loads the day`() = runTest(dispatcher) {
        val vm = viewModel()
        advanceUntilIdle()

        vm.connectCalendar(openUrl = { error("should not open a browser for the sample provider") })
        advanceUntilIdle()

        assertTrue(vm.state.value.calendar!!.connected)
        assertTrue(vm.state.value.calendar!!.events.single().suggested)
    }

    @Test
    fun `opening Linear loads the first team and reloads on changes`() = runTest(dispatcher) {
        val api = FakeApi()
        val vm = viewModel(api)
        advanceUntilIdle()

        vm.openLinear()
        advanceUntilIdle()
        assertEquals(listOf("Veloq Labs", "Jobbet"), vm.state.value.linear.status?.workspaces?.map { it.name })
        assertEquals("t-veloq", vm.state.value.linear.teamId)
        assertEquals(1, vm.state.value.linear.issues.size)

        vm.pickTeam("t-plattform")
        advanceUntilIdle()
        assertEquals("Jobbet", vm.state.value.linear.team?.workspace)
        vm.setShowDone(true)
        advanceUntilIdle()
        assertEquals(listOf("t-veloq" to true, "t-plattform" to true, "t-plattform" to false), api.linearCalls)
    }

    @Test
    fun `creating a story reloads the list and closes the form`() = runTest(dispatcher) {
        val api = FakeApi()
        val vm = viewModel(api)
        advanceUntilIdle()
        vm.openLinear()
        advanceUntilIdle()

        var closed = false
        vm.createStory(NewLinearIssue("t-veloq", "Restart-knapp", null, 2, null)) { closed = true }
        advanceUntilIdle()

        assertTrue(closed)
        assertTrue(vm.state.value.linear.issues.any { it.title == "Restart-knapp" })
    }

    @Test
    fun `a Linear error stays in the Linear tab`() = runTest(dispatcher) {
        val api = FakeApi().apply { linearError = ApiException(502, "Linear: Authentication required") }
        val vm = viewModel(api)
        advanceUntilIdle()
        vm.openLinear()
        advanceUntilIdle()

        var closed = false
        vm.createStory(NewLinearIssue("t-veloq", "X", null, 0, null)) { closed = true }
        advanceUntilIdle()

        assertFalse(closed)
        assertEquals("Linear: Authentication required", vm.state.value.linear.error)
        assertNull(vm.state.value.error)
    }

    @Test
    fun `errors are shown and can be dismissed`() = runTest(dispatcher) {
        val api = FakeApi().apply { failNext = true }
        val vm = viewModel(api)
        advanceUntilIdle()
        assertNotNull(vm.state.value.error)

        vm.dismissError()
        vm.refresh()
        advanceUntilIdle()
        assertNull(vm.state.value.error)
    }

    private val dentist = NewCalendarEvent(
        "Tandläkare", OffsetDateTime.parse("2026-10-29T16:00:00+01:00"), OffsetDateTime.parse("2026-10-29T16:45:00+01:00"), null,
    )

    @Test
    fun `adding an event reloads the day and closes the form`() = runTest(dispatcher) {
        val vm = viewModel()
        advanceUntilIdle()
        vm.connectCalendar(openUrl = {})
        advanceUntilIdle()

        var done = false
        vm.addEvent(dentist) { done = true }
        advanceUntilIdle()

        assertTrue(done)
        assertTrue(vm.state.value.calendar!!.events.any { it.title == "Tandläkare" })
    }

    @Test
    fun `a refused event keeps the form open and shows the error`() = runTest(dispatcher) {
        val vm = viewModel()
        advanceUntilIdle()

        var done = false
        vm.addEvent(dentist) { done = true }
        advanceUntilIdle()

        assertFalse(done)
        assertNotNull(vm.state.value.error)
    }

    // ---- chores, skills and jobs ----

    @Test
    fun `a chore without project or addition runs directly`() = runTest(dispatcher) {
        val api = FakeApi()
        val vm = viewModel(api)
        advanceUntilIdle()

        vm.runChore("memory-cleanup")
        advanceUntilIdle()

        assertNull(vm.state.value.choreRun)
        assertEquals(listOf(Triple("memory-cleanup", null, null)), api.runs)
    }

    @Test
    fun `a chore that needs a project runs only once one is picked`() = runTest(dispatcher) {
        val api = FakeApi()
        val vm = viewModel(api)
        advanceUntilIdle()

        vm.runChore("unused-packages")
        assertEquals("unused-packages", vm.state.value.choreRun?.chore?.id)
        vm.startRun()
        advanceUntilIdle()
        assertTrue(api.runs.isEmpty())

        vm.pickRunProject("p")
        vm.startRun()
        advanceUntilIdle()

        assertEquals(listOf(Triple("unused-packages", "p", null)), api.runs)
        assertNull(vm.state.value.choreRun)
        assertEquals("j", vm.state.value.jobs.first().id)
    }

    @Test
    fun `a skill sends its addition trimmed and can run without a project`() = runTest(dispatcher) {
        val api = FakeApi()
        val vm = viewModel(api)
        advanceUntilIdle()

        vm.runChore("skill-pr")
        vm.setRunArgument("  feature/x ")
        vm.startRun()
        advanceUntilIdle()
        vm.runChore("skill-pr")
        vm.setRunArgument("   ")
        vm.startRun()
        advanceUntilIdle()

        assertEquals(listOf(Triple("skill-pr", null, "feature/x"), Triple("skill-pr", null, null)), api.runs)
    }

    @Test
    fun `a refused run keeps the dialog open with the reason`() = runTest(dispatcher) {
        val api = FakeApi().apply { runError = ApiException(400, "Quizter har ingen mapp på datorn.") }
        val vm = viewModel(api)
        advanceUntilIdle()

        vm.runChore("unused-packages")
        vm.pickRunProject("q")
        vm.startRun()
        advanceUntilIdle()

        val run = vm.state.value.choreRun!!
        assertEquals("Quizter har ingen mapp på datorn.", run.error)
        assertFalse(run.sending)
        assertNull(vm.state.value.error)

        vm.closeRun()
        assertNull(vm.state.value.choreRun)
    }

    private val waiting = Job(
        "w", "disk-cleanup", "Rensa cache", "Klart", 1f, JobStatus.Done, "Hittade 14,2 GB.",
        choices = listOf(JobChoice("gradle", "Gradle", "~/.gradle/caches · 9,8 GB"), JobChoice("npm", "npm", "~/.npm · 4,4 GB")),
        confirm = "Rensa valda",
    )

    @Test
    fun `confirming sends the ticked choices and refreshes the jobs`() = runTest(dispatcher) {
        val api = FakeApi().apply { jobList = listOf(waiting) }
        val vm = viewModel(api)
        advanceUntilIdle()
        assertTrue(vm.state.value.jobs.single().waiting)

        vm.confirmJob("w") // nothing ticked yet
        advanceUntilIdle()
        assertTrue(api.confirms.isEmpty())

        vm.toggleChoice("w", "npm")
        vm.toggleChoice("w", "gradle")
        vm.toggleChoice("w", "npm")
        assertEquals(setOf("gradle"), vm.state.value.ticked["w"])

        vm.confirmJob("w")
        advanceUntilIdle()

        assertEquals(listOf("w" to listOf("gradle")), api.confirms)
        assertNull(vm.state.value.ticked["w"])
        val jobs = vm.state.value.jobs
        assertEquals("Frigjorde 9,8 GB.", jobs.first { it.id == "c" }.result)
        assertFalse(jobs.first { it.id == "w" }.waiting)
        assertTrue(jobs.none { it.running })
    }

    @Test
    fun `a refused confirm shows with the jobs, not as offline`() = runTest(dispatcher) {
        val api = FakeApi().apply { jobList = listOf(waiting); confirmError = ApiException(409, "Jobbet väntar inte på något val.") }
        val vm = viewModel(api)
        advanceUntilIdle()

        vm.toggleChoice("w", "gradle")
        vm.confirmJob("w")
        advanceUntilIdle()

        assertEquals("Jobbet väntar inte på något val.", vm.state.value.jobError)
        assertNull(vm.state.value.error)
        assertEquals(setOf("gradle"), vm.state.value.ticked["w"])
    }

    // ---- system, project status and stories ----

    @Test
    fun `loads the disk, project status and brief with the rest`() = runTest(dispatcher) {
        val api = FakeApi().apply { briefText = "Tre möten idag." }
        val vm = viewModel(api)
        advanceUntilIdle()

        val s = vm.state.value
        assertTrue(s.system!!.disk.low)
        assertEquals("3,2 GB ledigt av 460 GB", s.system!!.disk.label)
        assertEquals(CiState.Failing, s.status("p")!!.ci)
        assertNull(s.status("q"))
        assertEquals("Tre möten idag.", s.brief!!.text)
    }

    @Test
    fun `a status the computer cannot give does not count as offline`() = runTest(dispatcher) {
        val api = FakeApi().apply { statusError = ApiException(500, "git saknas") }
        val vm = viewModel(api)
        advanceUntilIdle()

        assertNull(vm.state.value.error)
        assertTrue(vm.state.value.statuses.isEmpty())
        assertEquals(2, vm.state.value.projects.size)
    }

    @Test
    fun `opening a project loads its stories and closing it goes back`() = runTest(dispatcher) {
        val api = FakeApi()
        val vm = viewModel(api)
        advanceUntilIdle()

        vm.openProject("p")
        assertTrue(vm.state.value.project!!.loading)
        advanceUntilIdle()

        val detail = vm.state.value.project!!
        assertEquals("HaloDeck", vm.state.value.openProject!!.name)
        assertEquals(listOf("HAL-7"), detail.stories.map { it.identifier })
        assertFalse(detail.loading)
        assertEquals(listOf("p"), api.storyCalls)

        vm.closeProject()
        assertNull(vm.state.value.project)
    }

    @Test
    fun `a story error stays in the project`() = runTest(dispatcher) {
        val api = FakeApi().apply { storiesError = ApiException(404, "Teamet QUI finns inte i Linear.") }
        val vm = viewModel(api)
        advanceUntilIdle()

        vm.openProject("q")
        advanceUntilIdle()

        assertEquals("Teamet QUI finns inte i Linear.", vm.state.value.project!!.error)
        assertNull(vm.state.value.error)
    }

    // ---- routines and the morning brief ----

    @Test
    fun `running a routine now adds its job and polls it`() = runTest(dispatcher) {
        val api = FakeApi()
        val vm = viewModel(api)
        advanceUntilIdle()

        vm.runRoutine("r")
        advanceUntilIdle()

        assertEquals(listOf("r"), api.routineRuns)
        assertEquals("rb", vm.state.value.jobs.first().id)
        assertNull(vm.state.value.jobError)
    }

    @Test
    fun `a finished morning brief job brings the new brief`() = runTest(dispatcher) {
        val api = FakeApi()
        val vm = viewModel(api)
        advanceUntilIdle()
        assertNull(vm.state.value.brief)

        vm.runRoutine("morning-brief")
        runCurrent()
        assertTrue(vm.state.value.choreState("morning-brief")!!.running)

        api.briefText = "Två möten och ett rött CI."
        advanceTimeBy(1_500)
        advanceUntilIdle()

        assertEquals("Två möten och ett rött CI.", vm.state.value.brief!!.text)
    }

    @Test
    fun `each jobs list goes to the notifier`() = runTest(dispatcher) {
        val api = FakeApi()
        val seen = mutableListOf<List<String>>()
        val vm = AppViewModel(api, today = { day }, pollMillis = 1_000, onJobs = { jobs -> seen += jobs.map { it.id } })
        advanceUntilIdle()
        assertEquals(listOf(listOf("j")), seen)

        vm.runChore("memory-cleanup")
        advanceTimeBy(1_500)
        advanceUntilIdle()

        assertTrue(seen.size >= 2)
    }
}
