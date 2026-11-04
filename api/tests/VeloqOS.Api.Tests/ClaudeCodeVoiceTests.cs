using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading.Channels;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using VeloqOS.Api.Integrations.Claude;
using VeloqOS.Api.Integrations.Voice;

namespace VeloqOS.Api.Tests;

/// <summary>Stands in for the <c>claude</c> process: answers each line through <see cref="Answer"/>.</summary>
internal sealed class FakeProcess(Func<string, string?> answer) : ILiveProcess
{
    private readonly Channel<string?> _out = Channel.CreateUnbounded<string?>();
    private readonly TaskCompletionSource _exited = new();

    public List<string> Written { get; } = [];
    public bool Stopped { get; private set; }
    public Task Exited => _exited.Task;
    public string Errors { get; set; } = "";

    public string LastMessage => JsonDocument.Parse(Written[^1]).RootElement.GetProperty("message").GetProperty("content").GetString()!;

    public Task WriteLineAsync(string line, CancellationToken cancellationToken)
    {
        Written.Add(line);
        var content = JsonDocument.Parse(line).RootElement.GetProperty("message").GetProperty("content").GetString()!;
        if (answer(content) is { } reply) _out.Writer.TryWrite(reply);
        return Task.CompletedTask;
    }

    public async Task<string?> ReadLineAsync(CancellationToken cancellationToken)
    {
        var line = await _out.Reader.ReadAsync(cancellationToken);
        if (line is null) _out.Writer.TryWrite(null);
        return line;
    }

    public Task StopAsync()
    {
        Stopped = true;
        Exit();
        return Task.CompletedTask;
    }

    public void Exit()
    {
        _out.Writer.TryWrite(null);
        _exited.TrySetResult();
    }

    public static string Result(string text, bool isError = false) =>
        JsonSerializer.Serialize(new { type = "result", result = text, is_error = isError, session_id = "s" });
}

internal sealed class FakeStarter(Func<string, string?> answer) : ILiveProcessStarter
{
    public List<FakeProcess> Started { get; } = [];
    public List<IReadOnlyList<string>> Arguments { get; } = [];
    public List<IReadOnlyDictionary<string, string?>> Environments { get; } = [];
    public bool Fail { get; set; }

    public ILiveProcess Start(string file, IReadOnlyList<string> arguments, string workingDirectory, IReadOnlyDictionary<string, string?> environment)
    {
        if (Fail) throw new InvalidOperationException("finns inte");
        Arguments.Add(arguments);
        Environments.Add(environment);
        var process = new FakeProcess(answer);
        Started.Add(process);
        return process;
    }
}

public class ClaudeCodeVoiceAgentTests(ApiTests.Factory factory) : IClassFixture<ApiTests.Factory>
{
    private readonly string _home = Path.Combine(Path.GetTempPath(), $"veloq-voice-{Guid.NewGuid()}");

    private (ClaudeCodeVoiceAgent Agent, FakeStarter Starter) Agent(Func<string, string?>? answer = null, double timeout = 30)
    {
        var starter = new FakeStarter(answer ?? (_ => FakeProcess.Result("Klart, Vidar.")));
        var claude = Options.Create(new ClaudeOptions { Command = "/fake/claude", ChatHome = _home });
        var voice = Options.Create(new VoiceOptions { Model = "claude-test", TurnTimeoutSeconds = timeout });
        var recorder = factory.Services.GetRequiredService<VoiceTurnRecorder>();
        var agent = new ClaudeCodeVoiceAgent(factory.Services.GetRequiredService<VoiceToolbox>(), recorder,
            factory.Services.GetRequiredService<VoiceMcpAccess>(), starter, claude, voice);
        return (agent, starter);
    }

    private static VoiceTurnRequest Line(string text, params VoiceLine[] history) => new(text, history);

    [Fact]
    public async Task Runs_with_the_voice_tools_only_and_on_the_subscription()
    {
        var (agent, starter) = Agent();

        await agent.TurnAsync(Line("Hej"), default);

        var args = starter.Arguments.Single();
        string After(string flag) => args[args.ToList().IndexOf(flag) + 1];
        Assert.Equal("", After("--tools"));
        Assert.Equal("", After("--setting-sources"));
        Assert.Equal("mcp__veloq", After("--allowedTools"));
        Assert.Equal("claude-test", After("--model"));
        Assert.Contains("--strict-mcp-config", args);
        Assert.Contains("--no-session-persistence", args);
        Assert.True(starter.Environments.Single().TryGetValue("ANTHROPIC_API_KEY", out var key) && key is null);
    }

