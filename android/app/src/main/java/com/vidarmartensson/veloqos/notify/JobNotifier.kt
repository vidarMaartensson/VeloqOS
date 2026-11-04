package com.vidarmartensson.veloqos.notify

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.vidarmartensson.veloqos.MainActivity
import com.vidarmartensson.veloqos.R
import com.vidarmartensson.veloqos.data.Job
import com.vidarmartensson.veloqos.data.SettingsStore
import com.vidarmartensson.veloqos.domain.Logic
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Notifies about jobs that finished since the last check. The periodic worker and the open app's
 * job polling both feed it, so a job is notified about once. No push service: the app asks the API.
 */
class JobNotifier(context: Context) {
    private val context = context.applicationContext
    private val settings = SettingsStore(this.context)

    /** Records what is seen; notifies only while the app is not on screen. */
    suspend fun check(jobs: List<Job>) = lock.withLock {
        val decision = Logic.jobsToNotify(jobs, settings.lastSeenFinishedAt())
        decision.seen?.let { settings.saveLastSeenFinishedAt(it) }
        if (!foreground) decision.notify.forEach(::post)
    }

    /** For the view model's callback, which is not suspending. */
    fun checkLater(jobs: List<Job>) {
        scope.launch { runCatching { check(jobs) } }
    }

    private fun post(job: Job) {
        if (!allowed(context)) return
        createChannel(context)
        val (title, text) = Logic.notification(job)
        val open = PendingIntent.getActivity(
            context,
            0,
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val notification = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        try {
            NotificationManagerCompat.from(context).notify(job.id.hashCode(), notification)
        } catch (e: SecurityException) {
            // The permission was taken back between the check and the post.
        }
    }

    companion object {
        const val CHANNEL = "jobs"
        private val lock = Mutex()
        private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

        /** Set by MainActivity: true while the user can see the app, so nothing pops up over it. */
        @Volatile var foreground = false

        /** Below Android 13 notifications need no runtime permission. */
        fun allowed(context: Context) = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

        fun createChannel(context: Context) {
            val manager = context.getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(NotificationChannel(CHANNEL, "Jobb", NotificationManager.IMPORTANCE_DEFAULT))
        }
    }
}
