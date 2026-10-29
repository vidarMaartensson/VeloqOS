package com.vidarmartensson.veloqos.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.vidarmartensson.veloqos.ui.UiState
import com.vidarmartensson.veloqos.ui.components.Label
import com.vidarmartensson.veloqos.ui.components.LiveDot
import com.vidarmartensson.veloqos.ui.components.Pill
import com.vidarmartensson.veloqos.ui.components.SendButton
import com.vidarmartensson.veloqos.ui.theme.Veloq
import com.vidarmartensson.veloqos.ui.theme.VeloqType

@Composable
fun PromptScreen(state: UiState, onSend: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(18.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 8.dp)) {
            Label(state.promptContext ?: "Fritt", accent = true)
            Text("Plan först.", style = VeloqType.Display)
        }
        Row(
            Modifier
                .fillMaxWidth()
                .clip(Veloq.RadiusMd)
                .background(Veloq.BgSunk)
                .border(1.dp, Veloq.Line, Veloq.RadiusMd)
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (state.thinking) LiveDot()
            Text(if (state.thinking) "Veloq OS tänker…" else "Svaren kommer från datorn", style = VeloqType.Meta, modifier = Modifier.weight(1f))
            Pill("Plan först")
        }
        if (state.messages.isEmpty()) {
            Text("Skriv vad du vill göra. Veloq OS gör en plan och frågar innan något byggs.", style = VeloqType.Body)
        }
        state.messages.forEach { message ->
            if (message.fromUser) {
                Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
                    Text(
                        message.text,
                        style = VeloqType.Body.copy(color = Veloq.Ink),
                        modifier = Modifier
                            .widthIn(max = 300.dp)
                            .clip(RoundedCornerShape(20.dp, 20.dp, 8.dp, 20.dp))
                            .background(Veloq.SurfaceRaised)
                            .border(1.dp, Veloq.Line, RoundedCornerShape(20.dp, 20.dp, 8.dp, 20.dp))
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                    )
                }
            } else {
                Text(message.text, style = VeloqType.Body)
            }
        }
        PromptField(placeholder = "Fortsätt…", onSend = onSend)
    }
}

/** Pill text field with the round send button – the same on Hem and Prompt. */
@Composable
fun PromptField(placeholder: String, onSend: (String) -> Unit) {
    var text by rememberSaveable { mutableStateOf("") }
    val submit = {
        if (text.isNotBlank()) {
            onSend(text)
            text = ""
        }
    }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(
            Modifier
                .weight(1f)
                .heightIn(min = 52.dp)
                .clip(Veloq.Pill)
                .background(Veloq.Bg)
                .border(1.dp, Veloq.LineStrong, Veloq.Pill)
                .padding(horizontal = 20.dp),
            contentAlignment = Alignment.CenterStart,
        ) {
            if (text.isEmpty()) Text(placeholder, style = VeloqType.Body.copy(color = Veloq.InkMuted))
            BasicTextField(
                value = text,
                onValueChange = { text = it },
                singleLine = true,
                textStyle = VeloqType.Body.copy(color = Veloq.Ink),
                cursorBrush = SolidColor(Veloq.Accent),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                keyboardActions = KeyboardActions(onSend = { submit() }),
                modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Prompt" },
            )
        }
        SendButton(onClick = submit)
    }
}
