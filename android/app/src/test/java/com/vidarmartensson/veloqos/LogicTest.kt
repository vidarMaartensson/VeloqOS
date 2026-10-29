package com.vidarmartensson.veloqos

import com.vidarmartensson.veloqos.data.CalendarEvent
import com.vidarmartensson.veloqos.data.InboxAction
import com.vidarmartensson.veloqos.data.InboxItem
import com.vidarmartensson.veloqos.domain.Logic
import org.junit.Assert.assertEquals
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
}