    [Fact]
    public async Task The_config_holds_the_token_and_only_the_user_can_read_it()
    {
        var (agent, starter) = Agent();

        await agent.TurnAsync(Line("Hej"), default);

        var args = starter.Arguments.Single().ToList();
        var path = args[args.IndexOf("--mcp-config") + 1];
        var server = JsonDocument.Parse(File.ReadAllText(path)).RootElement.GetProperty("mcpServers").GetProperty("veloq");
        Assert.StartsWith("http://127.0.0.1:", server.GetProperty("url").GetString());
        Assert.Equal(factory.Services.GetRequiredService<VoiceMcpAccess>().Token, server.GetProperty("headers").GetProperty(VoiceMcpAccess.HeaderName).GetString());
        Assert.Equal(UnixFileMode.UserRead | UnixFileMode.UserWrite, File.GetUnixFileMode(path));
    }

    [Fact]
    public async Task Keeps_one_process_and_sends_only_the_new_line_with_the_clock()
    {
        var (agent, starter) = Agent();

        var first = await agent.TurnAsync(Line("Hur mår du?"), default);
        await agent.TurnAsync(Line("Och nu?", new VoiceLine("user", "Hur mår du?"), new VoiceLine("assistant", first.Reply)), default);

        var process = Assert.Single(starter.Started);
        Assert.Equal(2, process.Written.Count);
        Assert.StartsWith("Nu är det ", process.LastMessage);
        Assert.EndsWith("Vidar: Och nu?", process.LastMessage);
        Assert.DoesNotContain("Hur mår du?", process.LastMessage);
    }

    [Fact]
    public async Task A_shortened_history_is_still_the_same_conversation()
    {
        var (agent, starter) = Agent();

        var first = await agent.TurnAsync(Line("Ett"), default);
        var second = await agent.TurnAsync(Line("Två", new VoiceLine("user", "Ett"), new VoiceLine("assistant", first.Reply)), default);
        await agent.TurnAsync(Line("Tre", new VoiceLine("user", "Två"), new VoiceLine("assistant", second.Reply)), default);

        Assert.Single(starter.Started);
    }

    [Fact]
    public async Task An_empty_history_after_a_conversation_starts_a_new_one()
    {
        var (agent, starter) = Agent();

        await agent.TurnAsync(Line("Ett"), default);
        await agent.TurnAsync(Line("Två"), default);

        Assert.Equal(2, starter.Started.Count);
        Assert.True(starter.Started[0].Stopped);
    }

    [Fact]
    public async Task Another_history_is_told_to_a_new_process()
    {
        var (agent, starter) = Agent();

        await agent.TurnAsync(Line("Ett"), default);
        await agent.TurnAsync(Line("Tre", new VoiceLine("user", "Något annat"), new VoiceLine("assistant", "Jaså")), default);

        Assert.Equal(2, starter.Started.Count);
        Assert.Contains("Samtalet hittills:\nVidar: Något annat\nDu: Jaså", starter.Started[1].LastMessage);
    }

    [Fact]
    public async Task Another_persona_gets_a_process_with_its_instructions()
    {
        var (agent, starter) = Agent();
        string Prompt(int i)
        {
            var args = starter.Arguments[i].ToList();
            return args[args.IndexOf("--system-prompt") + 1];
        }

        await agent.TurnAsync(new VoiceTurnRequest("Hej", null, new VoicePersona(VoicePersona.Rick)), default);
        await agent.TurnAsync(new VoiceTurnRequest("Hej", [new VoiceLine("user", "Hej"), new VoiceLine("assistant", "Klart, Vidar.")], new VoicePersona(VoicePersona.Neutral)), default);

        Assert.Equal(2, starter.Started.Count);
        Assert.Contains("Rick Sanchez", Prompt(0));
        Assert.DoesNotContain("Rick Sanchez", Prompt(1));
    }

    [Fact]
    public async Task A_long_conversation_moves_to_a_new_process()
    {
        var (agent, starter) = Agent();
        var lines = new List<VoiceLine>();

        for (var i = 0; i < ClaudeCodeVoiceAgent.MaxLines / 2 + 1; i++)
        {
            var text = $"Replik {i}";
            var turn = await agent.TurnAsync(new VoiceTurnRequest(text, lines.ToList()), default);
            lines.Add(new VoiceLine("user", text));
            lines.Add(new VoiceLine("assistant", turn.Reply));
        }

        Assert.Equal(2, starter.Started.Count);
        Assert.Contains("Samtalet hittills:", starter.Started[1].LastMessage);
    }

