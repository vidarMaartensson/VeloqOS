using System.Text.Json;
using Microsoft.Extensions.Options;

namespace VeloqOS.Api.Integrations.Claude;

/// <summary><c>Claude:*</c> in configuration.</summary>
public sealed class ClaudeOptions
{
    /// <summary>Path to the <c>claude</c> CLI. Unset = look in the usual install folders; empty = use <see cref="EchoAgent"/>.</summary>
    public string? Command { get; set; }

    /// <summary><c>--permission-mode</c> in code mode. Nobody can answer a permission prompt mid-reply, so unapproved commands are denied.</summary>
    public string CodePermissionMode { get; set; } = "acceptEdits";

    /// <summary>
    /// <c>--permission-mode</c> for chores and skills. They run unattended and need git, package managers and tests,
    /// so the default lets Claude Code's classifier decide instead of denying every command.
    /// </summary>
    public string ChorePermissionMode { get; set; } = "auto";

    /// <summary>The user's skills, each in <c>&lt;name&gt;/SKILL.md</c>. Defaults to ~/.claude/skills.</summary>
    public string? SkillsFolder { get; set; }

    public string ResolvedSkillsFolder => SkillsFolder ?? Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".claude", "skills");

    public double TimeoutMinutes { get; set; } = 10;

    /// <summary>Where chat mode runs, so its sessions can be resumed. Defaults to VeloqOS/chat under the user's app data.</summary>
    public string? ChatHome { get; set; }

    public string ResolvedChatHome => ChatHome ?? Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "VeloqOS", "chat");

    /// <summary>
    /// Apps started from Finder (the Mac app's sidecar) do not get the shell's PATH, so look where the installers put it.
    /// </summary>
    public string? ResolvedCommand => Command switch
    {
        "" => null,
        { } command => command,
        null => SearchFolders.Select(folder => Path.Combine(folder, "claude")).FirstOrDefault(File.Exists),
    };

    public static IEnumerable<string> SearchFolders
    {
        get
        {
            var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            return [Path.Combine(home, ".local", "bin"), Path.Combine(home, ".claude", "local"), "/opt/homebrew/bin", "/usr/local/bin"];
        }
    }
}

/// <summary>
/// Answers through Claude Code on this Mac (<c>claude -p</c>), so it runs on the signed-in subscription.
/// Chat mode has no tools; code mode works in the project's folder.
/// </summary>
public sealed class ClaudeCodeAgent(IOptions<ClaudeOptions> options, ICommandRunner runner) : IAgent
{
    public async Task<AgentReply> ReplyAsync(AgentRequest request, CancellationToken cancellationToken)
    {
        var (command, workingDirectory, settings) = Prepare(request);
        try
        {
            var result = await runner.RunAsync(command, Arguments(request, settings), request.Text, workingDirectory, Environment(),
                TimeSpan.FromMinutes(settings.TimeoutMinutes), cancellationToken);
            return Parse(result);
        }
        catch (TimeoutException e)
        {
            throw new AgentException(e.Message, timedOut: true);
        }
    }

    public async Task<AgentReply> StreamAsync(AgentRequest request, Func<string, Task> onDelta, CancellationToken cancellationToken)
    {
        var (command, workingDirectory, settings) = Prepare(request);
        JsonElement? final = null;
        try
        {
            var result = await runner.StreamAsync(command, Arguments(request, settings, stream: true), request.Text, workingDirectory,
                Environment(), TimeSpan.FromMinutes(settings.TimeoutMinutes), async line =>
                {
                    switch (StreamLine(line))
                    {
                        case (string delta, null): await onDelta(delta); break;
                        case (null, JsonElement done): final = done; break;
                    }
                }, cancellationToken);
            if (final is null)
                throw new AgentException($"Claude Code svarade inte som väntat: {(string.IsNullOrWhiteSpace(result.Stderr) ? $"kod {result.ExitCode}" : result.Stderr.Trim())}");
            return FromResult(final.Value, result.ExitCode);
        }
        catch (TimeoutException e)
        {
            throw new AgentException(e.Message, timedOut: true);
        }
    }

