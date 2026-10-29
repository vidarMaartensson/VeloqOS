package com.vidarmartensson.veloqos.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vidarmartensson.veloqos.data.CalendarDay
import com.vidarmartensson.veloqos.data.Chore
import com.vidarmartensson.veloqos.data.InboxAction
import com.vidarmartensson.veloqos.data.InboxItem
import com.vidarmartensson.veloqos.data.Job
import com.vidarmartensson.veloqos.data.Overview
import com.vidarmartensson.veloqos.data.Project
import com.vidarmartensson.veloqos.data.Routine
import com.vidarmartensson.veloqos.data.VeloqApi
import com.vidarmartensson.veloqos.domain.Logic
import kotlinx.coroutines.Job as CoroutineJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.ZonedDateTime

data class Message(val fromUser: Boolean, val text: String)

data class UiState(
    val loading: Boolean = true,
    val error: String? = null,
    val overview: Overview? = null,
    val projects: List<Project> = emptyList(),
    val chores: List<Chore> = emptyList(),
    val jobs: List<Job> = emptyList(),
    val routines: List<Routine> = emptyList(),
    val inbox: List<InboxItem> = emptyList(),
    val calendar: CalendarDay? = null,
    val messages: List<Message> = emptyList(),
    val thinking: Boolean = false,
    val promptContext: String? = null,
) {
    val needsYou get() = Logic.needsYou(inbox)
    fun choreState(id: String): Job? = jobs.firstOrNull { it.choreId == id }
}

/** All app state. The API owns the rules; this mirrors them and keeps the UI responsive. */
class AppViewModel(
    private val api: VeloqApi,
    private val today: () -> LocalDate = { ZonedDateTime.now(Logic.zone).toLocalDate() },
    private val pollMillis: Long = 1_000,
) : ViewModel() {

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()
    private var polling: CoroutineJob? = null

    init {
        refresh()
    }

    fun refresh() = launchSafely {
        _state.update { it.copy(loading = true) }
        _state.update {
            it.copy(
                loading = false,
                error = null,
                overview = api.overview(),
                projects = api.projects(),
                chores = api.chores(),
                jobs = api.jobs(),
                routines = api.routines(),
                inbox = api.inbox(),
                calendar = api.calendar(today()),
            )
        }
        pollWhileRunning()
    }

    fun runChore(id: String) = launchSafely {
        val job = api.runChore(id)
        _state.update { it.copy(jobs = listOf(job) + it.jobs) }
        pollWhileRunning()
    }

    fun setRoutine(id: String, enabled: Boolean) = launchSafely {
        _state.update { s -> s.copy(routines = s.routines.map { if (it.id == id) it.copy(enabled = enabled) else it }) }
        api.setRoutine(id, enabled)
        _state.update { it.copy(overview = api.overview()) }
    }

    fun act(id: String, action: InboxAction, body: String? = null) = launchSafely {
        replace(api.act(id, action, body))
        if (action == InboxAction.Calendar) _state.update { it.copy(calendar = api.calendar(today())) }
        _state.update { it.copy(overview = api.overview()) }
    }

    fun undo(id: String) = launchSafely {
        replace(api.undo(id))
        _state.update { it.copy(overview = api.overview()) }
    }

    fun connectCalendar(openUrl: (String) -> Unit) = launchSafely {
        val authUrl = api.connectCalendar()
        if (authUrl != null) openUrl(authUrl) else _state.update { it.copy(calendar = api.calendar(today())) }
    }

    fun book(id: String) = launchSafely {
        api.book(id)
        _state.update { it.copy(calendar = api.calendar(today())) }
    }

    fun setPromptContext(context: String?) = _state.update { it.copy(promptContext = context) }

    fun send(text: String) {
        val trimmed = text.trim()
        if (trimmed.isEmpty() || _state.value.thinking) return
        _state.update { it.copy(thinking = true, messages = it.messages + Message(fromUser = true, text = trimmed)) }
        launchSafely(onError = { _state.update { it.copy(thinking = false) } }) {
            val reply = api.prompt(trimmed, _state.value.promptContext)
            _state.update { it.copy(thinking = false, messages = it.messages + Message(fromUser = false, text = reply)) }
        }
    }

    fun dismissError() = _state.update { it.copy(error = null) }

    private fun replace(item: InboxItem) =
        _state.update { s -> s.copy(inbox = s.inbox.map { if (it.id == item.id) item else it }) }

    private fun pollWhileRunning() {
        if (polling?.isActive == true || _state.value.jobs.none { it.running }) return
        polling = viewModelScope.launch {
            while (isActive && _state.value.jobs.any { it.running }) {
                delay(pollMillis)
                runCatching { api.jobs() }.onSuccess { jobs -> _state.update { it.copy(jobs = jobs) } }
            }
            runCatching { api.overview() }.onSuccess { o -> _state.update { it.copy(overview = o) } }
        }
    }

    private fun launchSafely(onError: () -> Unit = {}, block: suspend () -> Unit) {
        viewModelScope.launch {
            try {
                block()
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                onError()
                _state.update { it.copy(loading = false, error = e.message ?: "Något gick fel.") }
            }
        }
    }
}
