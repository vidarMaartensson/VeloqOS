package com.vidarmartensson.veloqos

import com.vidarmartensson.veloqos.data.ChoreKind
import com.vidarmartensson.veloqos.data.ChoreProject
import com.vidarmartensson.veloqos.data.InboxAction
import com.vidarmartensson.veloqos.data.JobStatus
import com.vidarmartensson.veloqos.data.Json
import com.vidarmartensson.veloqos.data.NewCalendarEvent
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.OffsetDateTime

/** Payloads shaped exactly like the .NET API's output (System.Text.Json, camelCase). */
class JsonTest {

    @Test
    fun `parses a project with and without a folder`() {
        val withRepo = Json.project(JSONObject("""{"id":"halodeck","name":"HaloDeck","meta":"m","status":"s","tier":3,"body":"b","group":"Appar","repoPath":"/r/HaloDeck"}"""))
        val without = Json.project(JSONObject("""{"id":"quizter","name":"Quizter","meta":"m","status":"s","tier":1,"body":"b","group":"Appar","repoPath":null}"""))
        assertEquals("/r/HaloDeck", withRepo.repoPath)
        assertNull(without.repoPath)
    }

    @Test
    fun `parses a Linear team and issue and writes a new one`() {
        val team = Json.linearTeam(JSONObject("""{"id":"t1","key":"VEL","name":"Veloq","workspaceId":"w1","workspace":"Veloq Labs","states":[{"id":"s1","name":"Todo","type":"unstarted","color":"#e2e2e2"}]}"""))
        val status = Json.linearStatus(JSONObject("""{"configured":true,"workspaces":[{"id":"w1","name":"Veloq Labs","error":null},{"id":"key-2","name":"Nyckel 2","error":"Linear: nej"}]}"""))
        val issue = Json.linearIssue(
            JSONObject(
                """{"id":"i1","identifier":"VEL-1","title":"T","description":null,"priority":2,"priorityLabel":"Hög","url":"https://linear.app/x/VEL-1",
                   "state":{"id":"s2","name":"Done","type":"completed","color":"#5e6ad2"},"assignee":null,"updatedAt":"2026-10-30T09:00:00+00:00"}""",
            ),
        )
        val json = Json.newLinearIssue(com.vidarmartensson.veloqos.data.NewLinearIssue("t1", "Ny", null, 3, null))

        assertEquals("unstarted", team.states.single().type)
        assertEquals("Veloq Labs", team.workspace)
        assertNull(status.workspaces[0].error)
        assertEquals("Linear: nej", status.workspaces[1].error)
        assertEquals("Hög", issue.priorityLabel)
        assertNull(issue.description)
        assertNull(issue.assignee)
        assertFalse(issue.state.open)
        assertTrue(json.isNull("description"))
        assertEquals(3, json.getInt("priority"))
    }

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

    @Test
    fun `writes a new event with offsets and a null location`() {
        val json = Json.newCalendarEvent(
            NewCalendarEvent("Fokus", OffsetDateTime.parse("2026-11-02T10:00:00+01:00"), OffsetDateTime.parse("2026-11-02T12:00:00+01:00"), null),
        )
        assertEquals("Fokus", json.getString("title"))
        assertEquals("2026-11-02T10:00+01:00", json.getString("start"))
        assertTrue(json.isNull("location"))
    }

    @Test
    fun `parses chores and skills, with defaults when the new fields are missing`() {
        val chores = Json.list(
            """[{"id":"unused-packages","name":"Oanvända paket","description":"d","icon":"package","estimate":"≈ 3 min","kind":"chore","project":"required","argument":null},
                {"id":"skill-pr","name":"/pr","description":"d","icon":"skill","estimate":"Skill","kind":"skill","project":"optional","argument":"branchnamn"},
                {"id":"memory-cleanup","name":"Städa minnet","description":"d","icon":"memory","estimate":"≈ 1 min"}]""",
            Json::chore,
        )
        assertEquals(ChoreProject.Required, chores[0].project)
        assertNull(chores[0].argument)
        assertEquals(ChoreKind.Skill, chores[1].kind)
        assertEquals(ChoreProject.Optional, chores[1].project)
        assertEquals("branchnamn", chores[1].argument)
        assertEquals(ChoreKind.Chore, chores[2].kind)
        assertEquals(ChoreProject.None, chores[2].project)
        assertNull(chores[2].argument)
    }

    @Test
    fun `parses a waiting job with choices and a failed one`() {
        val waiting = Json.job(
            JSONObject(
                """{"id":"j","choreId":"disk-cleanup","title":"Rensa cache","project":null,"step":"Klart","progress":1,"status":"done","startedAt":"2026-10-30T09:00:00+00:00",
                   "result":"Hittade 14,2 GB att frigöra.\n61,0 GB ledigt nu.","choices":[{"id":"gradle","label":"Gradle","detail":"~/.gradle/caches · 9,8 GB"}],"confirm":"Rensa valda"}""",
            ),
        )
        val failed = Json.job(
            JSONObject("""{"id":"f","choreId":"claude-md","title":"Uppdatera CLAUDE.md","project":"Veloq OS","step":"Misslyckades","progress":1,"status":"failed","startedAt":"2026-10-30T09:00:00+00:00","result":"claude saknas"}"""),
        )
        assertEquals(JobStatus.Done, waiting.status)
        assertTrue(waiting.waiting)
        assertNull(waiting.project)
        assertEquals("Hittade 14,2 GB att frigöra.\n61,0 GB ledigt nu.", waiting.result)
        assertEquals("~/.gradle/caches · 9,8 GB", waiting.choices!!.single().detail)
        assertEquals("Rensa valda", waiting.confirm)
        assertTrue(failed.failed)
        assertFalse(failed.running)
        assertFalse(failed.waiting)
        assertEquals("Veloq OS", failed.project)
        assertNull(failed.choices)
        assertNull(failed.confirm)
    }

