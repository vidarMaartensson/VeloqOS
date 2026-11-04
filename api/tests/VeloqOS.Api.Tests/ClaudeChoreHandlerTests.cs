using Microsoft.Extensions.Options;
using VeloqOS.Api.Integrations;
using VeloqOS.Api.Integrations.Claude;
using VeloqOS.Api.Services.Chores;

namespace VeloqOS.Api.Tests;

public class ClaudeChoreHandlerTests
{
    private sealed class RecordingAgent : IAgent
    {
        public List<AgentRequest> Requests { get; } = [];
        public string Reply { get; set; } = "ok";

        public Task<AgentReply> ReplyAsync(AgentRequest request, CancellationToken cancellationToken)
        {
            Requests.Add(request);
            return Task.FromResult(new AgentReply(Reply, "session-1"));
        }

        public async Task<AgentReply> StreamAsync(AgentRequest request, Func<string, Task> onDelta, CancellationToken cancellationToken)
        {
            var reply = await ReplyAsync(request, cancellationToken);
            await onDelta(reply.Text);
            return reply;
        }
    }

    private static readonly Project VeloqOs = new("veloq-os", "Veloq OS", "", "", 3, "", "", "/repos/VeloqOS");

    private readonly RecordingAgent _agent = new();
    private readonly ClaudeChoreHandler _handler;

    public ClaudeChoreHandlerTests() =>
        _handler = new ClaudeChoreHandler(_agent, Options.Create(new ClaudeOptions { ChorePermissionMode = "auto" }));

    private static Chore Builtin(string id) => ChoreCatalog.Builtin.Single(c => c.Id == id);

    [Fact]
    public async Task A_skill_runs_as_its_slash_command_in_the_projects_folder()
    {
        var skill = SkillReader.Parse("ny-branch", "---\nname: ny-branch\n---\n")!;

        var outcome = await _handler.RunAsync(skill, new ChoreContext(VeloqOs, "/repos/VeloqOS", " feature/x "), default);

        var request = Assert.Single(_agent.Requests);
        Assert.Equal("/ny-branch feature/x", request.Text);
        Assert.Equal(AgentModes.Code, request.Mode);
        Assert.Equal("/repos/VeloqOS", request.WorkingDirectory);
        Assert.Equal("Veloq OS", request.Context);
        Assert.Equal("auto", request.PermissionMode);
        Assert.Null(request.SessionId);
        Assert.Equal("ok", outcome.Result);
        Assert.Null(outcome.Choices);
    }

    [Fact]
    public async Task A_skill_without_argument_is_just_the_command()
    {
        await _handler.RunAsync(SkillReader.Parse("pr", "")!, new ChoreContext(null, "/home/code"), default);

        Assert.Equal("/pr", _agent.Requests.Single().Text);
    }

    [Fact]
    public async Task Unused_packages_asks_for_choices_and_returns_them()
    {
        _agent.Reply = "Två paket används inte.\n\n```veloq-choices\n[{\"id\":\"web-lodash\",\"label\":\"lodash\",\"detail\":\"web · npm\"},{\"id\":\"api-polly\",\"label\":\"Polly\",\"detail\":\"api · NuGet\"}]\n```";

        var outcome = await _handler.RunAsync(Builtin(ChoreCatalog.UnusedPackages), new ChoreContext(VeloqOs, "/repos/VeloqOS"), default);

        Assert.Contains("veloq-choices", _agent.Requests.Single().Text);
        Assert.Equal("Två paket används inte.", outcome.Result);
        Assert.Equal(["web-lodash", "api-polly"], outcome.Choices!.Select(c => c.Id));
        Assert.Equal("Ta bort valda", outcome.Confirm);
        Assert.Equal("session-1", outcome.SessionId);
    }

    [Fact]
    public async Task Nothing_found_means_nothing_to_confirm()
    {
        _agent.Reply = "Allt används.\n```veloq-choices\n[]\n```";

        var outcome = await _handler.RunAsync(Builtin(ChoreCatalog.UnusedPackages), new ChoreContext(VeloqOs, "/repos/VeloqOS"), default);

        Assert.Null(outcome.Choices);
        Assert.Null(outcome.Confirm);
    }

    [Fact]
    public async Task Confirming_resumes_the_session_with_the_picked_choices()
    {
        var proposal = new ChoreOutcome("…", [new("web-lodash", "lodash", "web · npm")], "Ta bort valda", "session-7");

        await _handler.ConfirmAsync(Builtin(ChoreCatalog.UnusedPackages), new ChoreContext(VeloqOs, "/repos/VeloqOS"), proposal,
            [new("web-lodash", "lodash", "web · npm")], default);

        var request = _agent.Requests.Single();
        Assert.Equal("session-7", request.SessionId);
        Assert.StartsWith("Ta bort de här beroendena", request.Text);
        Assert.EndsWith("- lodash (web · npm)", request.Text);
        Assert.Equal("auto", request.PermissionMode);
    }

    [Fact]
    public async Task Dependencies_without_a_project_covers_every_repo()
    {
        await _handler.RunAsync(Builtin(ChoreCatalog.Dependencies), new ChoreContext(null, "/repos"), default);

        Assert.StartsWith("Gå igenom alla git-repon", _agent.Requests.Single().Text);
        Assert.Equal("/repos", _agent.Requests.Single().WorkingDirectory);
    }

    [Fact]
    public void A_broken_choices_block_gives_no_choices_but_keeps_the_text()
    {
        var (text, choices) = ClaudeChoreHandler.SplitChoices("Svar.\n```veloq-choices\n[{trasig\n```");

        Assert.Equal("Svar.", text);
        Assert.Empty(choices);
    }

    [Fact]
    public void Choices_without_id_or_label_and_duplicates_are_dropped()
    {
        var (_, choices) = ClaudeChoreHandler.SplitChoices(
            "```veloq-choices\n[{\"id\":\"a\",\"label\":\"A\"},{\"id\":\"a\",\"label\":\"A2\"},{\"id\":\"\",\"label\":\"B\"},{\"id\":\"c\"}]\n```");

        var only = Assert.Single(choices);
        Assert.Equal(new JobChoice("a", "A", ""), only);
    }
}
