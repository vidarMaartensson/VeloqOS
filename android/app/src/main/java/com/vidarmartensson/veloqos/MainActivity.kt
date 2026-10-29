package com.vidarmartensson.veloqos

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import com.vidarmartensson.veloqos.data.Connection
import com.vidarmartensson.veloqos.data.HttpVeloqApi
import com.vidarmartensson.veloqos.data.SettingsStore
import com.vidarmartensson.veloqos.ui.AppViewModel
import com.vidarmartensson.veloqos.ui.VeloqApp
import com.vidarmartensson.veloqos.ui.theme.VeloqTheme
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    private val settings by lazy { SettingsStore(applicationContext) }
    private val connection = MutableStateFlow(Connection(SettingsStore.DEFAULT_URL, ""))

    private val viewModel: AppViewModel by viewModels {
        object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T =
                AppViewModel(HttpVeloqApi({ connection.value.baseUrl }, { connection.value.apiKey })) as T
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        lifecycleScope.launch {
            settings.connection.distinctUntilChanged().collect { saved ->
                val changed = saved != connection.value
                connection.value = saved
                if (changed) viewModel.refresh()
            }
        }

        setContent {
            VeloqTheme {
                VeloqApp(
                    viewModel = viewModel,
                    connection = connection,
                    onSaveConnection = { lifecycleScope.launch { settings.save(it) } },
                    openUrl = { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(it))) },
                )
            }
        }
    }
}
