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
    suspend fun chores(): List<Chore>
    suspend fun runChore(id: String): Job
    suspend fun jobs(): List<Job>
    suspend fun routines(): List<Routine>
    suspend fun setRoutine(id: String, enabled: Boolean): Routine
    suspend fun inbox(): List<InboxItem>
    suspend fun act(id: String, action: InboxAction, body: String? = null): InboxItem
    suspend fun undo(id: String): InboxItem
    suspend fun calendar(date: LocalDate): CalendarDay
    suspend fun connectCalendar(): String?
    suspend fun book(id: String)
    suspend fun prompt(text: String, context: String?): String
}

class ApiException(val status: Int, message: String) : IOException(message)

/** HttpURLConnection client against the Veloq OS API on the computer. */
class HttpVeloqApi(
    private val baseUrl: () -> String,
    private val apiKey: () -> String,
) : VeloqApi {

    override suspend fun overview() = Json.overview(JSONObject(get("/overview")))
    override suspend fun projects() = Json.list(get("/projects"), Json::project)
    override suspend fun chores() = Json.list(get("/chores"), Json::chore)
    override suspend fun runChore(id: String) = Json.job(JSONObject(send("POST", "/chores/${enc(id)}/run")))
    override suspend fun jobs() = Json.list(get("/jobs"), Json::job)
    override suspend fun routines() = Json.list(get("/routines"), Json::routine)

    override suspend fun setRoutine(id: String, enabled: Boolean) =
        Json.routine(JSONObject(send("PUT", "/routines/${enc(id)}", JSONObject().put("enabled", enabled))))

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

    override suspend fun prompt(text: String, context: String?) =
        JSONObject(send("POST", "/prompt", JSONObject().put("text", text).putOpt("context", context))).getString("reply")

    private suspend fun get(path: String) = send("GET", path)

    private suspend fun send(method: String, path: String, body: JSONObject? = null): String = withContext(Dispatchers.IO) {
        val connection = (URL(baseUrl().trimEnd('/') + "/api" + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 5_000
            readTimeout = 15_000
            setRequestProperty("Accept", "application/json")
            apiKey().takeIf { it.isNotBlank() }?.let { setRequestProperty("X-Veloq-Key", it) }
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
            }
        }
        try {
            body?.let { connection.outputStream.use { out -> out.write(it.toString().toByteArray()) } }
            val status = connection.responseCode
            if (status !in 200..299) throw ApiException(status, "$method $path gav $status")
            connection.inputStream.bufferedReader().use { it.readText() }
        } finally {
            connection.disconnect()
        }
    }

    private fun enc(value: String) = java.net.URLEncoder.encode(value, "UTF-8")
}
