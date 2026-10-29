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
    )

    fun chore(o: JSONObject) = Chore(
        id = o.getString("id"),
        name = o.getString("name"),
        description = o.getString("description"),
        icon = o.getString("icon"),
        estimate = o.getString("estimate"),
    )

    fun job(o: JSONObject) = Job(
        id = o.getString("id"),
        choreId = o.getString("choreId"),
        title = o.getString("title"),
        step = o.getString("step"),
        progress = o.getDouble("progress").toFloat(),
        running = o.getString("status") == "running",
        result = o.optStringOrNull("result"),
    )

    fun routine(o: JSONObject) = Routine(
        id = o.getString("id"),
        name = o.getString("name"),
        schedule = o.getString("schedule"),
        description = o.getString("description"),
        enabled = o.getBoolean("enabled"),
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

    fun calendarDay(o: JSONObject) = CalendarDay(
        connected = o.getBoolean("connected"),
        date = LocalDate.parse(o.getString("date")),
        events = o.getJSONArray("events").map(::calendarEvent),
    )

    fun <T> list(text: String, parse: (JSONObject) -> T): List<T> = JSONArray(text).map(parse)

    private fun <T> JSONArray.map(parse: (JSONObject) -> T): List<T> = (0 until length()).map { parse(getJSONObject(it)) }

    /** org.json returns "null" for JSON null with optString; this returns a real null. */
    private fun JSONObject.optStringOrNull(key: String): String? = if (isNull(key)) null else optString(key)
}
