using System.ComponentModel;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using VeloqOS.Api.Integrations.Claude;

namespace VeloqOS.Api.Integrations.Voice;

/// <summary>
/// The voice on the signed-in subscription: one <c>claude</c> process that lives as long as the API, so a reply
/// never waits for Claude Code to start. It has no tools of its own, only <see cref="VoiceToolbox"/> over MCP, and
/// reads none of the user's settings. It remembers the conversation itself, so a turn sends only the new line
/// unless the dashboard's history says this is another conversation.
/// </summary>
public sealed class ClaudeCodeVoiceAgent(
    VoiceToolbox tools,
    VoiceTurnRecorder recorder,
    VoiceMcpAccess access,
    ILiveProcessStarter starter,
    IOptions<ClaudeOptions> claude,
    IOptions<VoiceOptions> options) : IVoiceAgent
{
    /// <summary>Lines a process may hold before the next turn starts a new one, so a long day does not grow every reply.</summary>
    public const int MaxLines = 40;

    private const int MaxReplay = 20;

    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly List<VoiceLine> _seen = [];
    private ILiveProcess? _process;
    private string _instructions = VoicePersonas.Instructions(new VoicePersona());

    public string Name => "claude-code";

    public async Task<VoiceTurn> TurnAsync(VoiceTurnRequest request, CancellationToken cancellationToken)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            var text = request.Text!.Trim();
            var history = (request.History ?? []).Where(l => !string.IsNullOrWhiteSpace(l.Text)).ToList();
            var replay = await PrepareAsync(VoicePersonas.Instructions(request.Persona ?? new VoicePersona()), history);
            var process = _process!;

            using var timer = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timer.CancelAfter(TimeSpan.FromSeconds(options.Value.TurnTimeoutSeconds));
            recorder.Begin();
            string reply;
            try
            {
                await process.WriteLineAsync(UserLine(Message(text, replay)), timer.Token);
                reply = await ReadReplyAsync(process, timer.Token);
            }
            catch (OperationCanceledException)
            {
                // It is still busy with the abandoned line, so it cannot answer the next one.
                await StopProcessAsync();
                cancellationToken.ThrowIfCancellationRequested();
                throw new VoiceException("Claude svarade inte i tid.", timedOut: true);
            }
            catch (IOException e)
            {
                await StopProcessAsync();
                throw new VoiceException($"Kunde inte nå Claude Code: {e.Message}");
            }

            var (actions, confirm) = recorder.End();
            _seen.Add(new VoiceLine("user", text));
            _seen.Add(new VoiceLine("assistant", reply));
            return new VoiceTurn(reply, actions, confirm);
        }
        finally
        {
            recorder.End();
            _gate.Release();
        }
    }

    /// <summary>Makes sure a process is up and returns when it has ended, for <see cref="VoiceKeepAlive"/>.</summary>
    public async Task KeepWarmAsync(CancellationToken cancellationToken)
    {
        await _gate.WaitAsync(cancellationToken);
        Task exited;
        try
        {
            if (_process is null || _process.Exited.IsCompleted) await StartAsync(_instructions);
            exited = _process!.Exited;
        }
        finally
        {
            _gate.Release();
        }
        await exited.WaitAsync(cancellationToken);
    }

    public async Task StopAsync()
    {
        await _gate.WaitAsync();
        try
        {
            await StopProcessAsync();
        }
        finally
        {
            _gate.Release();
        }
    }

    /// <summary>The right process for this turn, and the lines it must be told about because it has not seen them.</summary>
    private async Task<IReadOnlyList<VoiceLine>> PrepareAsync(string instructions, IReadOnlyList<VoiceLine> history)
    {
        var up = _process is not null && !_process.Exited.IsCompleted;
        if (up && instructions == _instructions && _seen.Count < MaxLines && Continues(history)) return [];
        await StartAsync(instructions);
        return history.TakeLast(MaxReplay).ToList();
    }

    /// <summary>The dashboard keeps only the latest lines, so its history may be shorter than what the process has seen.</summary>
    private bool Continues(IReadOnlyList<VoiceLine> history) =>
        history.Count == 0
            ? _seen.Count == 0
            : history.Count <= _seen.Count && _seen.Skip(_seen.Count - history.Count).SequenceEqual(history);

    private async Task StartAsync(string instructions)
    {
        await StopProcessAsync();
        var settings = claude.Value;
        var command = settings.ResolvedCommand ?? throw new VoiceException("Hittar inte Claude Code på datorn.");
        var home = Path.Combine(settings.ResolvedChatHome, "voice");
        Directory.CreateDirectory(home);
        // One per port: the Mac app and a development API can run side by side, each with its own token.
        var config = Path.Combine(home, $"mcp-{new Uri(access.Url).Port}.json");
        WritePrivate(config, access.Config());
        try
        {
            _process = starter.Start(command, Arguments(instructions, config, options.Value.Model), home, ClaudeCodeAgent.Environment());
        }
        catch (Exception e) when (e is Win32Exception or InvalidOperationException)
        {
            throw new VoiceException($"Kunde inte starta Claude Code: {e.Message}");
        }
        _instructions = instructions;
        _seen.Clear();
    }

    private async Task StopProcessAsync()
    {
        var process = _process;
        _process = null;
        _seen.Clear();
        if (process is not null) await process.StopAsync();
    }

    public static IReadOnlyList<string> Arguments(string instructions, string mcpConfig, string model) =>
    [
        "-p",
        "--input-format", "stream-json",
        "--output-format", "stream-json",
        "--verbose",
        "--model", model,
        "--system-prompt", instructions,
        // The voice's tools and nothing else: no files, no shell, none of the user's MCP servers.
        "--tools", "",
        "--mcp-config", mcpConfig,
        "--strict-mcp-config",
        "--allowedTools", $"mcp__{VoiceMcpServer.Name}",
        // Not the user's hooks, plugins or CLAUDE.md. The login is not a setting and still works.
        "--setting-sources", "",
        "--disable-slash-commands",
        "--no-session-persistence",
    ];

    private string Message(string text, IReadOnlyList<VoiceLine> replay)
    {
        var message = new StringBuilder(VoicePersonas.Clock(tools.LocalNow, tools.Zone)).Append('\n');
        if (replay.Count > 0)
        {
            message.Append("Samtalet hittills:\n");
            foreach (var line in replay) message.Append(line.Role == "assistant" ? "Du: " : "Vidar: ").Append(line.Text).Append('\n');
            message.Append('\n');
        }
        return message.Append("Vidar: ").Append(text).ToString();
    }

    private static string UserLine(string text) => JsonSerializer.Serialize(new
    {
        type = "user",
        message = new { role = "user", content = text },
    });

    private static async Task<string> ReadReplyAsync(ILiveProcess process, CancellationToken cancellationToken)
    {
        while (await process.ReadLineAsync(cancellationToken) is { } line)
        {
            if (ClaudeCodeAgent.StreamLine(line).Result is not { } result) continue;
            var text = result.TryGetProperty("result", out var r) && r.ValueKind == JsonValueKind.String ? r.GetString()!.Trim() : "";
            if (result.TryGetProperty("is_error", out var e) && e.ValueKind == JsonValueKind.True)
                throw new VoiceException(text.Length > 0 ? text : "Claude Code kunde inte svara.");
            return text.Length > 0 ? text : throw new VoiceException("Claude Code gav inget svar.");
        }
        var errors = process.Errors.Trim();
        throw new VoiceException(errors.Length > 0 ? $"Claude Code avslutades: {errors}" : "Claude Code avslutades mitt i svaret.");
    }

    private static void WritePrivate(string path, string content)
    {
        var mode = new FileStreamOptions { Mode = FileMode.Create, Access = FileAccess.Write };
        if (!OperatingSystem.IsWindows()) mode.UnixCreateMode = UnixFileMode.UserRead | UnixFileMode.UserWrite;
        using var file = new FileStream(path, mode);
        file.Write(Encoding.UTF8.GetBytes(content));
    }
}

/// <summary>Keeps Claude Code running for as long as the API does: started when the server is up, restarted if it dies.</summary>
public sealed class VoiceKeepAlive(IVoiceAgent agent, IHostApplicationLifetime lifetime, TimeProvider time, ILogger<VoiceKeepAlive> logger) : BackgroundService
{
    private static readonly TimeSpan RestartDelay = TimeSpan.FromSeconds(10);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (agent is not ClaudeCodeVoiceAgent claude) return;

        // Claude Code connects to the tools as it starts, and they are served by this API.
        var started = new TaskCompletionSource();
        using (lifetime.ApplicationStarted.Register(started.SetResult))
            await started.Task.WaitAsync(stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await claude.KeepWarmAsync(stoppingToken);
                logger.LogInformation("Claude Code för rösten avslutades, startar om.");
            }
            catch (VoiceException e)
            {
                logger.LogWarning("Kunde inte hålla Claude Code igång: {Reason}", e.Message);
            }
            await Task.Delay(RestartDelay, time, stoppingToken);
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        await base.StopAsync(cancellationToken);
        if (agent is ClaudeCodeVoiceAgent claude) await claude.StopAsync();
    }
}
