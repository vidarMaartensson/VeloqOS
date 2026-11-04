package com.vidarmartensson.veloqos.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.time.LocalDate

/** The calls the app makes. An interface so the ViewModel can be tested with a fake. */
interface VeloqApi {
    suspend fun overview(): Overview
    suspend fun projects(): List<Project>
    suspend fun system(): SystemInfo
    suspend fun projectStatus(): List<ProjectStatus>
    suspend fun stories(projectId: String): List<LinearIssue>
    suspend fun brief(): Brief?
    suspend fun chores(): List<Chore>
    suspend fun runChore(id: String, projectId: String? = null, argument: String? = null): Job
    suspend fun jobs(): List<Job>
    suspend fun confirmJob(id: String, choiceIds: List<String>): Job
    suspend fun routines(): List<Routine>
    suspend fun setRoutine(id: String, enabled: Boolean): Routine
    suspend fun runRoutine(id: String): Job
    suspend fun inbox(): List<InboxItem>
    suspend fun act(id: String, action: InboxAction, body: String? = null): InboxItem
    suspend fun undo(id: String): InboxItem
    suspend fun calendar(date: LocalDate): CalendarDay
    suspend fun connectCalendar(): String?
    suspend fun book(id: String)
    suspend fun createEvent(event: NewCalendarEvent): CalendarEvent
    suspend fun linear(): LinearStatus
    suspend fun linearTeams(): List<LinearTeam>
    suspend fun linearIssues(teamId: String, open: Boolean): List<LinearIssue>
    suspend fun createLinearIssue(issue: NewLinearIssue): LinearIssue
}

class ApiException(val status: Int, message: String) : IOException(message)

/** HttpURLConnection client against the Veloq OS API on the computer. */
class HttpVeloqApi(
    private val baseUrl: () -> String,
    private val apiKey: () -> String,
) : VeloqApi {

    override suspend fun overview() = Json.overview(JSONObject(get("/overview")))
    override suspend fun projects() = Json.list(get("/projects"), Json::project)
    override suspend fun system() = Json.system(JSONObject(get("/system")))
    override suspend fun projectStatus() = Json.list(get("/projects/status"), Json::projectStatus)
    override suspend fun stories(projectId: String) = Json.list(get("/projects/${enc(projectId)}/stories"), Json::linearIssue)

    /** 204 = no brief yet. */
    override suspend fun brief() = get("/brief").takeIf { it.isNotBlank() }?.let { Json.brief(JSONObject(it)) }
    override suspend fun chores() = Json.list(get("/chores"), Json::chore)
    override suspend fun runChore(id: String, projectId: String?, argument: String?) =
        Json.job(JSONObject(send("POST", "/chores/${enc(id)}/run", Json.choreRun(projectId, argument))))
    override suspend fun jobs() = Json.list(get("/jobs"), Json::job)
    override suspend fun confirmJob(id: String, choiceIds: List<String>) =
        Json.job(JSONObject(send("POST", "/jobs/${enc(id)}/confirm", Json.jobConfirm(choiceIds))))
    override suspend fun routines() = Json.list(get("/routines"), Json::routine)

    override suspend fun setRoutine(id: String, enabled: Boolean) =
        Json.routine(JSONObject(send("PUT", "/routines/${enc(id)}", JSONObject().put("enabled", enabled))))

    override suspend fun runRoutine(id: String) = Json.job(JSONObject(send("POST", "/routines/${enc(id)}/run")))

    override suspend fun inbox() = Json.list(get("/inbox"), Json::inboxItem)

    override suspend fun act(id: String, action: InboxAction, body: String?) = Json.inboxItem(
        JSONObject(send("POST", "/inbox/${enc(id)}/actions", JSONObject().put("action", action.wire).putOpt("body", body))),
    )

    override suspend fun undo(id: String) = Json.inboxItem(JSONObject(send("DELETE", "/inbox/${enc(id)}/actions")))
    override suspend fun calendar(date: LocalDate) = Json.calendarDay(JSONObject(get("/calendar?date=$date")))

    override suspend fun connectCalendar(): String? {
        val result = JSONObject(send("POST", "/calendar/connect"))
        return if (result.isNull("authUrl")) null else result.getString("authUrl")
    }

    override suspend fun book(id: String) {
        send("POST", "/calendar/suggestions/${enc(id)}/book")
    }

    override suspend fun createEvent(event: NewCalendarEvent) =
        Json.calendarEvent(JSONObject(send("POST", "/calendar/events", Json.newCalendarEvent(event))))

    override suspend fun linear() = Json.linearStatus(JSONObject(get("/linear")))
    override suspend fun linearTeams() = Json.list(get("/linear/teams"), Json::linearTeam)
    override suspend fun linearIssues(teamId: String, open: Boolean) =
        Json.list(get("/linear/issues?teamId=${enc(teamId)}&open=$open"), Json::linearIssue)
    override suspend fun createLinearIssue(issue: NewLinearIssue) =
        Json.linearIssue(JSONObject(send("POST", "/linear/issues", Json.newLinearIssue(issue))))

    private suspend fun get(path: String) = send("GET", path)

    private suspend fun send(method: String, path: String, body: JSONObject? = null, readTimeoutMs: Int = 15_000): String = withContext(Dispatchers.IO) {
        val connection = open(method, path, body, readTimeoutMs)
        try {
            if (check(connection, method, path) == HttpURLConnection.HTTP_NO_CONTENT) "" else connection.inputStream.bufferedReader().use { it.readText() }
        } finally {
            connection.disconnect()
        }
    }

    /** Opens the connection and writes [body]; call on the IO dispatcher. */
    private fun open(method: String, path: String, body: JSONObject?, readTimeoutMs: Int): HttpURLConnection {
        val connection = (URL(baseUrl().trimEnd('/') + "/api" + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 5_000
            readTimeout = readTimeoutMs
            setRequestProperty("Accept", "application/json")
            apiKey().takeIf { it.isNotBlank() }?.let { setRequestProperty("X-Veloq-Key", it) }
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
            }
        }
        try {
            body?.let { connection.outputStream.use { out -> out.write(it.toString().toByteArray()) } }
        } catch (e: IOException) {
            connection.disconnect()
            throw e
        }
        return connection
    }

    /** The status when it is 2xx, otherwise [ApiException] with the API's reason. */
    private fun check(connection: HttpURLConnection, method: String, path: String): Int {
        val status = connection.responseCode
        if (status !in 200..299) {
            // Problem details carry a readable reason, e.g. "Välj ett projekt först."
            val detail = runCatching { Json.problem(connection.errorStream.bufferedReader().use { it.readText() }) }.getOrNull()
            throw ApiException(status, detail ?: "$method $path gav $status")
        }
        return status
    }

    private fun enc(value: String) = java.net.URLEncoder.encode(value, "UTF-8")
}