    private (string Command, string WorkingDirectory, ClaudeOptions Settings) Prepare(AgentRequest request)
    {
        var settings = options.Value;
        var command = settings.ResolvedCommand ?? throw new AgentException("Hittar inte Claude Code på datorn.");
        var workingDirectory = request.Mode == AgentModes.Code ? request.WorkingDirectory! : settings.ResolvedChatHome;
        Directory.CreateDirectory(workingDirectory);
        return (command, workingDirectory, settings);
    }

    /// <summary>
    /// One line of <c>--output-format stream-json</c>: a piece of text (from <c>--include-partial-messages</c>),
    /// the final result, or neither.
    /// </summary>
    public static (string? Delta, JsonElement? Result) StreamLine(string line)
    {
        if (string.IsNullOrWhiteSpace(line)) return (null, null);
        JsonElement json;
        try
        {
            json = JsonDocument.Parse(line).RootElement;
        }
        catch (JsonException)
        {
            return (null, null);
        }

        var type = json.TryGetProperty("type", out var t) ? t.GetString() : null;
        if (type == "result") return (null, json.Clone());
        if (type == "stream_event"
            && json.TryGetProperty("event", out var e)
            && e.TryGetProperty("type", out var et) && et.GetString() == "content_block_delta"
            && e.TryGetProperty("delta", out var d)
            && d.TryGetProperty("type", out var dt) && dt.GetString() == "text_delta"
            && d.TryGetProperty("text", out var text))
            return (text.GetString(), null);
        return (null, null);
    }

    public static IReadOnlyList<string> Arguments(AgentRequest request, ClaudeOptions settings, bool stream = false)
    {
        // The prompt goes on stdin, so text that starts with "-" is never read as a flag.
        var args = stream
            ? new List<string> { "-p", "--output-format", "stream-json", "--verbose", "--include-partial-messages" }
            : new List<string> { "-p", "--output-format", "json" };
        if (request.Mode == AgentModes.Code)
            args.AddRange(["--permission-mode", request.PermissionMode ?? settings.CodePermissionMode]);
        else if (request.Tools is { Count: > 0 } tools)
            args.AddRange(["--tools", string.Join(',', tools), "--allowedTools", string.Join(',', tools)]);
        else
            args.AddRange(["--tools", ""]);

        if (!string.IsNullOrWhiteSpace(request.Context))
            args.AddRange(["--append-system-prompt", $"Samtalet gäller projektet {request.Context.Trim()} i Veloq OS."]);
        if (!string.IsNullOrWhiteSpace(request.SessionId))
            args.AddRange(["--resume", request.SessionId]);
        return args;
    }

    /// <summary>Without ANTHROPIC_API_KEY Claude Code uses the signed-in subscription instead of billing an API key.</summary>
    public static IReadOnlyDictionary<string, string?> Environment()
    {
        var path = string.Join(':', ClaudeOptions.SearchFolders.Append(System.Environment.GetEnvironmentVariable("PATH") ?? "/usr/bin:/bin"));
        return new Dictionary<string, string?> { ["ANTHROPIC_API_KEY"] = null, ["PATH"] = path };
    }

    public static AgentReply Parse(CommandResult result)
    {
        JsonElement json;
        try
        {
            json = JsonDocument.Parse(result.Stdout).RootElement;
        }
        catch (JsonException)
        {
            var detail = string.IsNullOrWhiteSpace(result.Stderr) ? result.Stdout : result.Stderr;
            throw new AgentException($"Claude Code svarade inte som väntat: {detail.Trim()}");
        }

        return FromResult(json, result.ExitCode);
    }

    private static AgentReply FromResult(JsonElement json, int exitCode)
    {
        var text = json.TryGetProperty("result", out var r) && r.ValueKind == JsonValueKind.String ? r.GetString()! : "";
        var sessionId = json.TryGetProperty("session_id", out var s) ? s.GetString() : null;
        var isError = json.TryGetProperty("is_error", out var e) && e.ValueKind == JsonValueKind.True;
        if (isError || exitCode != 0)
            throw new AgentException(string.IsNullOrWhiteSpace(text) ? $"Claude Code avslutade med kod {exitCode}." : text);
        return new AgentReply(text, sessionId);
    }
}
