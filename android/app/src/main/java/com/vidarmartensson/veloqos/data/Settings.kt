package com.vidarmartensson.veloqos.data

import android.content.Context
import android.os.Build
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import java.time.OffsetDateTime

private val Context.dataStore by preferencesDataStore(name = "veloq_settings")

data class Connection(val baseUrl: String, val apiKey: String)

/** Where the computer's API is and the key it expects. */
class SettingsStore(private val context: Context) {
    private val urlKey = stringPreferencesKey("base_url")
    private val apiKeyKey = stringPreferencesKey("api_key")
    private val lastSeenKey = stringPreferencesKey("last_seen_finished_at")
    private val askedKey = booleanPreferencesKey("asked_notifications")

    val connection: Flow<Connection> = context.dataStore.data.map {
        Connection(it[urlKey] ?: DEFAULT_URL, it[apiKeyKey] ?: "")
    }

    suspend fun save(connection: Connection) {
        context.dataStore.edit {
            it[urlKey] = connection.baseUrl.trim()
            it[apiKeyKey] = connection.apiKey.trim()
        }
    }

    /** The newest job finishedAt already notified about (or seen in the open app); null before the first check. */
    suspend fun lastSeenFinishedAt(): OffsetDateTime? =
        context.dataStore.data.first()[lastSeenKey]?.let { runCatching { OffsetDateTime.parse(it) }.getOrNull() }

    suspend fun saveLastSeenFinishedAt(time: OffsetDateTime) {
        context.dataStore.edit { it[lastSeenKey] = time.toString() }
    }

    /** Whether the app has asked for the notification permission – it asks once. */
    suspend fun askedNotifications(): Boolean = context.dataStore.data.first()[askedKey] ?: false

    suspend fun markAskedNotifications() {
        context.dataStore.edit { it[askedKey] = true }
    }

    companion object {
        private val isEmulator: Boolean
            get() = Build.FINGERPRINT.contains("generic") || Build.HARDWARE.contains("ranchu") || Build.PRODUCT.contains("sdk")

        /**
         * The emulator reaches the host on 10.0.2.2. A real phone on USB uses localhost, which
         * scripts/start.sh forwards to the computer with `adb reverse tcp:7480 tcp:7480`.
         */
        val DEFAULT_URL: String
            get() = if (isEmulator) "http://10.0.2.2:7480" else "http://127.0.0.1:7480"
    }
}
