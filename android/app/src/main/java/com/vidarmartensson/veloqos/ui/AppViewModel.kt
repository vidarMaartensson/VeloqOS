package com.vidarmartensson.veloqos.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vidarmartensson.veloqos.data.ApiException
import com.vidarmartensson.veloqos.data.Brief
import com.vidarmartensson.veloqos.data.CalendarDay
import com.vidarmartensson.veloqos.data.Chore
import com.vidarmartensson.veloqos.data.InboxAction
import com.vidarmartensson.veloqos.data.InboxItem
import com.vidarmartensson.veloqos.data.Job
import com.vidarmartensson.veloqos.data.LinearIssue
import com.vidarmartensson.veloqos.data.LinearStatus
import com.vidarmartensson.veloqos.data.LinearTeam
import com.vidarmartensson.veloqos.data.NewLinearIssue
import com.vidarmartensson.veloqos.data.NewCalendarEvent
import com.vidarmartensson.veloqos.data.Overview
import com.vidarmartensson.veloqos.data.Project
import com.vidarmartensson.veloqos.data.ProjectStatus
import com.vidarmartensson.veloqos.data.Routine
import com.vidarmartensson.veloqos.data.SystemInfo
import com.vidarmartensson.veloqos.data.VeloqApi
import com.vidarmartensson.veloqos.domain.Logic
import kotlinx.coroutines.Job as CoroutineJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.ZonedDateTime

/** The Linear tab: loaded the first time it opens. */
data class LinearUi(
    val status: LinearStatus? = null,
    val teams: List<LinearTeam> = emptyList(),
    val teamId: String? = null,
    val showDone: Boolean = false,
    val issues: List<LinearIssue> = emptyList(),
    val loading: Boolean = false,
    val error: String? = null,
) {
    val team get() = teams.firstOrNull { it.id == teamId }
}

/** The run dialog, open for a chore that runs in a project or takes an addition. */
data class ChoreRun(
    val chore: Chore,
    val projectId: String? = null,
    val argument: String = "",
    val sending: Boolean = false,
    /** The API's reason when it refused the run, e.g. "Välj ett projekt först." */
    val error: String? = null,
)

/** A project opened from the Projekt tab; its open stories load when it has a Linear team. */
data class ProjectDetail(
    val projectId: String,
    val stories: List<LinearIssue> = emptyList(),
    val loading: Boolean = false,
    val error: String? = null,
)

data class UiState(
    val loading: Boolean = true,
    val error: String? = null,
    val overview: Overview? = null,
    val projects: List<Project> = emptyList(),
    /** Git, PRs and CI for the projects with a folder; empty if the computer cannot tell. */
    val statuses: List<ProjectStatus> = emptyList(),
    val project: ProjectDetail? = null,
    val system: SystemInfo? = null,
    /** The latest morning brief; null before the first one is written. */
    val brief: Brief? = null,
    val chores: List<Chore> = emptyList(),
    val jobs: List<Job> = emptyList(),
    val routines: List<Routine> = emptyList(),
    val inbox: List<InboxItem> = emptyList(),
    val calendar: CalendarDay? = null,
    val linear: LinearUi = LinearUi(),
    val choreRun: ChoreRun? = null,
    /** Ticked choices per waiting job id; none are ticked from the start. */
    val ticked: Map<String, Set<String>> = emptyMap(),
    /** A refused run or confirm, shown with the jobs instead of the "Når inte datorn" banner. */
    val jobError: String? = null,
) {
    val needsYou get() = Logic.needsYou(inbox)
    fun choreState(id: String): Job? = jobs.firstOrNull { it.choreId == id }
    fun status(projectId: String): ProjectStatus? = statuses.firstOrNull { it.projectId == projectId }
    val openProject get() = project?.let { d -> projects.firstOrNull { it.id == d.projectId } }
}

/** The chore and routine that write the morning brief. */
const val BRIEF = "morning-brief"

