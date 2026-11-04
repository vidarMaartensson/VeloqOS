package com.vidarmartensson.veloqos.data

import java.time.LocalDate
import java.time.OffsetDateTime

// Mirrors docs/api.md. Keep in sync with api/src/VeloqOS.Api/Models.cs.

data class Overview(
    val projects: Int,
    val activeProjects: Int,
    val runningJobs: Int,
    val inboxNeedsYou: Int,
    val routinesOn: Int,
    val routinesTotal: Int,
    val artifacts: Int,
)

data class Project(
    val id: String,
    val name: String,
    val meta: String,
    val status: String,
    val tier: Int,
    val body: String,
    val group: String,
    /** The project's folder on the computer; chores that work in a repo need one. */
    val repoPath: String? = null,
    /** The project's Linear team key, e.g. "VEL"; null when it is not linked. */
    val linearTeam: String? = null,
)

/** The computer the API runs on. [low]: under 10 % or 10 GB free – Home warns and offers disk-cleanup. */
data class Disk(val free: Long, val total: Long, val label: String, val low: Boolean)

data class SystemInfo(val disk: Disk)

/** The latest GitHub Actions run on the project's branch. */
enum class CiState(val wire: String) {
    Passing("passing"),
    Failing("failing"),
    Running("running");

    companion object {
        fun fromWire(value: String?) = entries.firstOrNull { it.wire == value }
    }
}

data class LastCommit(val message: String, val at: OffsetDateTime)

/** Git, PRs and CI for a project with a folder. Null fields are what the computer could not tell. */
data class ProjectStatus(
    val projectId: String,
    val branch: String?,
    /** Uncommitted files. */
    val changes: Int,
    /** Commits not pushed; null without an upstream. */
    val ahead: Int?,
    val lastCommit: LastCommit?,
    /** Open PRs; null when gh is missing or the repo is not on GitHub. */
    val pullRequests: Int?,
    val ci: CiState?,
    val ciUrl: String?,
    /** Red CI or uncommitted changes – the project gets a dot. */
    val attention: Boolean,
    /** A short reason when the repo could not be read. */
    val error: String?,
)

/** The latest morning brief, written by the morning-brief chore. */
data class Brief(val text: String, val createdAt: OffsetDateTime, val jobId: String?)

/** One per API key; [error] is set when that workspace did not answer. */
data class LinearWorkspace(val id: String, val name: String, val error: String?)

/** [configured] false = no Linear keys on the computer, so these are sample stories. */
data class LinearStatus(val configured: Boolean, val workspaces: List<LinearWorkspace>)

data class LinearState(val id: String, val name: String, val type: String, val color: String) {
    val open get() = type != "completed" && type != "canceled"
}

data class LinearTeam(
    val id: String,
    val key: String,
    val name: String,
    val workspaceId: String,
    val workspace: String,
    val states: List<LinearState>,
)

data class LinearIssue(
    val id: String,
    val identifier: String,
    val title: String,
    val description: String?,
    /** 0 none, 1 urgent, 2 high, 3 medium, 4 low. */
    val priority: Int,
    val priorityLabel: String,
    val url: String,
    val state: LinearState,
    val assignee: String?,
    val updatedAt: OffsetDateTime,
)

data class NewLinearIssue(val teamId: String, val title: String, val description: String?, val priority: Int, val stateId: String?)

/** `chore`: built into Veloq OS. `skill`: one of your Claude Code skills, run as `/<name>`. */
enum class ChoreKind(val wire: String) {
    Chore("chore"),
    Skill("skill");

    companion object {
        fun fromWire(value: String?) = entries.firstOrNull { it.wire == value } ?: Chore
    }
}

/** Whether a chore runs in a project's folder. Only projects with a repoPath can be picked. */
enum class ChoreProject(val wire: String) {
    None("none"),
    Optional("optional"),
    Required("required");

    companion object {
        fun fromWire(value: String?) = entries.firstOrNull { it.wire == value } ?: None
    }
}

data class Chore(
    val id: String,
    val name: String,
    val description: String,
    val icon: String,
    val estimate: String,
    val kind: ChoreKind = ChoreKind.Chore,
    val project: ChoreProject = ChoreProject.None,
    /** Placeholder for a free-text addition (e.g. a branch name); null = the chore takes none. */
    val argument: String? = null,
)

enum class JobStatus(val wire: String) {
    Running("running"),
    Done("done"),
    Failed("failed");

    companion object {
        fun fromWire(value: String?) = entries.firstOrNull { it.wire == value } ?: Done
    }
}

/** Something a finished job proposes, for the user to approve. */
data class JobChoice(val id: String, val label: String, val detail: String)

data class Job(
    val id: String,
    val choreId: String,
    val title: String,
    val step: String,
    val progress: Float,
    val status: JobStatus,
    /** The answer when done (can be several lines), the error when failed. */
    val result: String?,
    /** The project's name, null when the chore ran outside a project. */
    val project: String? = null,
    val choices: List<JobChoice>? = null,
    /** The confirm button's text, e.g. "Rensa valda"; set together with [choices]. */
    val confirm: String? = null,
    /** Set when the job became done or failed; the phone's notifications go by it. */
    val finishedAt: OffsetDateTime? = null,
) {
    val running get() = status == JobStatus.Running
    val failed get() = status == JobStatus.Failed
    /** Done, with a proposal that waits for the user's pick. */
    val waiting get() = status == JobStatus.Done && !choices.isNullOrEmpty() && confirm != null
}

data class Routine(
    val id: String,
    val name: String,
    val schedule: String,
    val description: String,
    val enabled: Boolean,
    /** The chore the routine runs on its schedule. */
    val choreId: String? = null,
    /** Null when the routine is off. */
    val nextRunAt: OffsetDateTime? = null,
    val lastRunAt: OffsetDateTime? = null,
)

enum class InboxAction(val wire: String) {
    Reply("reply"),
    Delegate("delegate"),
    Archive("archive"),
    Task("task"),
    Snooze("snooze"),
    Calendar("calendar");

    companion object {
        fun fromWire(value: String?): InboxAction? = entries.firstOrNull { it.wire == value }
    }
}

data class InboxItem(
    val id: String,
    val from: String,
    val receivedAt: OffsetDateTime,
    val subject: String,
    val tag: String,
    val summary: String,
    val suggestedAction: InboxAction,
    val suggestion: String,
    val draft: String?,
    val handledWith: InboxAction?,
)

data class CalendarEvent(
    val id: String,
    val title: String,
    val start: OffsetDateTime,
    val end: OffsetDateTime,
    val location: String?,
    val suggested: Boolean,
)

/** What POST /api/calendar/events takes. */
data class NewCalendarEvent(
    val title: String,
    val start: OffsetDateTime,
    val end: OffsetDateTime,
    val location: String?,
)

data class CalendarDay(
    val connected: Boolean,
    val date: LocalDate,
    val events: List<CalendarEvent>,
)
