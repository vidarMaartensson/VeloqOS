package com.vidarmartensson.veloqos

import com.vidarmartensson.veloqos.data.CalendarDay
import com.vidarmartensson.veloqos.data.CalendarEvent
import com.vidarmartensson.veloqos.data.Chore
import com.vidarmartensson.veloqos.data.InboxAction
import com.vidarmartensson.veloqos.data.InboxItem
import com.vidarmartensson.veloqos.data.Job
import com.vidarmartensson.veloqos.data.Overview
import com.vidarmartensson.veloqos.data.Project
import com.vidarmartensson.veloqos.data.Routine
import com.vidarmartensson.veloqos.data.VeloqApi
import com.vidarmartensson.veloqos.ui.AppViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.IOException
import java.time.LocalDate
import java.time.OffsetDateTime

@OptIn(ExperimentalCoroutinesApi::class)
class AppViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    private val day = LocalDate.of(2026, 10, 29)

    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    /** In-memory API with just enough behaviour for the ViewModel. */
    private class FakeApi : VeloqApi {
        var failNext = false
        var connected = false
        var jobPolls = 0
        val inbox = mutableListOf(
            InboxItem("m1", "GitHub", OffsetDateTime.parse("2026-10-29T14:52:00+01:00"), "CI", "Åtgärd", "s", InboxAction.Delegate, "fix", null, null),
        )

        override suspend fun overview(): Overview {
            if (failNext) { failNext = false; throw IOException("nere") }
            return Overview(1, 1, 0, inbox.count { it.handledWith == null }, 1, 1, 0)
        }
        override suspend fun projects() = listOf(Project("p", "HaloDeck", "m", "I utveckling", 3, "b", "Appar"))
        override suspend fun chores() = listOf(Chore("memory-cleanup", "Städa minnet", "d", "memory", "≈ 1 min"))
        override suspend fun runChore(id: String) = Job("j", id, "Städa minnet", "Kör…", 0f, true, null)
        override suspend fun jobs(): List<Job> {
            jobPolls++
            return listOf(Job("j", "memory-cleanup", "Städa minnet", "Klart", 1f, false, "Klart."))
        }
        override suspend fun routines() = listOf(Routine("r", "Morgonbrief", "Vardagar · 07:40", "d", true))
        override suspend fun setRoutine(id: String, enabled: Boolean) = Routine(id, "Morgonbrief", "Vardagar · 07:40", "d", enabled)
        override suspend fun inbox() = inbox.toList()
        override suspend fun act(id: String, action: InboxAction, body: String?): InboxItem {
            val i = inbox.indexOfFirst { it.id == id }
            inbox[i] = inbox[i].copy(handledWith = action)
            return inbox[i]
        }
        override suspend fun undo(id: String): InboxItem {
            val i = inbox.indexOfFirst { it.id == id }
            inbox[i] = inbox[i].copy(handledWith = null)
            return inbox[i]
        }
        override suspend fun calendar(date: LocalDate) = CalendarDay(
            connected, date,
            if (connected) listOf(CalendarEvent("e", "Fokus", OffsetDateTime.parse("2026-10-29T09:00:00+01:00"), OffsetDateTime.parse("2026-10-29T11:00:00+01:00"), null, true)) else emptyList(),
        )
        override suspend fun connectCalendar(): String? { connected = true; return null }
        override suspend fun book(id: String) {}
        override suspend fun prompt(text: String, context: String?) = "Plan för ${context ?: "det här"}."
    }

    private fun viewModel(api: FakeApi = FakeApi()) = AppViewModel(api, today = { day }, pollMillis = 1_000)

    @Test
    fun `loads everything on start`() = runTest(dispatcher) {
        val vm = viewModel()
        advanceUntilIdle()
        val s = vm.state.value
        assertFalse(s.loading)
        assertNull(s.error)
        assertEquals("HaloDeck", s.projects.single().name)
        assertEquals(1, s.needsYou)
        assertFalse(s.calendar!!.connected)
    }

    @Test
    fun `running a chore adds a job and polls until it is done`() = runTest(dispatcher) {
        val api = FakeApi()
        val vm = viewModel(api)
        advanceUntilIdle()
        val pollsBefore = api.jobPolls

        vm.runChore("memory-cleanup")
        advanceTimeBy(1_500)

        assertTrue(api.jobPolls > pollsBefore)
        assertFalse(vm.state.value.choreState("memory-cleanup")!!.running)
    }

    @Test
    fun `acting on mail updates the item and undo restores it`() = runTest(dispatcher) {
        val vm = viewModel()
        advanceUntilIdle()

        vm.act("m1", InboxAction.Archive)
        advanceUntilIdle()
        assertEquals(InboxAction.Archive, vm.state.value.inbox.single().handledWith)
        assertEquals(0, vm.state.value.needsYou)

        vm.undo("m1")
        advanceUntilIdle()
        assertNull(vm.state.value.inbox.single().handledWith)
    }

    @Test
    fun `connecting the calendar loads the day`() = runTest(dispatcher) {
        val vm = viewModel()
        advanceUntilIdle()

        vm.connectCalendar(openUrl = { error("should not open a browser for the sample provider") })
        advanceUntilIdle()

        assertTrue(vm.state.value.calendar!!.connected)
        assertTrue(vm.state.value.calendar!!.events.single().suggested)
    }

    @Test
    fun `prompt keeps the project as context`() = runTest(dispatcher) {
        val vm = viewModel()
        advanceUntilIdle()

        vm.setPromptContext("HaloDeck")
        vm.send("Planera")
        advanceUntilIdle()

        val messages = vm.state.value.messages
        assertEquals(listOf(true, false), messages.map { it.fromUser })
        assertEquals("Plan för HaloDeck.", messages.last().text)
        assertFalse(vm.state.value.thinking)
    }

    @Test
    fun `errors are shown and can be dismissed`() = runTest(dispatcher) {
        val api = FakeApi().apply { failNext = true }
        val vm = viewModel(api)
        advanceUntilIdle()
        assertNotNull(vm.state.value.error)

        vm.dismissError()
        vm.refresh()
        advanceUntilIdle()
        assertNull(vm.state.value.error)
    }
}