    @Test
    fun `writes a run and a confirm without null fields`() {
        assertEquals("{}", Json.choreRun(null, null).toString())
        val run = Json.choreRun("veloq-os", null)
        assertEquals("veloq-os", run.getString("projectId"))
        assertFalse(run.has("argument"))
        assertEquals("""{"choices":["gradle","npm"]}""", Json.jobConfirm(listOf("gradle", "npm")).toString())
    }

    @Test
    fun `reads the reason from problem details, validation errors and plain errors`() {
        assertEquals("Not logged in", Json.problem("""{"title":"Claude Code","detail":"Not logged in","status":502}"""))
        assertEquals(
            "Välj ett projekt först.",
            Json.problem("""{"type":"…","title":"One or more validation errors occurred.","status":400,"errors":{"projectId":["Välj ett projekt först."]}}"""),
        )
        assertEquals("Jobbet väntar inte på något val.", Json.problem("""{"error":"Jobbet väntar inte på något val."}"""))
        assertNull(Json.problem(""))
        assertNull(Json.problem("""{"title":"Not Found","status":404}"""))
    }

    @Test
    fun `parses a project's Linear team`() {
        val linked = Json.project(JSONObject("""{"id":"veloq-os","name":"Veloq OS","meta":"m","status":"s","tier":3,"body":"b","group":"Verktyg","repoPath":null,"linearTeam":"VEL"}"""))
        val older = Json.project(JSONObject("""{"id":"q","name":"Q","meta":"m","status":"s","tier":1,"body":"b","group":"Appar"}"""))
        assertEquals("VEL", linked.linearTeam)
        assertNull(older.linearTeam)
    }

    @Test
    fun `parses the system's disk`() {
        val system = Json.system(JSONObject("""{"disk":{"free":3435973836,"total":494384795648,"label":"3,2 GB ledigt av 460 GB","low":true}}"""))
        assertEquals(3_435_973_836L, system.disk.free)
        assertEquals(494_384_795_648L, system.disk.total)
        assertEquals("3,2 GB ledigt av 460 GB", system.disk.label)
        assertTrue(system.disk.low)
    }

    @Test
    fun `parses project status, full and unreadable`() {
        val full = Json.projectStatus(
            JSONObject(
                """{"projectId":"veloq-os","branch":"feature/x","changes":12,"ahead":2,"lastCommit":{"message":"Add Veloq OS as a Mac app","at":"2026-10-29T18:02:11+01:00"},
                   "pullRequests":1,"ci":"failing","ciUrl":"https://github.com/v/r/actions/runs/1","attention":true,"error":null}""",
            ),
        )
        val broken = Json.projectStatus(
            JSONObject("""{"projectId":"halodeck","branch":null,"changes":0,"ahead":null,"lastCommit":null,"pullRequests":null,"ci":null,"ciUrl":null,"attention":false,"error":"Inte ett git-repo."}"""),
        )
        assertEquals("feature/x", full.branch)
        assertEquals(12, full.changes)
        assertEquals(2, full.ahead)
        assertEquals("Add Veloq OS as a Mac app", full.lastCommit!!.message)
        assertEquals(1, full.pullRequests)
        assertEquals(com.vidarmartensson.veloqos.data.CiState.Failing, full.ci)
        assertTrue(full.attention)
        assertNull(broken.branch)
        assertNull(broken.ahead)
        assertNull(broken.pullRequests)
        assertNull(broken.ci)
        assertNull(broken.lastCommit)
        assertEquals("Inte ett git-repo.", broken.error)
    }

    @Test
    fun `parses a brief`() {
        val brief = Json.brief(JSONObject("""{"text":"Tre möten.\nCI är rött i Veloq OS.","createdAt":"2026-10-30T07:41:02.1234567+01:00","jobId":"j1"}"""))
        assertEquals("Tre möten.\nCI är rött i Veloq OS.", brief.text)
        assertEquals(41, brief.createdAt.minute)
        assertEquals("j1", brief.jobId)
    }

    @Test
    fun `parses a job's finishedAt and a routine's times`() {
        val done = Json.job(
            JSONObject("""{"id":"j","choreId":"disk-cleanup","title":"Rensa cache","project":null,"step":"Klart","progress":1,"status":"done","startedAt":"2026-10-30T09:00:00+01:00","finishedAt":"2026-10-30T09:01:30+01:00","result":"Klart.","choices":null,"confirm":null}"""),
        )
        val running = Json.job(JSONObject("""{"id":"k","choreId":"x","title":"X","step":"Kör…","progress":0.4,"status":"running","finishedAt":null,"result":null}"""))
        val routine = Json.routine(
            JSONObject("""{"id":"morning-brief","name":"Morgonbrief","schedule":"Vardagar · 07:40","description":"d","enabled":true,"choreId":"morning-brief","nextRunAt":"2026-11-02T07:40:00+01:00","lastRunAt":null}"""),
        )
        val off = Json.routine(JSONObject("""{"id":"r","name":"R","schedule":"s","description":"d","enabled":false}"""))
        assertEquals(OffsetDateTime.parse("2026-10-30T09:01:30+01:00"), done.finishedAt)
        assertNull(running.finishedAt)
        assertEquals("morning-brief", routine.choreId)
        assertEquals(OffsetDateTime.parse("2026-11-02T07:40:00+01:00"), routine.nextRunAt)
        assertNull(routine.lastRunAt)
        assertNull(off.choreId)
        assertNull(off.nextRunAt)
    }
}
