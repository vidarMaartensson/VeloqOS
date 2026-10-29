package com.vidarmartensson.veloqos.domain

import com.vidarmartensson.veloqos.data.CalendarEvent
import com.vidarmartensson.veloqos.data.InboxAction
import com.vidarmartensson.veloqos.data.InboxItem
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
        in 10..17 -> "God eftermiddag"
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
}