    [Fact]
    public async Task What_the_tools_did_during_the_turn_comes_back_with_the_reply()
    {
        var recorder = factory.Services.GetRequiredService<VoiceTurnRecorder>();
        var confirm = new VoiceConfirm("job", "Rensa valda", []);
        var (agent, _) = Agent(_ =>
        {
            recorder.Record(new ToolOutcome("{}", new VoiceAction("scan_disk", VoiceTiles.Disk, "2 saker", true), confirm));
            return FakeProcess.Result("Förslaget ligger på skärmen.");
        });

        var turn = await agent.TurnAsync(Line("Städa disken"), default);

        Assert.Equal("scan_disk", Assert.Single(turn.Actions).Tool);
        Assert.Equal(confirm, turn.Confirm);
        Assert.False(recorder.Active);
    }

    [Fact]
    public async Task An_error_from_claude_is_passed_on_without_killing_the_process()
    {
        var (agent, starter) = Agent(_ => FakeProcess.Result("Not logged in", isError: true));

        var e = await Assert.ThrowsAsync<VoiceException>(() => agent.TurnAsync(Line("Hej"), default));

        Assert.Equal("Not logged in", e.Message);
        Assert.False(starter.Started.Single().Stopped);
    }

    [Fact]
    public async Task A_crash_mid_reply_says_why_and_the_next_turn_starts_over_with_the_history()
    {
        var starter = default(FakeStarter);
        var crash = true;
        (var agent, starter) = Agent(_ =>
        {
            if (!crash) return FakeProcess.Result("Tillbaka.");
            crash = false;
            starter!.Started[^1].Errors = "segfault";
            starter.Started[^1].Exit();
            return null;
        });

        var e = await Assert.ThrowsAsync<VoiceException>(() => agent.TurnAsync(Line("Hej"), default));
        Assert.Contains("segfault", e.Message);

        var turn = await agent.TurnAsync(Line("Igen", new VoiceLine("user", "Hej")), default);

        Assert.Equal("Tillbaka.", turn.Reply);
        Assert.Equal(2, starter.Started.Count);
        Assert.Contains("Vidar: Hej", starter.Started[1].LastMessage);
    }

    [Fact]
    public async Task No_answer_in_time_stops_the_process_and_says_so()
    {
        var (agent, starter) = Agent(_ => null, timeout: 0.05);

        var e = await Assert.ThrowsAsync<VoiceException>(() => agent.TurnAsync(Line("Hej"), default));

        Assert.True(e.TimedOut);
        Assert.True(starter.Started.Single().Stopped);
    }

    [Fact]
    public async Task A_cancelled_turn_stops_the_process_since_it_is_still_busy()
    {
        var (agent, starter) = Agent(_ => null);
        using var cancel = new CancellationTokenSource();

        var turn = agent.TurnAsync(Line("Hej"), cancel.Token);
        await cancel.CancelAsync();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => turn);
        Assert.True(starter.Started.Single().Stopped);
    }

    [Fact]
    public async Task A_program_that_cannot_start_is_a_voice_error()
    {
        var (agent, starter) = Agent();
        starter.Fail = true;

        var e = await Assert.ThrowsAsync<VoiceException>(() => agent.TurnAsync(Line("Hej"), default));

        Assert.Contains("Kunde inte starta Claude Code", e.Message);
    }

    [Fact]
    public async Task Keeping_warm_starts_a_process_the_next_turn_uses_and_returns_when_it_ends()
    {
        var (agent, starter) = Agent();
        using var stop = new CancellationTokenSource();

        var warm = agent.KeepWarmAsync(stop.Token);
        await agent.TurnAsync(Line("Hej"), default);

        var process = Assert.Single(starter.Started);
        Assert.False(warm.IsCompleted);
        process.Exit();
        await warm;

        var again = agent.KeepWarmAsync(stop.Token);
        Assert.Equal(2, starter.Started.Count);
        await stop.CancelAsync();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => again);
    }

    [Fact]
    public async Task Stopping_ends_the_process()
    {
        var (agent, starter) = Agent();
        await agent.TurnAsync(Line("Hej"), default);

        await agent.StopAsync();

        Assert.True(starter.Started.Single().Stopped);
    }
}

/// <summary>The tools as the <c>claude</c> process sees them, over HTTP.</summary>
public class VoiceMcpTests(ApiTests.Factory factory) : IClassFixture<ApiTests.Factory>
{
    private readonly HttpClient _client = Client(factory);

