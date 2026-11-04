package com.vidarmartensson.veloqos.notify

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.vidarmartensson.veloqos.data.HttpVeloqApi
import com.vidarmartensson.veloqos.data.SettingsStore
import kotlinx.coroutines.flow.first
import org.json.JSONException
import java.io.IOException
import java.util.concurrent.TimeUnit

/** Every 15 minutes with a network: asks the computer for its jobs and notifies about the finished ones. */
class JobWatchWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val connection = SettingsStore(applicationContext).connection.first()
        val api = HttpVeloqApi({ connection.baseUrl }, { connection.apiKey })
        return try {
            JobNotifier(applicationContext).check(api.jobs())
            Result.success()
        } catch (e: IOException) {
            // The computer is off or out of reach; the next run tries again.
            Result.success()
        } catch (e: JSONException) {
            Result.success()
        }
    }

    companion object {
        private const val NAME = "job-watch"

        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<JobWatchWorker>(15, TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(NAME, ExistingPeriodicWorkPolicy.KEEP, request)
        }
    }
}