/** All app state. The API owns the rules; this mirrors them and keeps the UI responsive. */
class AppViewModel(
    private val api: VeloqApi,
    private val today: () -> LocalDate = { ZonedDateTime.now(Logic.zone).toLocalDate() },
    private val pollMillis: Long = 1_000,
    /** Every fresh jobs list, for the notifications about finished jobs. */
    private val onJobs: (List<Job>) -> Unit = {},
) : ViewModel() {

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()
    private var polling: CoroutineJob? = null

    init {
        refresh()
    }

    fun refresh() = launchSafely {
        _state.update { it.copy(loading = true) }
        _state.update {
            it.copy(
                loading = false,
                error = null,
                overview = api.overview(),
                projects = api.projects(),
                chores = api.chores(),
                jobs = api.jobs(),
                routines = api.routines(),
                inbox = api.inbox(),
                calendar = api.calendar(today()),
            )
        }
        onJobs(_state.value.jobs)
        // Extras: a computer that cannot answer these is still online.
        val system = optional { api.system() }
        val statuses = optional { api.projectStatus() }
        val brief = optional { api.brief() }
        _state.update { it.copy(system = system, statuses = statuses ?: it.statuses, brief = brief) }
        pollWhileRunning()
    }

    /** Opening the Projekt tab: git and CI change while the app is open. */
    fun loadStatus() = launchSafely {
        optional { api.projectStatus() }?.let { statuses -> _state.update { it.copy(statuses = statuses) } }
    }

    /** Opens the project; its open stories load when it is linked to a Linear team. */
    fun openProject(id: String) {
        val project = _state.value.projects.firstOrNull { it.id == id } ?: return
        _state.update { it.copy(project = ProjectDetail(id, loading = project.linearTeam != null)) }
        if (project.linearTeam == null) return
        viewModelScope.launch {
            try {
                val stories = api.stories(id)
                updateProject(id) { it.copy(stories = stories, loading = false, error = null) }
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: ApiException) {
                // E.g. the team is not in any workspace: say so in the project, not as "offline".
                updateProject(id) { it.copy(loading = false, error = e.message) }
            } catch (e: Exception) {
                updateProject(id) { it.copy(loading = false) }
                _state.update { it.copy(error = e.message ?: "Något gick fel.") }
            }
        }
    }

    fun closeProject() = _state.update { it.copy(project = null) }

    private fun updateProject(id: String, change: (ProjectDetail) -> ProjectDetail) =
        _state.update { s -> if (s.project?.projectId == id) s.copy(project = change(s.project)) else s }

    /** Runs directly when there is nothing to choose, otherwise opens the run dialog. */
    fun runChore(id: String) {
        val chore = _state.value.chores.firstOrNull { it.id == id }
        if (chore != null && Logic.needsDialog(chore)) return _state.update { it.copy(choreRun = ChoreRun(chore), jobError = null) }
        choresSafely { start(id, null, null) }
    }

    fun pickRunProject(projectId: String?) = updateRun { it.copy(projectId = projectId, error = null) }

    fun setRunArgument(text: String) = updateRun { it.copy(argument = text) }

    fun closeRun() = _state.update { it.copy(choreRun = null) }

    /** Sends the dialog; it closes only if the API took the run. */
    fun startRun() {
        val run = _state.value.choreRun ?: return
        if (run.sending || !Logic.canRun(run.chore, run.projectId)) return
        updateRun { it.copy(sending = true, error = null) }
        choresSafely {
            start(run.chore.id, run.projectId, run.argument.trim().ifEmpty { null }.takeIf { run.chore.argument != null })
            _state.update { it.copy(choreRun = null) }
        }
    }

    private suspend fun start(id: String, projectId: String?, argument: String?) = add(api.runChore(id, projectId, argument))

    /** "Kör nu": the routine's chore runs as a job, like any chore. */
    fun runRoutine(id: String) = choresSafely { add(api.runRoutine(id)) }

    private fun add(job: Job) {
        _state.update { it.copy(jobs = listOf(job) + it.jobs, jobError = null) }
        pollWhileRunning()
    }

    fun toggleChoice(jobId: String, choiceId: String) =
        _state.update { it.copy(ticked = it.ticked + (jobId to Logic.toggle(it.ticked[jobId].orEmpty(), choiceId))) }

    /** Approves the ticked choices: a new job carries them out and the old one stops waiting. */
    fun confirmJob(jobId: String) {
        val s = _state.value
        val job = s.jobs.firstOrNull { it.id == jobId } ?: return
        val picked = Logic.picked(job, s.ticked[jobId].orEmpty())
        if (picked.isEmpty()) return
        choresSafely {
            val next = api.confirmJob(jobId, picked)
            _state.update { it.copy(jobs = listOf(next) + it.jobs, ticked = it.ticked - jobId, jobError = null) }
            setJobs(api.jobs())
            pollWhileRunning()
        }
    }

    fun setRoutine(id: String, enabled: Boolean) = launchSafely {
        _state.update { s -> s.copy(routines = s.routines.map { if (it.id == id) it.copy(enabled = enabled) else it }) }
        api.setRoutine(id, enabled)
        _state.update { it.copy(overview = api.overview()) }
    }

    fun act(id: String, action: InboxAction, body: String? = null) = launchSafely {
        replace(api.act(id, action, body))
        if (action == InboxAction.Calendar) _state.update { it.copy(calendar = api.calendar(today())) }
        _state.update { it.copy(overview = api.overview()) }
    }

    fun undo(id: String) = launchSafely {
        replace(api.undo(id))
        _state.update { it.copy(overview = api.overview()) }
    }

    fun connectCalendar(openUrl: (String) -> Unit) = launchSafely {
        val authUrl = api.connectCalendar()
        if (authUrl != null) openUrl(authUrl) else _state.update { it.copy(calendar = api.calendar(today())) }
    }

    fun book(id: String) = launchSafely {
        api.book(id)
        _state.update { it.copy(calendar = api.calendar(today())) }
    }

    /** Adds the event, reloads today and calls [onDone] only if the API took it. */
    fun addEvent(event: NewCalendarEvent, onDone: () -> Unit) = launchSafely {
        api.createEvent(event)
        _state.update { it.copy(calendar = api.calendar(today())) }
        onDone()
    }

    /** Back from Google's sign-in in the browser: if not connected yet, look again. */
    fun recheckGoogle() {
        if (_state.value.calendar?.connected == false) refresh()
    }

    /** Opening the tab: teams once, then the first team's stories. */
    fun openLinear() {
        if (_state.value.linear.status != null) return loadIssues()
        updateLinear { it.copy(loading = true, error = null) }
        linearSafely {
            val status = api.linear()
            val teams = api.linearTeams()
            updateLinear { it.copy(status = status, teams = teams, teamId = it.teamId ?: teams.firstOrNull()?.id) }
            fetchIssues()
        }
    }

    fun pickTeam(id: String) {
        updateLinear { it.copy(teamId = id, issues = emptyList()) }
        loadIssues()
    }

    fun setShowDone(showDone: Boolean) {
        updateLinear { it.copy(showDone = showDone) }
        loadIssues()
    }

    /** Creates the story, reloads the list and calls [onDone] only if Linear took it. */
    fun createStory(issue: NewLinearIssue, onDone: () -> Unit) = linearSafely {
        api.createLinearIssue(issue)
        fetchIssues()
        onDone()
    }

    private fun loadIssues() = linearSafely { fetchIssues() }

    private suspend fun fetchIssues() {
        val linear = _state.value.linear
        val teamId = linear.teamId ?: return updateLinear { it.copy(loading = false) }
        updateLinear { it.copy(loading = true) }
        val issues = api.linearIssues(teamId, open = !linear.showDone)
        updateLinear { it.copy(issues = issues, loading = false, error = null) }
    }

    private fun updateLinear(change: (LinearUi) -> LinearUi) = _state.update { it.copy(linear = change(it.linear)) }

    /** Linear errors stay in the Linear tab instead of the "Når inte datorn" banner. */
    private fun linearSafely(block: suspend () -> Unit) {
        viewModelScope.launch {
            try {
                block()
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: ApiException) {
                updateLinear { it.copy(loading = false, error = e.message) }
            } catch (e: Exception) {
                updateLinear { it.copy(loading = false) }
                _state.update { it.copy(error = e.message ?: "Något gick fel.") }
            }
        }
    }

    private fun updateRun(change: (ChoreRun) -> ChoreRun) = _state.update { s -> s.copy(choreRun = s.choreRun?.let(change)) }

    /** API refusals (400/409) stay in the run dialog or the jobs list; only a lost connection shows the banner. */
    private fun choresSafely(block: suspend () -> Unit) {
        viewModelScope.launch {
            try {
                block()
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: ApiException) {
                val message = e.message ?: "Något gick fel."
                _state.update { s ->
                    if (s.choreRun != null) s.copy(choreRun = s.choreRun.copy(sending = false, error = message)) else s.copy(jobError = message)
                }
            } catch (e: Exception) {
                updateRun { it.copy(sending = false) }
                _state.update { it.copy(error = e.message ?: "Något gick fel.") }
            }
        }
    }

    fun dismissError() = _state.update { it.copy(error = null) }

    private fun replace(item: InboxItem) =
        _state.update { s -> s.copy(inbox = s.inbox.map { if (it.id == item.id) item else it }) }

    private fun pollWhileRunning() {
        if (polling?.isActive == true || _state.value.jobs.none { it.running }) return
        polling = viewModelScope.launch {
            while (isActive && _state.value.jobs.any { it.running }) {
                delay(pollMillis)
                runCatching { api.jobs() }.onSuccess { setJobs(it) }
            }
            runCatching { api.overview() }.onSuccess { o -> _state.update { it.copy(overview = o) } }
        }
    }

    /** Takes a fresh jobs list; a morning brief that just finished brings the new brief. */
    private suspend fun setJobs(jobs: List<Job>) {
        val before = _state.value.jobs
        _state.update { it.copy(jobs = jobs) }
        onJobs(jobs)
        val briefDone = jobs.any { j -> j.choreId == BRIEF && !j.running && before.any { it.id == j.id && it.running } }
        if (briefDone) optional { api.brief() }?.let { b -> _state.update { it.copy(brief = b) } }
    }

    /** Null when the API refuses (e.g. an older API without the endpoint); a lost connection still throws. */
    private suspend fun <T> optional(block: suspend () -> T): T? = try {
        block()
    } catch (e: ApiException) {
        null
    }

    private fun launchSafely(onError: () -> Unit = {}, block: suspend () -> Unit) {
        viewModelScope.launch {
            try {
                block()
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                onError()
                _state.update { it.copy(loading = false, error = e.message ?: "Något gick fel.") }
            }
        }
    }
}