    private static HttpClient Client(ApiTests.Factory factory)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add(VoiceMcpAccess.HeaderName, factory.Services.GetRequiredService<VoiceMcpAccess>().Token);
        return client;
    }

    private async Task<JsonElement> Call(string method, object? parameters = null)
    {
        var response = await _client.PostAsJsonAsync("/api/voice/mcp", new { jsonrpc = "2.0", id = 7, method, @params = parameters });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var answer = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(7, answer.GetProperty("id").GetInt32());
        return answer;
    }

    [Fact]
    public async Task Without_the_token_nothing_is_answered()
    {
        var anyone = factory.CreateClient();

        var response = await anyone.PostAsJsonAsync("/api/voice/mcp", new { jsonrpc = "2.0", id = 1, method = "tools/list" });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Initialize_agrees_on_the_clients_protocol_version()
    {
        var answer = await Call("initialize", new { protocolVersion = "2099-01-01" });

        var result = answer.GetProperty("result");
        Assert.Equal("2099-01-01", result.GetProperty("protocolVersion").GetString());
        Assert.Equal("veloq", result.GetProperty("serverInfo").GetProperty("name").GetString());
        Assert.True(result.GetProperty("capabilities").TryGetProperty("tools", out _));
    }

    [Fact]
    public async Task A_notification_gets_no_answer()
    {
        var response = await _client.PostAsJsonAsync("/api/voice/mcp", new { jsonrpc = "2.0", method = "notifications/initialized" });

        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
    }

    [Fact]
    public async Task An_unknown_method_is_an_error()
    {
        var answer = await Call("resources/list");

        Assert.Equal(-32601, answer.GetProperty("error").GetProperty("code").GetInt32());
    }

    [Fact]
    public async Task Lists_the_same_tools_as_the_toolbox_with_their_schemas()
    {
        var answer = await Call("tools/list");

        var tools = answer.GetProperty("result").GetProperty("tools").EnumerateArray().ToList();
        var expected = factory.Services.GetRequiredService<VoiceToolbox>().Tools().Select(t => t.Name);
        Assert.Equal(expected, tools.Select(t => t.GetProperty("name").GetString()));
        var create = tools.Single(t => t.GetProperty("name").GetString() == "create_issue");
        Assert.Equal("title", create.GetProperty("inputSchema").GetProperty("required")[0].GetString());
    }

    [Fact]
    public async Task A_tool_outside_a_reply_is_refused()
    {
        var answer = await Call("tools/call", new { name = "clear_noise", arguments = new { } });

        var result = answer.GetProperty("result");
        Assert.True(result.GetProperty("isError").GetBoolean());
        Assert.Equal("Inget samtal pågår.", result.GetProperty("content")[0].GetProperty("text").GetString());
    }

    [Fact]
    public async Task A_tool_during_a_reply_runs_and_is_recorded()
    {
        var recorder = factory.Services.GetRequiredService<VoiceTurnRecorder>();
        recorder.Begin();

        var answer = await Call("tools/call", new { name = "list_issues", arguments = new { } });
        var (actions, _) = recorder.End();

        Assert.False(answer.GetProperty("result").GetProperty("isError").GetBoolean());
        Assert.Contains("VEL-", answer.GetProperty("result").GetProperty("content")[0].GetProperty("text").GetString());
        Assert.Equal("list_issues", Assert.Single(actions).Tool);
    }

    [Fact]
    public async Task A_failing_tool_tells_claude_and_is_recorded_as_failed()
    {
        var recorder = factory.Services.GetRequiredService<VoiceTurnRecorder>();
        recorder.Begin();

        var answer = await Call("tools/call", new { name = "create_issue", arguments = new { } });
        var (actions, _) = recorder.End();

        Assert.True(answer.GetProperty("result").GetProperty("isError").GetBoolean());
        Assert.False(Assert.Single(actions).Ok);
    }
}

/// <summary>Which voice the API picks.</summary>
public class VoiceAgentChoiceTests(ApiTests.Factory factory) : IClassFixture<ApiTests.Factory>
{
    private async Task<VoiceStatus> StatusWith(params (string Key, string Value)[] settings)
    {
        using var configured = factory.WithWebHostBuilder(builder =>
        {
            builder.UseSetting("Claude:ChatHome", Path.Combine(Path.GetTempPath(), $"veloq-chat-{Guid.NewGuid()}"));
            foreach (var (key, value) in settings) builder.UseSetting(key, value);
        });
        return (await configured.CreateClient().GetFromJsonAsync<VoiceStatus>("/api/voice"))!;
    }

    [Fact]
    public async Task With_claude_code_on_the_computer_the_voice_needs_no_key()
    {
        var status = await StatusWith(("Claude:Command", "/usr/bin/true"), ("Voice:Model", "claude-test"));

        Assert.Equal(("claude-code", "claude-test"), (status.Agent, status.Model));
    }

    [Fact]
    public async Task An_api_key_goes_before_claude_code()
    {
        var status = await StatusWith(("Claude:Command", "/usr/bin/true"), ("Voice:AnthropicApiKey", "sk-test"));

        Assert.Equal("claude", status.Agent);
    }
}
