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
)

data class Chore(
    val id: String,
    val name: String,
    val description: String,
    val icon: String,
    val estimate: String,
)

data class Job(
    val id: String,
    val choreId: String,
    val title: String,
    val step: String,
    val progress: Float,
    val running: Boolean,
    val result: String?,
)

data class Routine(
    val id: String,
    val name: String,
    val schedule: String,
    val description: String,
    val enabled: Boolean,
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

data class CalendarDay(
    val connected: Boolean,
    val date: LocalDate,
    val events: List<CalendarEvent>,
)
