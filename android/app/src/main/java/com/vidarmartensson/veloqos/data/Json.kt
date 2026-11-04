package com.vidarmartensson.veloqos.data

import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.OffsetDateTime

/** Parses API responses with the platform's org.json – no extra dependencies. */
object Json {
    fun overview(o: JSONObject) = Overview(
        projects = o.getInt("projects"),
        activeProjects = o.getInt("activeProjects"),
        runningJobs = o.getInt("runningJobs"),
        inboxNeedsYou = o.getInt("inboxNeedsYou"),
        routinesOn = o.getInt("routinesOn"),
        routinesTotal = o.getInt("routinesTotal"),
        artifacts = o.getInt("artifacts"),
    )

    fun project(o: JSONObject) = Project(
        id = o.getString("id"),
        name = o.getString("name"),
        meta = o.getString("meta"),
        status = o.getString("status"),
        tier = o.getInt("tier"),
        body = o.getString("body"),
        group = o.getString("group"),
        repoPath = o.optStringOrNull("repoPath"),
        linearTeam = o.optStringOrNull("linearTeam"),
    )

    fun system(o: JSONObject) = SystemInfo(
        disk = o.getJSONObject("disk").let {
            Disk(free = it.getLong("free"), total = it.getLong("total"), label = it.getString("label"), low = it.getBoolean("low"))
        },
    )

    fun projectStatus(o: JSONObject) = ProjectStatus(
        projectId = o.getString("projectId"),
        branch = o.optStringOrNull("branch"),
        changes = o.optInt("changes"),
        ahead = o.optIntOrNull("ahead"),
        lastCommit = o.optJSONObject("lastCommit")?.let { LastCommit(it.getString("message"), OffsetDateTime.parse(it.getString("at"))) },
        pullRequests = o.optIntOrNull("pullRequests"),
        ci = CiState.fromWire(o.optStringOrNull("ci")),
        ciUrl = o.optStringOrNull("ciUrl"),
        attention = o.optBoolean("attention"),
        error = o.optStringOrNull("error"),
    )

    fun brief(o: JSONObject) = Brief(
        text = o.getString("text"),
        createdAt = OffsetDateTime.parse(o.getString("createdAt")),
        jobId = o.optStringOrNull("jobId"),
    )

    /** The fields added for skills and projects are optional, so an older API still parses. */
    fun chore(o: JSONObject) = Chore(
        id = o.getString("id"),
        name = o.getString("name"),
        description = o.getString("description"),
        icon = o.getString("icon"),
        estimate = o.getString("estimate"),
        kind = ChoreKind.fromWire(o.optStringOrNull("kind")),
        project = ChoreProject.fromWire(o.optStringOrNull("project")),
        argument = o.optStringOrNull("argument"),
    )

    fun job(o: JSONObject) = Job(
        id = o.getString("id"),
        choreId = o.getString("choreId"),
        title = o.getString("title"),
        step = o.getString("step"),
        progress = o.getDouble("progress").toFloat(),
        status = JobStatus.fromWire(o.getString("status")),
        result = o.optStringOrNull("result"),
        project = o.optStringOrNull("project"),
        choices = o.optJSONArray("choices")?.map { JobChoice(it.getString("id"), it.getString("label"), it.getString("detail")) },
        confirm = o.optStringOrNull("confirm"),
        finishedAt = o.optStringOrNull("finishedAt")?.let(OffsetDateTime::parse),
    )

    /** POST /api/chores/{id}/run: null fields are left out. */
    fun choreRun(projectId: String?, argument: String?): JSONObject = JSONObject()
        .putOpt("projectId", projectId)
        .putOpt("argument", argument)

    fun jobConfirm(choiceIds: List<String>): JSONObject = JSONObject().put("choices", JSONArray(choiceIds))

    /**
     * A readable reason from an error body: problem `detail`, else the first validation error
     * (ValidationProblem has only `errors`), else a plain `{ "error": … }`. Null when there is none.
     */
    fun problem(text: String): String? {
        val o = runCatching { JSONObject(text) }.getOrNull() ?: return null
        o.optStringOrNull("detail")?.takeIf { it.isNotBlank() }?.let { return it }
        o.optJSONObject("errors")?.let { errors ->
            errors.keys().asSequence().mapNotNull { errors.optJSONArray(it)?.optString(0) }.firstOrNull { it.isNotBlank() }?.let { return it }
        }
        return o.optStringOrNull("error")?.takeIf { it.isNotBlank() }
    }

