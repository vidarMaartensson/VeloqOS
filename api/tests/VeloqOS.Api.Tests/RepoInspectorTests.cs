using VeloqOS.Api.Integrations;
using VeloqOS.Api.Integrations.Claude;

namespace VeloqOS.Api.Tests;

public class RepoInspectorTests
{
    /// <summary>Answers git and gh by their first two arguments; anything unscripted fails like a missing upstream would.</summary>
    private sealed class ScriptedRunner(Dictionary<string, string> answers) : ICommandRunner
    {
        public List<string> Calls { get; } = [];

        public Task<CommandResult> RunAsync(string file, IReadOnlyList<string> arguments, string stdin, string workingDirectory,
            IReadOnlyDictionary<string, string?> environment, TimeSpan timeout, CancellationToken cancellationToken)
        {
            var key = $"{Path.GetFileName(file)} {string.Join(' ', arguments.Take(2))}";
            Calls.Add(key);
            return Task.FromResult(answers.TryGetValue(key, out var stdout) ? new CommandResult(0, stdout, "") : new CommandResult(128, "", "fatal"));
        }

        public Task<CommandResult> StreamAsync(string file, IReadOnlyList<string> arguments, string stdin, string workingDirectory,
            IReadOnlyDictionary<string, string?> environment, TimeSpan timeout, Func<string, Task> onLine, CancellationToken cancellationToken) =>
            throw new NotSupportedException();
    }

    private static readonly Project VeloqOs = new("veloq-os", "Veloq OS", "", "", 3, "", "", "/repos/VeloqOS");

    private static Dictionary<string, string> Repo(string? runs = null) => new()
    {
        ["git rev-parse --abbrev-ref"] = "feature/x\n",
        ["git status --porcelain"] = " M a.cs\n?? b.cs\n",
        ["git rev-list --count"] = "2\n",
        ["git log -1"] = "Add skills\u001f2026-10-30T09:00:00+01:00\n",
        ["gh pr list"] = """[{"number":1},{"number":2}]""",
        ["gh run list"] = runs ?? """[{"status":"completed","conclusion":"failure","url":"https://github.com/v/r/actions/runs/1"}]""",
    };

    private readonly ManualTimeProvider _time = new(DateTimeOffset.UnixEpoch);

    [Fact]
    public async Task Reads_git_and_github()
    {
        var status = await new RepoInspector(new ScriptedRunner(Repo()), _time, "/opt/homebrew/bin/gh").InspectAsync(VeloqOs, false, default);

        Assert.Equal(new ProjectStatus("veloq-os", "feature/x", 2, 2, new LastCommit("Add skills", DateTimeOffset.Parse("2026-10-30T09:00:00+01:00")),
            2, CiStates.Failing, "https://github.com/v/r/actions/runs/1", true, null), status);
    }

    [Fact]
    public async Task Without_upstream_or_gh_those_parts_are_unknown()
    {
        var answers = Repo();
        answers.Remove("git rev-list --count");
        answers["git status --porcelain"] = "";

        var status = await new RepoInspector(new ScriptedRunner(answers), _time, gh: null).InspectAsync(VeloqOs, false, default);

        Assert.Null(status.Ahead);
        Assert.Null(status.PullRequests);
        Assert.Null(status.Ci);
        Assert.False(status.Attention);
    }

    [Fact]
    public async Task A_folder_that_is_not_a_repo_says_so()
    {
        var status = await new RepoInspector(new ScriptedRunner([]), _time, "gh").InspectAsync(VeloqOs, false, default);

        Assert.Equal("Inget git-repo.", status.Error);
        Assert.Null(status.Branch);
    }

    [Fact]
    public async Task GitHub_is_asked_once_a_minute_unless_refreshed()
    {
        var runner = new ScriptedRunner(Repo());
        var inspector = new RepoInspector(runner, _time, "gh");

        await inspector.InspectAsync(VeloqOs, false, default);
        await inspector.InspectAsync(VeloqOs, false, default);
        Assert.Equal(1, runner.Calls.Count(c => c == "gh pr list"));

        await inspector.InspectAsync(VeloqOs, refresh: true, default);
        _time.Advance(TimeSpan.FromMinutes(2));
        await inspector.InspectAsync(VeloqOs, false, default);
        Assert.Equal(3, runner.Calls.Count(c => c == "gh pr list"));
    }

    [Theory]
    [InlineData("""[{"status":"in_progress","conclusion":"","url":"u"}]""", "running")]
    [InlineData("""[{"status":"completed","conclusion":"success","url":"u"}]""", "passing")]
    [InlineData("""[{"status":"completed","conclusion":"cancelled","url":"u"}]""", "failing")]
    [InlineData("[]", null)]
    [InlineData("inte json", null)]
    public void Reads_the_newest_ci_run(string json, string? expected)
    {
        Assert.Equal(expected, RepoInspector.ParseRun(json).Ci);
    }
}
