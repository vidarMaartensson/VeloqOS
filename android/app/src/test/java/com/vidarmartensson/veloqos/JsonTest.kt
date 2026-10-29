package com.vidarmartensson.veloqos

import com.vidarmartensson.veloqos.data.InboxAction
import com.vidarmartensson.veloqos.data.Json
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

/** Payloads shaped exactly like the .NET API's output (System.Text.Json, camelCase). */
class JsonTest {

    @Test
    fun `parses an inbox item with nulls and a 7-digit fraction`() {
        val item = Json.inboxItem(
            JSONObject(
                """
                {"id":"m1","from":"GitHub","receivedAt":"2026-10-29T13:22:10.1234567+00:00","subject":"CI","tag":"Åtgärd",
                 "summary":"s","suggestedAction":"delegate","suggestion":"låt Veloq OS föreslå en fix","draft":null,"handledWith":null}
                """.trimIndent(),
            ),
        )
        assertEquals("GitHub", item.from)
        assertEquals(InboxAction.Delegate, item.suggestedAction)
        assertNull(item.draft)
        assertNull(item.handledWith)
        assertEquals(13, item.receivedAt.hour)
    }

    @Test
    fun `parses a handled item`() {
        val item = Json.inboxItem(
            JSONObject(
                """{"id":"m2","from":"x","receivedAt":"2026-10-29T10:00:00+01:00","subject":"s","tag":"Svar","summary":"s",
                   "suggestedAction":"reply","suggestion":"svara","draft":"Hej","handledWith":"reply"}""",
            ),
        )
        assertEquals(InboxAction.Reply, item.handledWith)
        assertEquals("Hej", item.draft)
    }

    @Test
    fun `parses a running job`() {
        val job = Json.job(
            JSONObject("""{"id":"j","choreId":"memory-cleanup","title":"Städa minnet","step":"Kör…","progress":0.42,"status":"running","startedAt":"2026-10-29T13:00:00+00:00","result":null}"""),
        )
        assertTrue(job.running)
        assertEquals(0.42f, job.progress, 0.0001f)
        assertNull(job.result)
    }

    @Test
    fun `parses a calendar day`() {
        val day = Json.calendarDay(
            JSONObject(
                """{"connected":true,"date":"2026-10-29","events":[
                   {"id":"20261029-s1","title":"Fokus","start":"2026-10-29T09:00:00+01:00","end":"2026-10-29T11:00:00+01:00","location":null,"suggested":true}]}""",
            ),
        )
        assertTrue(day.connected)
        assertEquals(LocalDate.of(2026, 10, 29), day.date)
        assertTrue(day.events.single().suggested)
        assertNull(day.events.single().location)
    }

    @Test
    fun `parses lists`() {
        val routines = Json.list(
            """[{"id":"morning-brief","name":"Morgonbrief","schedule":"Vardagar · 07:40","description":"d","enabled":false}]""",
            Json::routine,
        )
        assertEquals("Morgonbrief", routines.single().name)
        assertFalse(routines.single().enabled)
    }
}
