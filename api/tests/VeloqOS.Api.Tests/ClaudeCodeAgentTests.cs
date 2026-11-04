using Microsoft.Extensions.Options;
using VeloqOS.Api.Integrations;
using VeloqOS.Api.Integrations.Claude;

namespace VeloqOS.Api.Tests;

public class ClaudeCodeAgentTests : IDisposable
{
    private sealed class FakeRunner(Func<CommandResult> answer) : ICommandRunner
    {
        public IReadOnlyList<string>? Arguments { get; private set; }
        public string? Stdin { get; private set; }
        public string? WorkingDirectory { get; private set; }
        public IReadOnlyDictionary<string, string?>? Environment { get; private set; }

        public Task<CommandResult> RunAsync(string file, IReadOnlyList<string> arguments, string stdin, string workingDirectory,
            IReadOnlyDictionary<string, string?> environment, TimeSpan timeout, CancellationToken cancellationToken)
        {
            Arguments = arguments;
            Stdin = stdin;
            WorkingDirectory = workingDirectory;
            Environment = environment;
            return Task.FromResult(answer());
        }

        public async Task<CommandResult> StreamAsync(string file, IReadOnlyList<string> arguments, string stdin, string workingDirectory,
            IReadOnlyDictionary<string, string?> environment, TimeSpan timeout, Func<string, Task> onLine, CancellationToken cancellationToken)
        {
            var result = await RunAsync(file, arguments, stdin, workingDirectory, environment, timeout, cancellationToken);
            foreach (var line in result.Stdout.Split('\n')) await onLine(line);
            return result;
        }
    }

    private const string Ok = """{"type":"result","is_error":false,"result":"Hej!","session_id":"abc"}""";

    private readonly string _home = Directory.CreateTempSubdirectory("veloq-chat").FullName;

    public void Dispose() => Directory.Delete(_home, recursive: true);

    private ClaudeCodeAgent Agent(FakeRunner runner) =>
        new(Options.Create(new ClaudeOptions { Command = "/bin/claude", ChatHome = _home }), runner);

    [Fact]
    public async Task Chat_runs_without_tools_in_the_chat_home()
    {
        var runner = new FakeRunner(() => new CommandResult(0, Ok, ""));

        var reply = await Agent(runner).ReplyAsync(new AgentRequest("-hej", null, "chat", null, null), CancellationToken.None);

        Assert.Equal(new AgentReply("Hej!", "abc"), reply);
        Assert.Equal(["-p", "--output-format", "json", "--tools", ""], runner.Arguments);
        Assert.Equal("-hej", runner.Stdin); // on stdin, never parsed as a flag
        Assert.Equal(_home, runner.WorkingDirectory);
    }

    [Fact]
    public async Task Code_runs_in_the_folder_with_the_permission_mode_and_resumes()
    {
        var runner = new FakeRunner(() => new CommandResult(0, Ok, ""));

        await Agent(runner).ReplyAsync(new AgentRequest("Fixa", "HaloDeck", "code", _home, "s1"), CancellationToken.None);

        Assert.Equal(
            ["-p", "--output-format", "json", "--permission-mode", "acceptEdits",
             "--append-system-prompt", "Samtalet gäller projektet HaloDeck i Veloq OS.", "--resume", "s1"],
            runner.Arguments);
        Assert.Equal(_home, runner.WorkingDirectory);
    }

    private static string Delta(string text) =>
        "{\"type\":\"stream_event\",\"event\":{\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"" + text + "\"}}}";

    [Fact]
    public async Task Streams_the_text_as_it_comes_and_ends_with_the_result()
    {
        var lines = string.Join('\n', """{"type":"system","subtype":"init"}""", Delta("Hej"), Delta("!"), "inte json", Ok);
        var runner = new FakeRunner(() => new CommandResult(0, lines, ""));
        var deltas = new List<string>();

        var reply = await Agent(runner).StreamAsync(new AgentRequest("hej", null, "chat", null, null), d => { deltas.Add(d); return Task.CompletedTask; }, CancellationToken.None);

        Assert.Equal(["Hej", "!"], deltas);
        Assert.Equal(new AgentReply("Hej!", "abc"), reply);
        Assert.Equal(["-p", "--output-format", "stream-json", "--verbose", "--include-partial-messages", "--tools", ""], runner.Arguments);
    }

    [Fact]
    public async Task A_stream_without_result_is_an_error()
    {
        var runner = new FakeRunner(() => new CommandResult(1, Delta("Hej"), "Not logged in"));

        var error = await Assert.ThrowsAsync<AgentException>(() =>
            Agent(runner).StreamAsync(new AgentRequest("hej", null, "chat", null, null), _ => Task.CompletedTask, CancellationToken.None));

        Assert.Contains("Not logged in", error.Message);
    }

    [Fact]
    public async Task Chat_can_get_exactly_the_tools_it_needs()
    {
        var runner = new FakeRunner(() => new CommandResult(0, Ok, ""));

        await Agent(runner).ReplyAsync(new AgentRequest("Lista", null, "chat", null, null, Tools: ["Artifact"]), CancellationToken.None);

        Assert.Equal(["-p", "--output-format", "json", "--tools", "Artifact", "--allowedTools", "Artifact"], runner.Arguments);
    }

    [Fact]
    public async Task A_chore_overrides_the_permission_mode()
    {
        var runner = new FakeRunner(() => new CommandResult(0, Ok, ""));

        await Agent(runner).ReplyAsync(new AgentRequest("/pr", null, "code", _home, null, "auto"), CancellationToken.None);

        Assert.Equal(["-p", "--output-format", "json", "--permission-mode", "auto"], runner.Arguments);
    }

    [Fact]
    public async Task Runs_on_the_subscription_not_an_api_key()
    {
        var runner = new FakeRunner(() => new CommandResult(0, Ok, ""));

        await Agent(runner).ReplyAsync(new AgentRequest("Hej", null, "chat", null, null), CancellationToken.None);

        Assert.True(runner.Environment!.ContainsKey("ANTHROPIC_API_KEY"));
        Assert.Null(runner.Environment["ANTHROPIC_API_KEY"]);
        Assert.Contains("/opt/homebrew/bin", runner.Environment["PATH"]);
    }

    [Fact]
    public async Task Errors_from_claude_become_agent_exceptions()
    {
        var failing = new FakeRunner(() => new CommandResult(1, """{"is_error":true,"result":"Not logged in"}""", ""));
        var garbage = new FakeRunner(() => new CommandResult(127, "", "command not found"));
        var slow = new FakeRunner(() => throw new TimeoutException("för långsamt"));
        var request = new AgentRequest("Hej", null, "chat", null, null);

        Assert.Equal("Not logged in", (await Assert.ThrowsAsync<AgentException>(() => Agent(failing).ReplyAsync(request, default))).Message);
        Assert.Contains("command not found", (await Assert.ThrowsAsync<AgentException>(() => Agent(garbage).ReplyAsync(request, default))).Message);
        Assert.True((await Assert.ThrowsAsync<AgentException>(() => Agent(slow).ReplyAsync(request, default))).TimedOut);
    }

    [Fact]
    public void Empty_command_means_no_claude()
    {
        Assert.Null(new ClaudeOptions { Command = "" }.ResolvedCommand);
        Assert.Equal("/x/claude", new ClaudeOptions { Command = "/x/claude" }.ResolvedCommand);
    }
}
