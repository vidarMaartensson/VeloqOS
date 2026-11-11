using Microsoft.Extensions.Options;
using VeloqOS.Api.Integrations.Claude;
using VeloqOS.Api.Services;
using VeloqOS.Api.Services.Chores;

namespace VeloqOS.Api.Tests;

public class OldChatsTests
{
    private sealed class RecordingRunner(CommandResult answer) : ICommandRunner
    {
        public (string File, IReadOnlyList<string> Arguments)? Last { get; private set; }

        public Task<CommandResult> RunAsync(string file, IReadOnlyList<string> arguments, string stdin, string workingDirectory,
            IReadOnlyDictionary<string, string?> environment, TimeSpan timeout, CancellationToken cancellationToken)
        {
            Last = (file, arguments);
            return Task.FromResult(answer);
        }

        public Task<CommandResult> StreamAsync(string file, IReadOnlyList<string> arguments, string stdin, string workingDirectory,
            IReadOnlyDictionary<string, string?> environment, TimeSpan timeout, Func<string, Task> onLine, CancellationToken cancellationToken) =>
            RunAsync(file, arguments, stdin, workingDirectory, environment, timeout, cancellationToken);
    }

    private static Chore OldChats => ChoreCatalog.Builtin.Single(c => c.Id == ChoreCatalog.OldChats);

    private static OldChatsHandler Handler(RecordingRunner runner, string task = "gamla-chattar") =>
        new(Options.Create(new ClaudeOptions { OldChatsTask = task }), runner);

    [Fact]
    public async Task Opens_the_scheduled_task_in_the_Claude_app()
    {
        var runner = new RecordingRunner(new CommandResult(0, "", ""));

        var outcome = await Handler(runner).RunAsync(OldChats, new ChoreContext(null, "/tmp"), default);

        Assert.Equal("/usr/bin/open", runner.Last?.File);
        Assert.Equal(["claude://claude.ai/epitaxy/scheduled/gamla-chattar"], runner.Last?.Arguments);
        Assert.Contains("Kör nu", outcome.Result);
        Assert.Null(outcome.Choices);
    }

    [Fact]
    public async Task Uses_the_configured_task()
    {
        var runner = new RecordingRunner(new CommandResult(0, "", ""));

        await Handler(runner, "städa sidomenyn").RunAsync(OldChats, new ChoreContext(null, "/tmp"), default);

        Assert.Equal(["claude://claude.ai/epitaxy/scheduled/st%C3%A4da%20sidomenyn"], runner.Last?.Arguments);
    }

    [Fact]
    public async Task Fails_when_the_link_does_not_open()
    {
        var runner = new RecordingRunner(new CommandResult(1, "", "No application knows how to open URL"));

        var e = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            Handler(runner).RunAsync(OldChats, new ChoreContext(null, "/tmp"), default));

        Assert.Contains("No application", e.Message);
    }

    [Fact]
    public void Takes_only_its_own_chore()
    {
        var handler = Handler(new RecordingRunner(new CommandResult(0, "", "")));

        Assert.True(handler.Handles(OldChats));
        Assert.False(handler.Handles(ChoreCatalog.Builtin.Single(c => c.Id == ChoreCatalog.WeekSummary)));
    }
}