    fun routine(o: JSONObject) = Routine(
        id = o.getString("id"),
        name = o.getString("name"),
        schedule = o.getString("schedule"),
        description = o.getString("description"),
        enabled = o.getBoolean("enabled"),
        choreId = o.optStringOrNull("choreId"),
        nextRunAt = o.optStringOrNull("nextRunAt")?.let(OffsetDateTime::parse),
        lastRunAt = o.optStringOrNull("lastRunAt")?.let(OffsetDateTime::parse),
    )

    fun inboxItem(o: JSONObject) = InboxItem(
        id = o.getString("id"),
        from = o.getString("from"),
        receivedAt = OffsetDateTime.parse(o.getString("receivedAt")),
        subject = o.getString("subject"),
        tag = o.getString("tag"),
        summary = o.getString("summary"),
        suggestedAction = InboxAction.fromWire(o.getString("suggestedAction")) ?: InboxAction.Archive,
        suggestion = o.getString("suggestion"),
        draft = o.optStringOrNull("draft"),
        handledWith = InboxAction.fromWire(o.optStringOrNull("handledWith")),
    )

    fun calendarEvent(o: JSONObject) = CalendarEvent(
        id = o.getString("id"),
        title = o.getString("title"),
        start = OffsetDateTime.parse(o.getString("start")),
        end = OffsetDateTime.parse(o.getString("end")),
        location = o.optStringOrNull("location"),
        suggested = o.getBoolean("suggested"),
    )

    fun newCalendarEvent(e: NewCalendarEvent): JSONObject = JSONObject()
        .put("title", e.title)
        .put("start", e.start.toString())
        .put("end", e.end.toString())
        .put("location", e.location ?: JSONObject.NULL)

    fun calendarDay(o: JSONObject) = CalendarDay(
        connected = o.getBoolean("connected"),
        date = LocalDate.parse(o.getString("date")),
        events = o.getJSONArray("events").map(::calendarEvent),
    )

    fun linearStatus(o: JSONObject) = LinearStatus(
        configured = o.getBoolean("configured"),
        workspaces = o.getJSONArray("workspaces").map { LinearWorkspace(it.getString("id"), it.getString("name"), it.optStringOrNull("error")) },
    )

    fun linearState(o: JSONObject) = LinearState(
        id = o.getString("id"),
        name = o.getString("name"),
        type = o.getString("type"),
        color = o.getString("color"),
    )

    fun linearTeam(o: JSONObject) = LinearTeam(
        id = o.getString("id"),
        key = o.getString("key"),
        name = o.getString("name"),
        workspaceId = o.getString("workspaceId"),
        workspace = o.getString("workspace"),
        states = o.getJSONArray("states").map(::linearState),
    )

    fun linearIssue(o: JSONObject) = LinearIssue(
        id = o.getString("id"),
        identifier = o.getString("identifier"),
        title = o.getString("title"),
        description = o.optStringOrNull("description"),
        priority = o.getInt("priority"),
        priorityLabel = o.getString("priorityLabel"),
        url = o.getString("url"),
        state = linearState(o.getJSONObject("state")),
        assignee = o.optStringOrNull("assignee"),
        updatedAt = OffsetDateTime.parse(o.getString("updatedAt")),
    )

    fun newLinearIssue(i: NewLinearIssue): JSONObject = JSONObject()
        .put("teamId", i.teamId)
        .put("title", i.title)
        .put("description", i.description ?: JSONObject.NULL)
        .put("priority", i.priority)
        .put("stateId", i.stateId ?: JSONObject.NULL)

    fun <T> list(text: String, parse: (JSONObject) -> T): List<T> = JSONArray(text).map(parse)

    private fun <T> JSONArray.map(parse: (JSONObject) -> T): List<T> = (0 until length()).map { parse(getJSONObject(it)) }

    /** org.json returns "null" for JSON null with optString; this returns a real null. */
    private fun JSONObject.optStringOrNull(key: String): String? = if (isNull(key)) null else optString(key)

    private fun JSONObject.optIntOrNull(key: String): Int? = if (isNull(key)) null else optInt(key)
}
